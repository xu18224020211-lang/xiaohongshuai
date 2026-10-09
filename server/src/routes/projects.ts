import { Router } from 'express';
import { db } from '../db';
import { requireAuth, type AuthedRequest } from '../middleware';
import { canAccessBrand, canBrowseAll, canEditProjectMeta, firstBrandId, isGlobalAdmin, projectFilter, projectWithDescendants } from '../scope';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

/** 项目内产品查询：二级品牌 = 类别即产品（model_id 为空）；三级品牌 = 型号 */
const PRODUCT_SELECT = `
  SELECT pm.rowid AS link_id, pm.project_id, pm.category_id, pm.model_id,
         c.name AS category_name, c.brand_id, b.name AS brand_name, b.product_level,
         m.name AS model_name
    FROM project_models pm
    LEFT JOIN categories c ON c.id = pm.category_id
    LEFT JOIN brands b ON b.id = c.brand_id
    LEFT JOIN models m ON m.id = pm.model_id
`;

type ProductInput = { category_id?: number; model_id?: number | null };

/** 校验并规范化项目内产品入参（同时兼容旧的 model_ids） */
function normalizeProducts(
  body: { products?: ProductInput[]; model_ids?: number[] },
  user: AuthedRequest['user']
): { items: { category_id: number; model_id: number | null }[]; error?: string; code?: number } {
  const items: { category_id: number; model_id: number | null }[] = [];
  if (Array.isArray(body.products)) {
    for (const x of body.products) {
      items.push({ category_id: Number(x.category_id), model_id: x.model_id ? Number(x.model_id) : null });
    }
  } else if (Array.isArray(body.model_ids)) {
    for (const mid of body.model_ids.filter(Number.isFinite).map(Number)) {
      const m = db.prepare('SELECT id, category_id FROM models WHERE id = ?').get(mid) as { id: number; category_id: number } | undefined;
      if (!m) return { items: [], error: `型号 ${mid} 不存在`, code: 400 };
      items.push({ category_id: m.category_id, model_id: m.id });
    }
  }
  for (const it of items) {
    if (!Number.isFinite(it.category_id)) return { items: [], error: '产品参数不正确', code: 400 };
    const cat = db.prepare('SELECT id, brand_id FROM categories WHERE id = ?').get(it.category_id) as { id: number; brand_id: number } | undefined;
    if (!cat) return { items: [], error: `类别 ${it.category_id} 不存在`, code: 400 };
    if (!canAccessBrand(user!, cat.brand_id)) return { items: [], error: '无权操作该品牌的产品', code: 403 };
    if (it.model_id) {
      const m = db.prepare('SELECT id FROM models WHERE id = ? AND category_id = ?').get(it.model_id, it.category_id);
      if (!m) return { items: [], error: `型号 ${it.model_id} 不属于该类别`, code: 400 };
    }
  }
  // 去重
  const seen = new Set<string>();
  return { items: items.filter((i) => {
    const k = `${i.category_id}:${i.model_id ?? 0}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }) };
}

function saveProducts(projectId: number, items: { category_id: number; model_id: number | null }[]) {
  db.prepare('DELETE FROM project_models WHERE project_id = ?').run(projectId);
  for (const it of items) {
    db.prepare('INSERT OR IGNORE INTO project_models (project_id, category_id, model_id) VALUES (?, ?, ?)').run(projectId, it.category_id, it.model_id);
  }
  return db.prepare(`${PRODUCT_SELECT} WHERE pm.project_id = ? ORDER BY pm.rowid`).all(projectId);
}

/** 项目 ↔ 产品 关联（当前权限范围内全部） */
projectsRouter.get('/models', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const { sql, params } = projectFilter(u);
  if (sql === '1=0') return res.json({ links: [], products: [] });
  const rows = db
    .prepare(
      `SELECT pm.project_id, pm.category_id, pm.model_id
         FROM project_models pm
         JOIN projects p ON p.id = pm.project_id
        WHERE ${sql}`
    )
    .all(...params);
  res.json({ links: rows, products: rows });
});

projectsRouter.get('/products', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const { sql, params } = projectFilter(u);
  if (sql === '1=0') return res.json({ products: [] });
  const rows = db
    .prepare(
      `SELECT pm.project_id, pm.category_id, pm.model_id
         FROM project_models pm
         JOIN projects p ON p.id = pm.project_id
        WHERE ${sql}`
    )
    .all(...params);
  res.json({ products: rows });
});

// 列表：按可见性过滤；支持 ?brand_id= / ?category_id= / ?parent_id= / ?model_id=
projectsRouter.get('/', (req, res) => {
  const u = (req as AuthedRequest).user!;
  // all=1：可只读浏览全部项目的角色（超管 / 高级管理者 / 部门主管 / 项目经理 / 部门成员）
  // 部门成员默认就能查看全部项目（只读），无需前端显式传 all=1
  const all = (req.query.all === '1' && canBrowseAll(u)) || u.role === 'dept_member';
  const { sql, params } = all ? { sql: '1=1', params: [] as (string | number | null)[] } : projectFilter(u);
  const brandId = req.query.brand_id ? Number(req.query.brand_id) : null;
  const categoryId = req.query.category_id ? Number(req.query.category_id) : null;
  const parentId = req.query.parent_id ? Number(req.query.parent_id) : null;
  const modelId = req.query.model_id ? Number(req.query.model_id) : null;
  let where = sql;
  const p = [...params];
  if (where === '1=0') return res.json({ projects: [] });
  if (brandId && isGlobalAdmin(u)) {
    where += ' AND p.brand_id = ?';
    p.push(brandId);
  }
  if (categoryId) {
    where += ' AND p.category_id = ?';
    p.push(categoryId);
  }
  if (parentId) {
    where += ' AND p.parent_id = ?';
    p.push(parentId);
  }
  if (modelId) {
    where += ' AND p.id IN (SELECT project_id FROM project_models WHERE model_id = ?)';
    p.push(modelId);
  }
  const rows = db
    .prepare(
      `SELECT p.*, b.name AS brand_name, c.name AS category_name, b.product_level,
        (SELECT GROUP_CONCAT(COALESCE(m.name, pc.name), ' / ')
           FROM project_models pm
           LEFT JOIN models m ON m.id = pm.model_id
           LEFT JOIN categories pc ON pc.id = pm.category_id
          WHERE pm.project_id = p.id) AS model_names,
        (SELECT COUNT(*) FROM project_models pm WHERE pm.project_id = p.id) AS model_count,
        (SELECT COUNT(*) FROM assets a WHERE a.project_id = p.id) AS asset_count,
        (SELECT COUNT(*) FROM reference_images r WHERE r.project_id = p.id) AS template_count
       FROM projects p
       JOIN brands b ON b.id = p.brand_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${where} ORDER BY p.id DESC`
    )
    .all(...p);
  res.json({ projects: rows });
});

// 项目内的产品
projectsRouter.get('/:id/models', (req, res) => {
  const id = Number(req.params.id);
  const rows = db.prepare(`${PRODUCT_SELECT} WHERE pm.project_id = ? ORDER BY pm.rowid`).all(id);
  res.json({ products: rows, models: rows });
});

projectsRouter.get('/:id/products', (req, res) => {
  const id = Number(req.params.id);
  const rows = db.prepare(`${PRODUCT_SELECT} WHERE pm.project_id = ? ORDER BY pm.rowid`).all(id);
  res.json({ products: rows });
});

projectsRouter.put('/:id/models', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const id = Number(req.params.id);
  if (!canEditProjectMeta(u, id)) return res.status(403).json({ error: '无权修改该项目' });
  const { items, error, code } = normalizeProducts((req.body || {}) as never, u);
  if (error) return res.status(code || 400).json({ error });
  res.json({ ok: true, products: saveProducts(id, items) });
});

projectsRouter.put('/:id/products', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const id = Number(req.params.id);
  if (!canEditProjectMeta(u, id)) return res.status(403).json({ error: '无权修改该项目' });
  const { items, error, code } = normalizeProducts((req.body || {}) as never, u);
  if (error) return res.status(code || 400).json({ error });
  res.json({ ok: true, products: saveProducts(id, items) });
});

/** 只有超管与高级管理者可以设置项目经理 */
function canSetPm(u: { role: string }): boolean {
  return u.role === 'super_admin' || u.role === 'senior_manager';
}
/** 校验并返回项目经理用户信息（必须是「项目经理」角色） */
function resolvePm(pmId: number | null | undefined): { id: number; name: string } | null {
  if (!pmId) return null;
  const row = db.prepare('SELECT id, username, display_name, role FROM users WHERE id = ?').get(Number(pmId)) as
    | { id: number; username: string; display_name: string | null; role: string }
    | undefined;
  if (!row || row.role !== 'pm') return null;
  return { id: row.id, name: row.display_name || row.username };
}

// 创建项目：可多选项目内的产品（二级品牌直接选类别，三级品牌选到型号）
projectsRouter.post('/', (req, res) => {
  const u = (req as AuthedRequest).user!;
  if (!isGlobalAdmin(u)) return res.status(403).json({ error: '仅管理员可新建项目' });
  const { name, brand_id, category_id, parent_id, start_date, end_date, pm_id } = (req.body || {}) as {
    name?: string;
    brand_id?: number;
    category_id?: number;
    parent_id?: number;
    start_date?: string;
    end_date?: string;
    pm_id?: number | null;
  };
  if (!name) return res.status(400).json({ error: '项目名不能为空' });
  let brandId: number | null = Number(brand_id) || u.brand_id || firstBrandId();
  let catId: number | null = category_id ?? null;
  if (catId) {
    const c = db.prepare('SELECT brand_id FROM categories WHERE id = ?').get(catId) as { brand_id: number } | undefined;
    if (!c) return res.status(400).json({ error: '类别不存在' });
    brandId = c.brand_id;
  }
  if (!brandId) return res.status(400).json({ error: '缺少品牌' });
  if (!canAccessBrand(u, brandId)) return res.status(403).json({ error: '无权访问该品牌' });
  const parentId: number | null = parent_id ? Number(parent_id) : null;
  if (parentId) {
    const par = db.prepare('SELECT brand_id, category_id FROM projects WHERE id = ?').get(parentId) as
      | { brand_id: number; category_id: number | null }
      | undefined;
    if (!par) return res.status(400).json({ error: '父级项目不存在' });
    brandId = par.brand_id;
    if (!catId) catId = par.category_id;
  }
  // 项目经理：由超管 / 高级管理者从「项目经理」角色的用户里选择绑定（可多个项目绑定同一人）
  const pm = canSetPm(u) ? resolvePm(pm_id ?? null) : null;
  if (canSetPm(u) && pm_id && !pm) return res.status(400).json({ error: '项目经理须为「项目经理」角色的用户' });
  const info = db
    .prepare('INSERT INTO projects (brand_id, category_id, parent_id, name, start_date, end_date, pm_id, pm_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(brandId, catId, parentId, name, start_date || null, end_date || null, pm ? pm.id : null, pm ? pm.name : null);
  const id = Number(info.lastInsertRowid);
  const { items, error, code } = normalizeProducts((req.body || {}) as never, u);
  if (error) {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return res.status(code || 400).json({ error });
  }
  saveProducts(id, items);
  res.status(201).json({ project: { id, brand_id: brandId, category_id: catId, parent_id: parentId, name }, products: db.prepare(`${PRODUCT_SELECT} WHERE pm.project_id = ?`).all(id) });
});

projectsRouter.patch('/:id', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const id = Number(req.params.id);
  if (!canEditProjectMeta(u, id)) return res.status(403).json({ error: '无权修改该项目' });
  const { name, category_id, parent_id, start_date, end_date, brand_id, pm_id } = (req.body || {}) as {
    name?: string;
    category_id?: number;
    parent_id?: number | null;
    start_date?: string;
    end_date?: string;
    brand_id?: number;
    pm_id?: number | null;
  };
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (name !== undefined && name) { sets.push('name = ?'); vals.push(name); }
  if (brand_id !== undefined && isGlobalAdmin(u)) { sets.push('brand_id = ?'); vals.push(Number(brand_id)); }
  if (category_id !== undefined) {
    const c = db.prepare('SELECT brand_id FROM categories WHERE id = ?').get(Number(category_id)) as { brand_id: number } | undefined;
    if (!c) return res.status(400).json({ error: '类别不存在' });
    sets.push('category_id = ?'); vals.push(Number(category_id));
    sets.push('brand_id = ?'); vals.push(c.brand_id);
  }
  if (parent_id !== undefined) {
    if (parent_id && projectWithDescendants(id).includes(Number(parent_id))) {
      return res.status(400).json({ error: '不能把项目挂到自己的子项目下' });
    }
    sets.push('parent_id = ?'); vals.push(parent_id ? Number(parent_id) : null);
  }
  // 项目经理：仅超管 / 高级管理者可改，且必须绑定「项目经理」角色的用户
  if (pm_id !== undefined) {
    if (!canSetPm(u)) return res.status(403).json({ error: '仅超管与高级管理者可设置项目经理' });
    const pm = resolvePm(pm_id);
    if (pm_id && !pm) return res.status(400).json({ error: '项目经理须为「项目经理」角色的用户' });
    sets.push('pm_id = ?'); vals.push(pm ? pm.id : null);
    sets.push('pm_name = ?'); vals.push(pm ? pm.name : null);
  }
  if (start_date !== undefined) { sets.push('start_date = ?'); vals.push(start_date || null); }
  if (end_date !== undefined) { sets.push('end_date = ?'); vals.push(end_date || null); }
  if (sets.length) { vals.push(id); db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...vals); }

  const body = (req.body || {}) as { products?: ProductInput[]; model_ids?: number[] };
  if (Array.isArray(body.products) || Array.isArray(body.model_ids)) {
    const { items, error, code } = normalizeProducts(body, u);
    if (error) return res.status(code || 400).json({ error });
    saveProducts(id, items);
  }
  res.json({ ok: true });
});

projectsRouter.delete('/:id', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const id = Number(req.params.id);
  if (!canEditProjectMeta(u, id)) return res.status(403).json({ error: '无权删除该项目' });
  const kids = db.prepare('SELECT COUNT(*) AS c FROM projects WHERE parent_id = ?').get(id) as { c: number };
  if (kids.c > 0) return res.status(400).json({ error: '该项目下还有子项目，请先处理' });
  // 该项目的专属素材 / 专属模板转为「通用」，避免留下指向已删除项目的脏数据
  db.prepare('UPDATE assets SET project_id = NULL WHERE project_id = ?').run(id);
  db.prepare('UPDATE reference_images SET project_id = NULL WHERE project_id = ?').run(id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  res.json({ ok: true });
});
