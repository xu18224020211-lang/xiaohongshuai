import fs from 'node:fs';
import path from 'node:path';
import { db } from './db';
import { config } from './config';

/**
 * 上传文件存储：
 * - uploads/assets/YYYYMM/     素材（后台素材、画布上传）
 * - uploads/templates/YYYYMM/  模板（参考图）
 * - uploads/misc/YYYYMM/       其它临时上传（例如 Logo）
 * - uploads/legacy/            历史文件（已归档）
 * 回收站里的素材/模板，删除 36 小时后连文件一起清掉。
 */
export const TRASH_KEEP_HOURS = 36;

const month = () => new Date().toISOString().slice(0, 7).replace('-', '');

export type UploadKind = 'assets' | 'templates' | 'misc';

export function uploadDirFor(kind: UploadKind): string {
  const dir = path.join(config.uploadDir, kind, month());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 保存文件的公开 URL（例如 /uploads/assets/202609/asset-xxx.png） */
export function publicUrlFor(kind: UploadKind, filename: string): string {
  return `/uploads/${kind}/${month()}/${filename}`;
}

/** 把 /uploads/xxx 的 URL 转成磁盘路径（防目录穿越） */
export function diskPathOf(url: string): string | null {
  if (!url || !url.startsWith('/uploads/')) return null;
  const rel = url.replace('/uploads/', '').replace(/\.\./g, '');
  return path.join(config.uploadDir, rel);
}

function unlinkQuiet(url: string) {
  const p = diskPathOf(url);
  if (!p) return;
  try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
}

/** 回收站到期清理：删除超过 36 小时的素材/模板（连文件） */
export function purgeExpiredTrash(): { assets: number; templates: number } {
  const cutoff = `-${TRASH_KEEP_HOURS} hours`;
  const assets = db
    .prepare(`SELECT id, url FROM assets WHERE deleted_at IS NOT NULL AND deleted_at <= datetime('now', ?)`)
    .all(cutoff) as { id: number; url: string }[];
  for (const a of assets) {
    unlinkQuiet(a.url);
    db.prepare('DELETE FROM asset_tag_links WHERE asset_id = ?').run(a.id);
    db.prepare('DELETE FROM assets WHERE id = ?').run(a.id);
  }
  const tpls = db
    .prepare(`SELECT id, url FROM reference_images WHERE deleted_at IS NOT NULL AND deleted_at <= datetime('now', ?)`)
    .all(cutoff) as { id: number; url: string }[];
  for (const t of tpls) {
    unlinkQuiet(t.url);
    db.prepare('DELETE FROM reference_images WHERE id = ?').run(t.id);
  }
  return { assets: assets.length, templates: tpls.length };
}

/**
 * 清理没有被任何数据引用的孤儿文件（默认只清 24 小时前的，避免删掉刚上传还没入库的图）。
 * legacy/ 目录里的历史文件同样按引用判断。
 */
export function purgeOrphanFiles(minAgeHours = 24): number {
  const refs = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v !== 'string') return;
    for (const m of v.matchAll(/\/uploads\/([A-Za-z0-9._\-/]+)/g)) refs.add(path.basename(m[1]));
  };
  for (const r of db.prepare('SELECT url FROM assets').all() as { url: string }[]) add(r.url);
  for (const r of db.prepare('SELECT url FROM reference_images').all() as { url: string }[]) add(r.url);
  for (const r of db.prepare('SELECT url FROM generations').all() as { url: string }[]) add(r.url);
  for (const r of db.prepare('SELECT logo_url FROM brands').all() as { logo_url: string | null }[]) add(r.logo_url);
  for (const r of db.prepare('SELECT logo_url FROM settings').all() as { logo_url: string | null }[]) add(r.logo_url);
  for (const r of db.prepare('SELECT layers_json FROM designs').all() as { layers_json: string | null }[]) add(r.layers_json);
  // 尚未被引用但刚上传的文件（AI 生成中间产物）保留一段时间
  const cutoff = Date.now() - minAgeHours * 3600 * 1000;
  let removed = 0;
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      if (refs.has(entry.name)) continue;
      try {
        if (fs.statSync(p).mtimeMs > cutoff) continue;
        fs.unlinkSync(p);
        removed++;
      } catch { /* ignore */ }
    }
  };
  walk(config.uploadDir);
  return removed;
}
