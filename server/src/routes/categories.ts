import { Router } from 'express';
import { db } from '../db';
import { requireAuth, type AuthedRequest } from '../middleware';
import { canAccessBrand, canBrowseAll, isGlobalAdmin, visibleCategoryIds } from '../scope';

export const categoriesRouter = Router();
categoriesRouter.use(requireAuth);

// 产品（类别）：全局管理者可见全部；其他仅自己品牌/授权范围内的类别
// all=1：项目经理在后台「产品」页可只读浏览全部类别（只给读，写操作仍受角色限制）
categoriesRouter.get('/', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const brandId = req.query.brand_id ? Number(req.query.brand_id) : null;
  const all = (req.query.all === '1' && canBrowseAll(u)) || u.role === 'dept_member';
  const ids = all ? null : visibleCategoryIds(u);
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (ids !== null) {
    if (!ids.length) return res.json({ categories: [] });
    where.push(`c.id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }
  if (brandId) {
    where.push('c.brand_id = ?');
    params.push(brandId);
  }
  const sql = `SELECT c.*, b.name AS brand_name FROM categories c JOIN brands b ON b.id = c.brand_id
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.id`;
  res.json({ categories: db.prepare(sql).all(...params) });
});

categoriesRouter.post('/', (req, res) => {
  const u = (req as AuthedRequest).user!;
  if (!isGlobalAdmin(u)) return res.status(403).json({ error: '仅管理员可新建产品' });
  const { name, brand_id } = (req.body || {}) as { name?: string; brand_id?: number };
  if (!name) return res.status(400).json({ error: '产品名不能为空' });
  const brandId = Number(brand_id) || u.brand_id;
  if (!brandId) return res.status(400).json({ error: '缺少品牌' });
  if (!canAccessBrand(u, brandId)) return res.status(403).json({ error: '无权访问该品牌' });
  const info = db.prepare('INSERT INTO categories (brand_id, name) VALUES (?, ?)').run(brandId, name);
  res.status(201).json({ category: { id: Number(info.lastInsertRowid), brand_id: brandId, name } });
});

categoriesRouter.patch('/:id', (req, res) => {
  const u = (req as AuthedRequest).user!;
  if (!isGlobalAdmin(u)) return res.status(403).json({ error: '仅管理员可修改产品' });
  const id = Number(req.params.id);
  const row = db.prepare('SELECT brand_id FROM categories WHERE id = ?').get(id) as { brand_id: number } | undefined;
  if (!row) return res.status(404).json({ error: '产品不存在' });
  const { name, brand_id } = (req.body || {}) as { name?: string; brand_id?: number };
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (name !== undefined && name) { sets.push('name = ?'); vals.push(name); }
  if (brand_id !== undefined) {
    sets.push('brand_id = ?');
    vals.push(Number(brand_id));
    db.prepare('UPDATE projects SET brand_id = ? WHERE category_id = ?').run(Number(brand_id), id);
  }
  if (sets.length) { vals.push(id); db.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`).run(...vals); }
  res.json({ ok: true });
});

categoriesRouter.delete('/:id', (req, res) => {
  const u = (req as AuthedRequest).user!;
  if (!isGlobalAdmin(u)) return res.status(403).json({ error: '仅管理员可删除产品' });
  const id = Number(req.params.id);
  const cnt = db.prepare('SELECT COUNT(*) AS c FROM projects WHERE category_id = ?').get(id) as { c: number };
  if (cnt.c > 0) return res.status(400).json({ error: '该产品下仍有项目，请先迁移或删除' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  res.json({ ok: true });
});
