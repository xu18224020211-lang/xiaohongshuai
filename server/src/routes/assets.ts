import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { requireAuth, type AuthedRequest } from '../middleware';
import { assetFilter, canAccessProject, canEditProject, canUploadAssets, firstBrandId, isGlobalAdmin, rowInScope } from '../scope';
import { config } from '../config';
import { publicUrlFor, uploadDirFor } from '../storage';
import type { AssetType } from '../types';

export const assetsRouter = Router();
assetsRouter.use(requireAuth);

fs.mkdirSync(config.uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDirFor('assets')),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `asset-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 30 * 1024 * 1024 } });

const TYPES: AssetType[] = ['scene', 'product', 'sticker'];

/** 标签工具：解析 / 自动建标签 / 覆盖素材标签关联 */
function parseTagIds(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw.filter(Number.isFinite).map(Number);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter(Number.isFinite).map(Number);
    } catch {
      return raw.split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
    }
  }
  return [];
}
function ensureTag(name: string): number {
  const row = db.prepare('SELECT id FROM asset_tags WHERE name = ?').get(name) as { id: number } | undefined;
  if (row) return row.id;
  const max = db.prepare('SELECT COALESCE(MAX(sort), 0) AS s FROM asset_tags').get() as { s: number };
  return Number(db.prepare('INSERT INTO asset_tags (name, sort) VALUES (?, ?)').run(name, max.s + 1).lastInsertRowid);
}
function setAssetTags(assetId: number, tagIds: number[]) {
  db.prepare('DELETE FROM asset_tag_links WHERE asset_id = ?').run(assetId);
  for (const tid of Array.from(new Set(tagIds))) {
    if (db.prepare('SELECT id FROM asset_tags WHERE id = ?').get(tid)) {
      db.prepare('INSERT OR IGNORE INTO asset_tag_links (asset_id, tag_id) VALUES (?, ?)').run(assetId, tid);
    }
  }
}

assetsRouter.get('/', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const { sql, params } = assetFilter(u, { deptMemberAll: true });
  const type = req.query.type as string | undefined;
  const tag = req.query.tag as string | undefined;
  const tagId = req.query.tag_id ? Number(req.query.tag_id) : null;
  const scope = req.query.scope as string | undefined; // all | generic | project
  const projectId = req.query.project_id ? Number(req.query.project_id) : null;
  const mine = req.query.mine === '1' || req.query.mine === 'true'; // 只看自己上传的
  let where = `${sql} AND a.deleted_at IS NULL`;
  const p = [...params];
  if (type && TYPES.includes(type as AssetType)) {
    where += ' AND a.type = ?';
    p.push(type);
  }
  if (tag) {
    where += ' AND a.tag = ?';
    p.push(tag);
  }
  if (tagId) {
    where += ' AND a.id IN (SELECT asset_id FROM asset_tag_links WHERE tag_id = ?)';
    p.push(tagId);
  }
  if (projectId) {
    where += ' AND a.project_id = ?';
    p.push(projectId);
  }
  if (scope === 'generic') where += ' AND a.project_id IS NULL';
  if (scope === 'project') where += ' AND a.project_id IS NOT NULL';
  // mine=1：只看「我自己上传的」素材（画布右侧素材库用）
  if (mine) { where += ' AND a.created_by = ?'; p.push(u.id); }
  const rows = db
    .prepare(
      `SELECT a.*, b.name AS brand_name, b.product_level, p.name AS project_name,
              m.name AS model_name, c.id AS category_id, c.name AS category_name,
              COALESCE(m.name, c.name) AS product_name
         FROM assets a
         JOIN brands b ON b.id = a.brand_id
         LEFT JOIN projects p ON p.id = a.project_id
         LEFT JOIN models m ON m.id = a.model_id
         LEFT JOIN categories c ON c.id = COALESCE(a.category_id, m.category_id)
        WHERE ${where} ORDER BY a.id DESC`
    )
    .all(...p) as Record<string, unknown>[];
  // 附加多标签
  const tagRows = db
    .prepare('SELECT l.asset_id, t.id AS tag_id, t.name AS tag_name FROM asset_tag_links l JOIN asset_tags t ON t.id = l.tag_id')
    .all() as { asset_id: number; tag_id: number; tag_name: string }[];
  const map = new Map<number, { id: number; name: string }[]>();
  for (const r of tagRows) {
    const list = map.get(r.asset_id) || [];
    list.push({ id: r.tag_id, name: r.tag_name });
    map.set(r.asset_id, list);
  }
  res.json({ assets: rows.map((r) => ({ ...r, tags: map.get(Number(r.id)) || [] })) });
});

// 上传素材：管理员可传通用/项目专属；下级需对目标项目有「修改」权限
assetsRouter.post('/', upload.single('file'), (req, res) => {
  const u = (req as AuthedRequest).user!;
  const type = req.body.type as AssetType;
  const name = req.body.name as string | undefined;
  const tag = req.body.tag as string | undefined;
  const pathTypeRaw = (req.body.path_type as string | undefined) || '';
  const pathType = pathTypeRaw === 'A' || pathTypeRaw === 'B' ? pathTypeRaw : null;
  const projectId = req.body.project_id ? Number(req.body.project_id) : null;
  const modelIdRaw = req.body.model_id ? Number(req.body.model_id) : null;
  // 2 级品牌：归属直接是「类别」（没有型号）
  const categoryIdRaw = req.body.category_id ? Number(req.body.category_id) : null;
  if (!TYPES.includes(type)) return res.status(400).json({ error: 'type 须为 scene/product/sticker' });
  const url = req.body.url as string | undefined;
  let finalUrl = url || '';
  if (req.file) finalUrl = publicUrlFor('assets', req.file.filename);
  if (!finalUrl) return res.status(400).json({ error: '缺少文件或 url' });

  // 归属型号 → 品牌/类别由型号推导
  let brandId: number | null = u.brand_id;
  let modelId: number | null = null;
  let categoryId: number | null = categoryIdRaw;
  if (modelIdRaw) {
    const m = db
      .prepare('SELECT m.id, c.brand_id, c.id AS category_id FROM models m JOIN categories c ON c.id = m.category_id WHERE m.id = ?')
      .get(modelIdRaw) as { id: number; brand_id: number; category_id: number } | undefined;
    if (!m) return res.status(400).json({ error: '型号不存在' });
    modelId = m.id;
    categoryId = m.category_id;
    brandId = m.brand_id;
  } else if (categoryId) {
    // 2 级品牌：直接归属到类别
    const c = db.prepare('SELECT id, brand_id FROM categories WHERE id = ?').get(categoryId) as
      | { id: number; brand_id: number }
      | undefined;
    if (!c) return res.status(400).json({ error: '类别不存在' });
    brandId = c.brand_id;
  }
  if (projectId) {
    if (!canAccessProject(u, projectId)) return res.status(403).json({ error: '无权访问该项目' });
    const proj = db.prepare('SELECT brand_id FROM projects WHERE id = ?').get(projectId) as { brand_id: number } | undefined;
    if (proj) brandId = proj.brand_id;
  }
  if (isGlobalAdmin(u)) {
    brandId = Number(req.body.brand_id) || brandId || firstBrandId();
  } else if (projectId) {
    if (!canEditProject(u, projectId)) return res.status(403).json({ error: '该项目你只有查看权限，无法上传' });
  }
  // 上传权限：管理员 / 项目经理 / 被授予「修改」权限的成员（限该项目内）；普通用户只读
  // （无权限时前端会退回普通上传：只进画布，不进素材库）
  if (!canUploadAssets(u, projectId)) return res.status(403).json({ error: '当前角色没有素材上传权限' });
  if (!brandId) return res.status(400).json({ error: '缺少品牌' });
  const info = db
    .prepare('INSERT INTO assets (brand_id, project_id, model_id, category_id, type, name, url, tag, path_type, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(brandId, projectId, modelId, categoryId ?? null, type, name || req.file?.originalname || type, finalUrl, null, pathType, u.id);
  const newId = Number(info.lastInsertRowid);
  // 多标签（勾选形式）
  const tagIds = parseTagIds(req.body.tag_ids);
  // 兼容旧入参 tag（文本，逗号分隔）
  if (!tagIds.length && tag) {
    for (const t of String(tag).split(/[,，、/]/).map((s) => s.trim()).filter(Boolean)) {
      tagIds.push(ensureTag(t));
    }
  }
  setAssetTags(newId, tagIds);
  res.status(201).json({ asset: { id: newId, type, url: finalUrl, tag_ids: tagIds, path_type: pathType, model_id: modelId } });
});

assetsRouter.patch('/:id', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const id = Number(req.params.id);
  const a = db.prepare('SELECT brand_id, project_id FROM assets WHERE id = ?').get(id) as
    | { brand_id: number; project_id: number | null }
    | undefined;
  if (!a) return res.status(404).json({ error: '素材不存在' });
  if (!rowInScope(u, a.project_id)) return res.status(403).json({ error: '无权修改该素材' });
  const { name, tag, project_id, path_type, model_id, type, tag_ids, category_id } = (req.body || {}) as {
    name?: string; tag?: string; project_id?: number | null; path_type?: string; model_id?: number | null; type?: AssetType;
    tag_ids?: number[]; category_id?: number | null;
  };
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
  if (type !== undefined && TYPES.includes(type)) { sets.push('type = ?'); vals.push(type); }
  if (path_type !== undefined) { sets.push('path_type = ?'); vals.push(path_type === 'A' || path_type === 'B' ? path_type : null); }
  if (model_id !== undefined) {
    sets.push('model_id = ?'); vals.push(model_id ? Number(model_id) : null);
    // 归属型号变化时同步品牌与类别（二级品牌没有型号，此时用 category_id 决定品牌）
    if (model_id) {
      const m = db.prepare('SELECT c.brand_id, c.id AS category_id FROM models m JOIN categories c ON c.id = m.category_id WHERE m.id = ?').get(Number(model_id)) as { brand_id: number; category_id: number } | undefined;
      if (m) {
        sets.push('brand_id = ?'); vals.push(m.brand_id);
        sets.push('category_id = ?'); vals.push(m.category_id);
      }
    }
  }
  // 2 级品牌：归属直接是「类别」，必须真正写入 category_id，否则列表里的归属名不显示
  if (category_id !== undefined) {
    sets.push('category_id = ?'); vals.push(category_id ? Number(category_id) : null);
    if (category_id) {
      const c = db.prepare('SELECT brand_id FROM categories WHERE id = ?').get(Number(category_id)) as { brand_id: number } | undefined;
      if (c) { sets.push('brand_id = ?'); vals.push(c.brand_id); }
    }
  }
  if (project_id !== undefined) {
    const pid = project_id ? Number(project_id) : null;
    if (pid && !rowInScope(u, pid)) return res.status(403).json({ error: '无权设置到该项目' });
    sets.push('project_id = ?'); vals.push(pid);
  }
  if (sets.length) { vals.push(id); db.prepare(`UPDATE assets SET ${sets.join(', ')} WHERE id = ?`).run(...vals); }
  if (tag_ids !== undefined) setAssetTags(id, parseTagIds(tag_ids));
  else if (tag !== undefined) {
    const ids: number[] = [];
    for (const t of String(tag).split(/[,，、/]/).map((s) => s.trim()).filter(Boolean)) ids.push(ensureTag(t));
    setAssetTags(id, ids);
  }
  res.json({ ok: true });
});

/** 删除素材：进回收站（文件保留 36 小时，只有超管能在回收站恢复/彻底删除） */
assetsRouter.delete('/:id', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const id = Number(req.params.id);
  const a = db.prepare('SELECT brand_id, project_id FROM assets WHERE id = ?').get(id) as
    | { brand_id: number; project_id: number | null }
    | undefined;
  if (!a) return res.status(404).json({ error: '素材不存在' });
  if (!rowInScope(u, a.project_id)) return res.status(403).json({ error: '无权删除该素材' });
  db.prepare("UPDATE assets SET deleted_at = datetime('now') WHERE id = ?").run(id);
  res.json({ ok: true, trashed: true });
});
