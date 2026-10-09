import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { config } from '../config';

export interface AiConfigRow {
  endpoint: string;
  api_key: string;
  model: string;
  timeout_ms: number;
}

export function getAiConfig(): AiConfigRow {
  const row = db
    .prepare('SELECT endpoint, api_key, model, timeout_ms FROM ai_config WHERE id = 1')
    .get() as AiConfigRow | undefined;
  if (row && row.endpoint) return row;
  return {
    endpoint: config.ai.endpoint,
    api_key: config.ai.apiKey,
    model: config.ai.model,
    timeout_ms: config.ai.timeoutMs,
  };
}

export function saveAiConfig(cfg: AiConfigRow): void {
  db.prepare(
    `INSERT INTO ai_config (id, endpoint, api_key, model, timeout_ms, updated_at)
     VALUES (1, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       endpoint = excluded.endpoint,
       api_key = excluded.api_key,
       model = excluded.model,
       timeout_ms = excluded.timeout_ms,
       updated_at = datetime('now')`
  ).run(cfg.endpoint, cfg.api_key, cfg.model, cfg.timeout_ms);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 把 AI 返回的公网 URL 下载到本地上传目录，返回 /uploads/xxx（同源，便于画布导出） */
export async function ingestRemoteImage(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('下载生成图失败: HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const filename = `gen-${Date.now()}-${randomUUID().slice(0, 8)}.png`;
  fs.writeFileSync(path.join(config.uploadDir, filename), buf);
  return `/uploads/${filename}`;
}

export interface GenerateOptions {
  prompt: string;
  size?: string;
  referenceImages?: string[];
}

export async function generateImage(opts: GenerateOptions): Promise<{ url: string; cost: number }> {
  const cfg = getAiConfig();
  const body: Record<string, unknown> = {
    model: cfg.model,
    prompt: opts.prompt,
    params: {
      quality: 'auto',
      size: opts.size || 'auto',
    },
  };
  if (opts.referenceImages && opts.referenceImages.length) {
    (body.params as Record<string, unknown>).images = opts.referenceImages;
  }

  const createRes = await fetch(`${cfg.endpoint}/v1/media/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.api_key}` },
    body: JSON.stringify(body),
  });
  if (!createRes.ok) {
    const t = await createRes.text();
    throw new Error(`AI 创建任务失败 HTTP ${createRes.status}: ${t.slice(0, 300)}`);
  }
  const created = (await createRes.json()) as { data?: { task_id?: number | string } };
  const taskId = created?.data?.task_id;
  if (taskId === undefined || taskId === null) {
    throw new Error('AI 响应缺少 task_id: ' + JSON.stringify(created).slice(0, 300));
  }

  const deadline = Date.now() + cfg.timeout_ms;
  for (;;) {
    if (Date.now() > deadline) throw new Error('AI 生成超时');
    await sleep(3000);
    const sRes = await fetch(`${cfg.endpoint}/v1/media/status?task_id=${taskId}`, {
      headers: { Authorization: `Bearer ${cfg.api_key}` },
    });
    if (!sRes.ok) throw new Error('AI 查询状态失败 HTTP ' + sRes.status);
    const st = (await sRes.json()) as {
      is_final?: boolean;
      state?: string;
      result_url?: string;
      error?: string;
      status?: string;
      cost?: number;
    };
    if (st.is_final === true) {
      if (st.state === 'success' && st.result_url) {
        const local = await ingestRemoteImage(st.result_url);
        return { url: local, cost: Number(st.cost || 0) };
      }
      throw new Error('AI 生成失败: ' + (st.error || st.status || st.state));
    }
  }
}
