import { Router } from 'express';
import { db } from '../db';
import { requireAuth, type AuthedRequest } from '../middleware';
import { canAccessBrand, canBrowseAll, isGlobalAdmin, visibleCategoryIds } from '../scope';

export const modelsRouter = Router();
modelsRouter.use(requireAuth);

/** 型号（产品第三级：品牌 → 类别 → 型号）：按权限范围返回 */
// all=1：项目经理在后台「产品」页可只读浏览全部型号（只给读，写操作仍受角色限制）
modelsRouter.get('/', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const categoryId = req.query.category_id ? Number(req.query.category_id) : null;
  const brandId = req.query.brand_id ? Number(req.query.brand_id) : null;
  const where: string[] = [];
  const params: (string | number | null)[] = [];
  const all = (req.query.all === '1' && canBrowseAll(u)) || u.role === 'dept_member';
  const catIds = all ? null : visibleCategoryIds(u);
  if (catIds !== null) {
    if (!catIds.length) return res.json({ models: [] });
    where.push(`m.category_id IN (${catIds.map(() => '?').join(',')})`);
    params.push(...catIds);
  }
  if (categoryId) { where.push('m.category_id = ?'); params.push(categoryId); }
  if (brandId) { where.push('c.brand_id = ?'); params.push(brandId); }
  const sql = `SELECT m.*, c.name AS category_name, c.brand_id, b.name AS brand_name
                 FROM models m
                 JOIN categories c ON c.id = m.category_id
                 JOIN brands b ON b.id = c.brand_id
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY c.id, m.id`;
  res.json({ models: db.prepare(sql).all(...params) });
});

modelsRouter.post('/', (req, res) => {
  const u = (req as AuthedRequest).user!;
  if (!isGlobalAdmin(u)) return res.status(403).json({ error: '仅管理员可新建型号' });
  const { name, category_id, description } = (req.body || {}) as { name?: string; category_id?: number; description?: string };
  if (!name) return res.status(400).json({ error: '型号名不能为空' });
  const catId = Number(category_id);
  if (!catId) return res.status(400).json({ error: '请选择所属类别' });
  const cat = db.prepare('SELECT brand_id FROM categories WHERE id = ?').get(catId) as { brand_id: number } | undefined;
  if (!cat) return res.status(404).json({ error: '类别不存在' });
  if (!canAccessBrand(u, cat.brand_id)) return res.status(403).json({ error: '无权访问该品牌' });
  const info = db
    .prepare('INSERT INTO models (category_id, name, description) VALUES (?, ?, ?)')
    .run(catId, name, description || null);
  res.status(201).json({ model: { id: Number(info.lastInsertRowid), category_id: catId, name, description: description || null } });
});

modelsRouter.patch('/:id', (req, res) => {
  const u = (req as AuthedRequest).user!;
  if (!isGlobalAdmin(u)) return res.status(403).json({ error: '仅管理员可修改型号' });
  const id = Number(req.params.id);
  const row = db.prepare('SELECT id FROM models WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '型号不存在' });
  const { name, category_id, description } = (req.body || {}) as { name?: string; category_id?: number; description?: string };
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (name !== undefined && name) { sets.push('name = ?'); vals.push(name); }
  if (description !== undefined) { sets.push('description = ?'); vals.push(description || null); }
  if (category_id !== undefined) { sets.push('category_id = ?'); vals.push(Number(category_id)); }
  if (sets.length) { vals.push(id); db.prepare(`UPDATE models SET ${sets.join(', ')} WHERE id = ?`).run(...vals); }
  res.json({ ok: true });
});

modelsRouter.delete('/:id', (req, res) => {
  const u = (req as AuthedRequest).user!;
  if (!isGlobalAdmin(u)) return res.status(403).json({ error: '仅管理员可删除型号' });
  const id = Number(req.params.id);
  const used = db.prepare('SELECT COUNT(*) AS c FROM project_models WHERE model_id = ?').get(id) as { c: number };
  if (used.c > 0) return res.status(400).json({ error: '该型号已被项目使用，请先解除关联' });
  db.prepare('DELETE FROM models WHERE id = ?').run(id);
  res.json({ ok: true });
});
