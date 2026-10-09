import { Router } from 'express';
import { db } from '../db';
import { requireAuth, type AuthedRequest } from '../middleware';
import { assetFilter, rowInScope } from '../scope';

export const generationsRouter = Router();
generationsRouter.use(requireAuth);

// AI 生成历史（按角色可见性）
generationsRouter.get('/', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const { sql, params } = assetFilter(u);
  const kind = req.query.kind as string | undefined;
  const mine = req.query.mine === '1' || req.query.mine === 'true';
  let where = sql;
  const p = [...params];
  if (kind === 'scene' || kind === 'text') {
    where += ' AND kind = ?';
    p.push(kind);
  }
  // mine=1：只看「我自己生成的」记录（画布右侧历史用）
  if (mine) { where += ' AND created_by = ?'; p.push(u.id); }
  const rows = db
    .prepare(`SELECT * FROM generations WHERE ${where} ORDER BY id DESC LIMIT 200`)
    .all(...p);
  res.json({ generations: rows });
});

generationsRouter.delete('/:id', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const id = Number(req.params.id);
  const g = db.prepare('SELECT brand_id, project_id FROM generations WHERE id = ?').get(id) as
    | { brand_id: number | null; project_id: number | null }
    | undefined;
  if (!g || !rowInScope(u, g.project_id)) return res.status(403).json({ error: '无权删除该记录' });
  db.prepare('DELETE FROM generations WHERE id = ?').run(id);
  res.json({ ok: true });
});
