import { Router } from 'express';
import { db } from '../db';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware';
import { canBrowseAll, isGlobalAdmin, visibleBrandIds } from '../scope';

export const brandsRouter = Router();
brandsRouter.use(requireAuth);

// 超管/高级管理者/部门主管：全部；其他：自己品牌 + 品牌授权 + 项目/类别授权推导出的品牌
// all=1：项目经理在后台「产品」页可只读浏览全部品牌（只给读，写操作仍受角色限制）
brandsRouter.get('/', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const all = (req.query.all === '1' && canBrowseAll(u)) || u.role === 'dept_member';
  const ids = all ? null : visibleBrandIds(u);
  if (ids === null) {
    return res.json({ brands: db.prepare('SELECT * FROM brands ORDER BY id DESC').all() });
  }
  if (!ids.length) return res.json({ brands: [] });
  const ph = ids.map(() => '?').join(',');
  res.json({ brands: db.prepare(`SELECT * FROM brands WHERE id IN (${ph}) ORDER BY id DESC`).all(...ids) });
});

brandsRouter.post('/', requireRole('super_admin', 'senior_manager', 'dept_head'), (req, res) => {
  const { name, logo_url, description, product_level } = (req.body || {}) as { name?: string; logo_url?: string; description?: string; product_level?: number };
  if (!name) return res.status(400).json({ error: '品牌名不能为空' });
  const level = Number(product_level) === 2 ? 2 : 3;
  const info = db
    .prepare('INSERT INTO brands (name, logo_url, description, product_level) VALUES (?, ?, ?, ?)')
    .run(name, logo_url || null, description || null, level);
  res.status(201).json({ brand: { id: Number(info.lastInsertRowid), name, logo_url: logo_url || null, description: description || null, product_level: level } });
});

brandsRouter.patch('/:id', (req, res) => {
  const u = (req as AuthedRequest).user!;
  if (!isGlobalAdmin(u)) return res.status(403).json({ error: '仅管理员可修改品牌' });
  const id = Number(req.params.id);
  const { name, logo_url, description, product_level } = (req.body || {}) as { name?: string; logo_url?: string; description?: string; product_level?: number };
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (name !== undefined) { if (!name) return res.status(400).json({ error: '品牌名不能为空' }); sets.push('name = ?'); vals.push(name); }
  if (logo_url !== undefined) { sets.push('logo_url = ?'); vals.push(logo_url || null); }
  if (description !== undefined) { sets.push('description = ?'); vals.push(description || null); }
  if (product_level !== undefined) { sets.push('product_level = ?'); vals.push(Number(product_level) === 2 ? 2 : 3); }
  if (sets.length) { vals.push(id); db.prepare(`UPDATE brands SET ${sets.join(', ')} WHERE id = ?`).run(...vals); }
  res.json({ ok: true });
});

brandsRouter.delete('/:id', requireRole('super_admin'), (req, res) => {
  db.prepare('DELETE FROM brands WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});
