import { Router } from 'express';
import { db } from '../db';
import { requireAuth, type AuthedRequest } from '../middleware';
import { canAccessProject, designFilter } from '../scope';

export const designsRouter = Router();
designsRouter.use(requireAuth);

designsRouter.get('/', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const { sql: whereBase, params: baseParams } = designFilter(u);
  let where = whereBase;
  const params = [...baseParams];
  if (where === '1=0') return res.json({ designs: [] });
  const projectId = req.query.project_id ? Number(req.query.project_id) : null;
  const p = [...params];
  if (projectId) {
    where += ' AND d.project_id = ?';
    p.push(projectId);
  }
  const rows = db
    .prepare(
      `SELECT d.id, d.name, d.project_id, d.canvas_width, d.canvas_height, d.updated_at,
        p.name AS project_name, b.name AS brand_name
       FROM designs d
       JOIN projects p ON p.id = d.project_id
       JOIN brands b ON b.id = d.brand_id
       WHERE ${where} ORDER BY d.updated_at DESC`
    )
    .all(...p);
  res.json({ designs: rows });
});

designsRouter.get('/:id', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const id = Number(req.params.id);
  const d = db
    .prepare('SELECT d.*, p.name AS project_name FROM designs d JOIN projects p ON p.id = d.project_id WHERE d.id = ?')
    .get(id) as Record<string, unknown> | undefined;
  if (!d) return res.status(404).json({ error: '设计稿不存在' });
  if (!canAccessProject(u, d.project_id as number)) return res.status(403).json({ error: '无权访问该设计稿' });
  res.json({ design: d });
});

designsRouter.post('/', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const { name, project_id, canvas_width, canvas_height, layers_json } = (req.body || {}) as {
    name?: string;
    project_id?: number;
    canvas_width?: number;
    canvas_height?: number;
    layers_json?: unknown;
  };
  if (!project_id) return res.status(400).json({ error: '缺少项目' });
  if (!canAccessProject(u, project_id)) return res.status(403).json({ error: '无权访问该项目' });
  const brandId = db.prepare('SELECT brand_id FROM projects WHERE id = ?').get(project_id) as { brand_id: number } | undefined;
  if (!brandId) return res.status(400).json({ error: '项目不存在，请返回首页重新选择项目' });
  const info = db
    .prepare(
      'INSERT INTO designs (brand_id, project_id, name, canvas_width, canvas_height, layers_json, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      brandId.brand_id,
      project_id,
      name || '未命名设计',
      canvas_width || 1080,
      canvas_height || 1440,
      JSON.stringify(layers_json || {}),
      u.id
    );
  res.status(201).json({ design: { id: Number(info.lastInsertRowid) } });
});

designsRouter.patch('/:id', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const id = Number(req.params.id);
  const d = db.prepare('SELECT * FROM designs WHERE id = ?').get(id) as
    | { project_id: number }
    | undefined;
  if (!d || !canAccessProject(u, d.project_id)) return res.status(403).json({ error: '无权修改该设计稿' });
  const { name, canvas_width, canvas_height, layers_json } = (req.body || {}) as {
    name?: string;
    canvas_width?: number;
    canvas_height?: number;
    layers_json?: unknown;
  };
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
  if (canvas_width !== undefined) { sets.push('canvas_width = ?'); vals.push(canvas_width); }
  if (canvas_height !== undefined) { sets.push('canvas_height = ?'); vals.push(canvas_height); }
  if (layers_json !== undefined) { sets.push('layers_json = ?'); vals.push(JSON.stringify(layers_json)); }
  sets.push("updated_at = datetime('now')");
  vals.push(id);
  db.prepare(`UPDATE designs SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ ok: true });
});

designsRouter.delete('/:id', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const id = Number(req.params.id);
  const d = db.prepare('SELECT project_id FROM designs WHERE id = ?').get(id) as { project_id: number } | undefined;
  if (!d || !canAccessProject(u, d.project_id)) return res.status(403).json({ error: '无权删除该设计稿' });
  db.prepare('DELETE FROM designs WHERE id = ?').run(id);
  res.json({ ok: true });
});
