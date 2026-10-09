import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db';
import { requireAuth, type AuthedRequest } from '../middleware';
import { generateImage } from '../services/ai';
import { config } from '../config';

export const aiRouter = Router();
aiRouter.use(requireAuth);

/** 把本地 /uploads/xxx 参考图转成 data URI（AI 网关需要公网直链或内联 base64） */
function toDataUri(ref: string): string {
  if (!ref) return ref;
  if (/^(https?:\/\/|data:)/.test(ref)) return ref;
  // 支持分类子目录（/uploads/templates/202609/xxx.jpg）与历史文件（/uploads/legacy/xxx.jpg）
  const rel = ref.replace(/^\/uploads\//, '').replace(/\.\./g, '');
  const candidates = [path.join(config.uploadDir, rel), path.join(config.uploadDir, path.basename(ref))];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const ext = path.extname(p).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
    return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
  }
  return ref;
}

/**
 * 画布像素 → 合法的出图尺寸（保持画布比例）。
 *
 * 上游网关对 size 的约束（错误信息原文）：
 *   「比例须在 1:3~3:1 之间、总像素 655360~8294400、单边不超过 3840，或传 auto」
 * 注意它只接受「宽x高」这种像素写法，不接受 "1:1" 这类比例字符串，
 * 所以这里按画布比例换算出满足上述约束的像素尺寸。
 */
function sizeFromCanvas(w: number, h: number): string {
  const cw = Math.max(1, w);
  const ch = Math.max(1, h);

  const MIN_AREA = 655360;
  const MAX_AREA = 8294400;
  const MAX_SIDE = 3840;
  const round16 = (v: number) => Math.max(16, Math.round(v / 16) * 16);

  // 1) 先按面积上限内的最大可用来放大，保证清晰度；再校验比例上下限
  let ratio = cw / ch;
  // 比例限制 1:3 ~ 3:1（超出则夹到边界，避免上游直接拒收）
  ratio = Math.min(3, Math.max(1 / 3, ratio));

  // 目标总像素取上限附近（尽量清晰），据此反推宽高
  let targetArea = MAX_AREA;
  let W = Math.sqrt(targetArea * ratio);
  let H = targetArea / W;

  // 2) 单边超限 → 按最长边收敛到 3840
  const maxSide = Math.max(W, H);
  if (maxSide > MAX_SIDE) {
    const k = MAX_SIDE / maxSide;
    W *= k;
    H *= k;
  }

  W = round16(W);
  H = round16(H);

  // 3) 面积不足下限 → 等比放大到满足下限
  for (let i = 0; i < 12 && W * H < MIN_AREA; i++) {
    W = round16(W * 1.1);
    H = round16(H * 1.1);
  }
  // 面积超上限 → 等比缩小
  for (let i = 0; i < 12 && W * H > MAX_AREA; i++) {
    W = round16(W * 0.9);
    H = round16(H * 0.9);
  }
  // 单边再兜底一次
  if (W > MAX_SIDE || H > MAX_SIDE) {
    const k = MAX_SIDE / Math.max(W, H);
    W = round16(W * k);
    H = round16(H * k);
  }

  return `${W}x${H}`;
}

/**
 * 统一 AI 生成网关（生成结果自动写入历史记录 generations）。
 * body: { kind: 'scene'|'text', prompt, size?, project_id?, referenceImages?, canvas_width?, canvas_height? }
 *  - scene: 无参考图时生成纯环境背景；带参考图（产品PNG）时生成“包含该产品”的场景背景
 *  - text : 文字样式图（Layer 3）
 *
 * 提示词完全由前端提供（模板提示词 + 后台模板标签配置的默认提示词，用户可改），
 * 服务端不再内置拼接任何说明文字。
 */
aiRouter.post('/generate', async (req, res) => {
  const u = (req as AuthedRequest).user!;
  const { kind, prompt, size, referenceImages, project_id, canvas_width, canvas_height } = (req.body || {}) as {
    kind?: string;
    prompt?: string;
    size?: string;
    referenceImages?: string[];
    project_id?: number;
    /** 画布尺寸：用于按画布比例出图 */
    canvas_width?: number;
    canvas_height?: number;
  };
  if (!kind || !prompt) return res.status(400).json({ error: '缺少 kind 或 prompt' });

  const refs = (referenceImages || []).map(toDataUri);

  if (kind !== 'scene' && kind !== 'text') return res.status(400).json({ error: 'kind 须为 scene 或 text' });
  // 原样使用前端提示词（模板提示词 + 标签默认提示词，用户可编辑）
  const finalPrompt = String(prompt).trim();
  // 出图尺寸：所有 AI 生图（A/B 类的背景图与文字样式图）一律以画布比例为准。
  // 上游只接受「宽x高」像素写法（或 auto），不接受 "1:1" 这类比例字符串，
  // 因此这里按画布比例换算出满足上游约束的像素尺寸。
  const finalSize =
    canvas_width && canvas_height
      ? sizeFromCanvas(Number(canvas_width), Number(canvas_height))
      : size || 'auto';

  let brandId: number | null = u.brand_id;
  let projectId: number | null = project_id ?? null;
  if (projectId) {
    const p = db.prepare('SELECT brand_id FROM projects WHERE id = ?').get(projectId) as
      | { brand_id: number }
      | undefined;
    if (p) brandId = p.brand_id;
  }

  try {
    const result = await generateImage({ prompt: finalPrompt, size: finalSize, referenceImages: refs });
    db.prepare(
      'INSERT INTO generations (brand_id, project_id, kind, prompt, url, size, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      brandId,
      projectId,
      kind,
      prompt,
      result.url,
      finalSize || 'auto',
      u.id
    );
    res.json({ url: result.url, cost: result.cost, usedPrompt: finalPrompt });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'AI 生成失败' });
  }
});
