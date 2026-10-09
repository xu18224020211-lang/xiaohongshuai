import { Router, type Request, type Response } from 'express';
import { db } from '../db';
import { requireAuth, type AuthedRequest } from '../middleware';
import { isGlobalAdmin } from '../scope';

export const assetTagsRouter = Router();
assetTagsRouter.use(requireAuth);

/** 素材类型（可增删改）：code 对应 assets.type */
assetTagsRouter.get('/types', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM assets a WHERE a.type = t.code) AS asset_count
         FROM asset_types t ORDER BY t.sort, t.code`
    )
    .all();
  res.json({ types: rows });
});

assetTagsRouter.post('/types', (req, res) => {
  if (!ensureAdmin(req, res)) return;
  const { name, code } = (req.body || {}) as { name?: string; code?: string };
  if (!name || !name.trim()) return res.status(400).json({ error: '类型名不能为空' });
  const key = (code && code.trim()) || `custom_${Date.now().toString(36)}`;
  if (db.prepare('SELECT code FROM asset_types WHERE code = ?').get(key)) return res.status(409).json({ error: '该类型已存在' });
  const max = db.prepare('SELECT COALESCE(MAX(sort), 0) AS s FROM asset_types').get() as { s: number };
  db.prepare('INSERT INTO asset_types (code, name, sort) VALUES (?, ?, ?)').run(key, name.trim(), max.s + 1);
  res.status(201).json({ type: { code: key, name: name.trim() } });
});

assetTagsRouter.patch('/types/:code', (req, res) => {
  if (!ensureAdmin(req, res)) return;
  const code = String(req.params.code);
  if (!db.prepare('SELECT code FROM asset_types WHERE code = ?').get(code)) return res.status(404).json({ error: '类型不存在' });
  const { name } = (req.body || {}) as { name?: string };
  if (!name || !name.trim()) return res.status(400).json({ error: '类型名不能为空' });
  db.prepare('UPDATE asset_types SET name = ? WHERE code = ?').run(name.trim(), code);
  res.json({ ok: true });
});

assetTagsRouter.delete('/types/:code', (req, res) => {
  if (!ensureAdmin(req, res)) return;
  const code = String(req.params.code);
  const used = db.prepare('SELECT COUNT(*) AS n FROM assets WHERE type = ?').get(code) as { n: number };
  if (used.n > 0) return res.status(400).json({ error: `还有 ${used.n} 个素材在使用该类型，请先改到其它类型` });
  db.prepare('DELETE FROM asset_types WHERE code = ?').run(code);
  res.json({ ok: true });
});

/** 素材标签（可增删改）：勾选形式用于素材 */
assetTagsRouter.get('/', (req, res) => {
  // kind=product|sticker：只取该大类的标签（含通用标签，kind 为空）
  const kind = req.query.kind as string | undefined;
  const where = kind === 'product' || kind === 'sticker' ? "WHERE t.kind IS NULL OR t.kind = '' OR t.kind = ?" : '';
  const params: string[] = kind === 'product' || kind === 'sticker' ? [kind] : [];
  const rows = db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM asset_tag_links l WHERE l.tag_id = t.id) AS asset_count
         FROM asset_tags t ${where} ORDER BY t.sort, t.id`
    )
    .all(...params);
  res.json({ tags: rows });
});

function ensureAdmin(req: Request, res: Response): boolean {
  const u = (req as AuthedRequest).user!;
  if (!isGlobalAdmin(u)) {
    res.status(403).json({ error: '仅管理员可管理素材标签' });
    return false;
  }
  return true;
}

assetTagsRouter.post('/', (req, res) => {
  if (!ensureAdmin(req, res)) return;
  const { name, kind } = (req.body || {}) as { name?: string; kind?: string };
  if (!name || !name.trim()) return res.status(400).json({ error: '标签名不能为空' });
  const k = kind === 'product' || kind === 'sticker' ? kind : null;
  if (db.prepare('SELECT id FROM asset_tags WHERE name = ? AND IFNULL(kind, \'\') = IFNULL(?, \'\')').get(name.trim(), k)) {
    return res.status(409).json({ error: '该标签已存在' });
  }
  const max = db.prepare('SELECT COALESCE(MAX(sort), 0) AS s FROM asset_tags').get() as { s: number };
  const info = db.prepare('INSERT INTO asset_tags (name, sort, kind) VALUES (?, ?, ?)').run(name.trim(), max.s + 1, k);
  res.status(201).json({ tag: { id: Number(info.lastInsertRowid), name: name.trim(), kind: k } });
});

assetTagsRouter.patch('/:id', (req, res) => {
  if (!ensureAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM asset_tags WHERE id = ?').get(id)) return res.status(404).json({ error: '标签不存在' });
  const { name, kind } = (req.body || {}) as { name?: string; kind?: string | null };
  if (!name || !name.trim()) return res.status(400).json({ error: '标签名不能为空' });
  const k = kind === 'product' || kind === 'sticker' ? kind : kind === null ? null : undefined;
  const dup = db.prepare('SELECT id FROM asset_tags WHERE name = ? AND id <> ?').get(name.trim(), id);
  if (dup) return res.status(409).json({ error: '该标签已存在' });
  if (k === undefined) db.prepare('UPDATE asset_tags SET name = ? WHERE id = ?').run(name.trim(), id);
  else db.prepare('UPDATE asset_tags SET name = ?, kind = ? WHERE id = ?').run(name.trim(), k, id);
  res.json({ ok: true });
});

assetTagsRouter.delete('/:id', (req, res) => {
  if (!ensureAdmin(req, res)) return;
  const id = Number(req.params.id);
  db.prepare('DELETE FROM asset_tag_links WHERE tag_id = ?').run(id);
  db.prepare('DELETE FROM asset_tags WHERE id = ?').run(id);
  res.json({ ok: true });
});
