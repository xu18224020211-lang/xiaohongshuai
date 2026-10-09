import { Router } from 'express';
import { db } from '../db';
import { requireAuth, type AuthedRequest } from '../middleware';
import { diskPathOf, purgeExpiredTrash, TRASH_KEEP_HOURS } from '../storage';
import fs from 'node:fs';

export const trashRouter = Router();
trashRouter.use(requireAuth);

function ensureSuper(req: Parameters<typeof requireAuth>[0], res: { status: (n: number) => { json: (b: unknown) => void } }): boolean {
  const u = (req as AuthedRequest).user!;
  if (u.role !== 'super_admin') {
    res.status(403).json({ error: '只有超管可以查看/恢复回收站' });
    return false;
  }
  return true;
}

type TrashItem = {
  id: number;
  kind: 'asset' | 'template';
  url: string;
  name: string | null;
  type: string | null;
  brand_name: string | null;
  project_name: string | null;
  deleted_at: string;
};

/** 回收站列表（仅超管）：素材 + 模板，36 小时后自动清理 */
trashRouter.get('/', (req, res) => {
  if (!ensureSuper(req, res)) return;
  const assets = db
    .prepare(
      `SELECT a.id, a.url, a.name, a.type, b.name AS brand_name, p.name AS project_name, a.deleted_at
         FROM assets a LEFT JOIN brands b ON b.id = a.brand_id LEFT JOIN projects p ON p.id = a.project_id
        WHERE a.deleted_at IS NOT NULL ORDER BY a.deleted_at DESC`
    )
    .all() as Omit<TrashItem, 'kind'>[];
  const templates = db
    .prepare(
      `SELECT r.id, r.url, r.name, NULL AS type, b.name AS brand_name, p.name AS project_name, r.deleted_at
         FROM reference_images r LEFT JOIN brands b ON b.id = r.brand_id LEFT JOIN projects p ON p.id = r.project_id
        WHERE r.deleted_at IS NOT NULL ORDER BY r.deleted_at DESC`
    )
    .all() as Omit<TrashItem, 'kind'>[];
  res.json({
    keep_hours: TRASH_KEEP_HOURS,
    assets: assets.map((a) => ({ ...a, kind: 'asset' })),
    templates: templates.map((t) => ({ ...t, kind: 'template' })),
  });
});

/** 恢复（仅超管） */
trashRouter.post('/restore', (req, res) => {
  if (!ensureSuper(req, res)) return;
  const { kind, id } = (req.body || {}) as { kind?: string; id?: number };
  const n = Number(id);
  if (!n) return res.status(400).json({ error: '缺少 id' });
  if (kind === 'template') {
    const r = db.prepare('SELECT id FROM reference_images WHERE id = ? AND deleted_at IS NOT NULL').get(n);
    if (!r) return res.status(404).json({ error: '回收站里没有该模板' });
    db.prepare('UPDATE reference_images SET deleted_at = NULL WHERE id = ?').run(n);
  } else {
    const r = db.prepare('SELECT id FROM assets WHERE id = ? AND deleted_at IS NOT NULL').get(n);
    if (!r) return res.status(404).json({ error: '回收站里没有该素材' });
    db.prepare('UPDATE assets SET deleted_at = NULL WHERE id = ?').run(n);
  }
  res.json({ ok: true });
});

/** 彻底删除（仅超管）：连文件一起删 */
trashRouter.post('/purge', (req, res) => {
  if (!ensureSuper(req, res)) return;
  const { kind, id } = (req.body || {}) as { kind?: string; id?: number };
  const n = Number(id);
  if (!n) return res.status(400).json({ error: '缺少 id' });
  const table = kind === 'template' ? 'reference_images' : 'assets';
  const row = db.prepare(`SELECT id, url FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`).get(n) as
    | { id: number; url: string }
    | undefined;
  if (!row) return res.status(404).json({ error: '回收站里没有该记录' });
  const p = diskPathOf(row.url);
  if (p) { try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ } }
  if (table === 'assets') db.prepare('DELETE FROM asset_tag_links WHERE asset_id = ?').run(n);
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(n);
  res.json({ ok: true });
});

/** 立即清理过期回收站（仅超管手动触发；服务端也会自动定时清理） */
trashRouter.post('/sweep', (req, res) => {
  if (!ensureSuper(req, res)) return;
  res.json({ ok: true, ...purgeExpiredTrash() });
});
