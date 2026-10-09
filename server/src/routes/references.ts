import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { requireAuth, type AuthedRequest } from '../middleware';
import { assetFilter, canAccessProject, canEditModule, canEditProject, canUploadAssets, firstBrandId, isGlobalAdmin, rowInScope } from '../scope';
import { config } from '../config';
import { publicUrlFor, uploadDirFor } from '../storage';

export const referencesRouter = Router();
referencesRouter.use(requireAuth);

fs.mkdirSync(config.uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDirFor('templates')),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `ref-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 30 * 1024 * 1024 } });

// 模板库列表（首页瀑布流）：按角色可见性返回
referencesRouter.get('/', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const { sql, params } = assetFilter(u, { deptMemberAll: true });
  const projectId = req.query.project_id ? Number(req.query.project_id) : null;
  const typeId = req.query.template_type_id ? Number(req.query.template_type_id) : null;
  const scope = req.query.scope as string | undefined; // all | generic | project
  const mine = req.query.mine === '1'; // 我保存的模板
  let where = `${sql} AND r.deleted_at IS NULL`;
  const p = [...params];
  if (projectId) {
    where += ' AND (r.project_id = ? OR r.project_id IS NULL)';
    p.push(projectId);
  }
  if (mine) {
    where += ' AND r.created_by = ?';
    p.push(u.id);
  }
  if (typeId) {
    where += ' AND r.template_type_id = ?';
    p.push(typeId);
  }
  if (scope === 'generic') where += ' AND r.project_id IS NULL';
  if (scope === 'project') where += ' AND r.project_id IS NOT NULL';
  const rows = db
    .prepare(
      `SELECT r.*, b.name AS brand_name, p.name AS project_name, t.name AS template_type_name
       FROM reference_images r
       JOIN brands b ON b.id = r.brand_id
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN template_types t ON t.id = r.template_type_id
       WHERE ${where} ORDER BY r.id DESC`
    )
    .all(...p);
  res.json({ references: rows });
});

/** 模板被使用一次（画布打开模板时调用）→ 供仪表盘统计「模板使用次数」 */
referencesRouter.post('/:id/use', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT id FROM reference_images WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '模板不存在' });
  db.prepare('UPDATE reference_images SET usage_count = COALESCE(usage_count, 0) + 1 WHERE id = ?').run(id);
  const after = db.prepare('SELECT COALESCE(usage_count, 0) AS usage_count FROM reference_images WHERE id = ?').get(id) as { usage_count: number };
  res.json({ ok: true, usage_count: after.usage_count });
});

// 上传模板：管理员可传通用/项目专属；下级需对目标项目有「修改」权限
referencesRouter.post('/', upload.single('file'), (req, res) => {
  const u = (req as AuthedRequest).user!;
  const prompt = (req.body.text_style_prompt as string | undefined) || '';
  const scenePrompt = (req.body.scene_prompt as string | undefined) || null;
  const name = req.body.name as string | undefined;
  const projectId = req.body.project_id ? Number(req.body.project_id) : null;
  const typeId = req.body.template_type_id ? Number(req.body.template_type_id) : null;
  // 文字提示词可为空：此时由模板标签配置的默认提示词驱动（AI背景 / 大字报等）
  if (!req.file) return res.status(400).json({ error: '缺少图片文件' });

  // 标签类型 → 决定画布路径 A/B
  let kind = req.body.kind === 'B' ? 'B' : 'A';
  let templateTypeId: number | null = null;
  if (typeId) {
    const t = db.prepare('SELECT id, path_kind FROM template_types WHERE id = ?').get(typeId) as
      | { id: number; path_kind: string }
      | undefined;
    if (!t) return res.status(400).json({ error: '模板标签不存在' });
    templateTypeId = t.id;
    kind = t.path_kind === 'B' ? 'B' : 'A';
  }

  let brandId: number | null = u.brand_id;
  if (isGlobalAdmin(u)) brandId = Number(req.body.brand_id) || u.brand_id || firstBrandId();
  if (projectId) {
    if (!canAccessProject(u, projectId)) return res.status(403).json({ error: '无权访问该项目' });
    const proj = db.prepare('SELECT brand_id FROM projects WHERE id = ?').get(projectId) as { brand_id: number } | undefined;
    if (proj) brandId = proj.brand_id;
  }
  // 新增模板权限：管理员 / 项目经理 / 被授予「模板 修改」权限的成员；普通用户只读
  if (!canUploadAssets(u, projectId, 'templates')) return res.status(403).json({ error: '当前角色没有新增模板权限' });
  if (isGlobalAdmin(u) || canEditModule(u, 'templates')) {
    // 通用模板
  } else if (projectId) {
    if (!canEditProject(u, projectId)) return res.status(403).json({ error: '该项目你只有查看权限，无法上传模板' });
  } else {
    return res.status(403).json({ error: '通用模板仅管理员可上传' });
  }
  if (!brandId) return res.status(400).json({ error: '缺少品牌' });
  const url = publicUrlFor('templates', req.file.filename);
  const info = db
    .prepare(
      'INSERT INTO reference_images (brand_id, project_id, name, url, text_style_prompt, scene_prompt, kind, template_type_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(brandId, projectId, name || req.file.originalname, url, prompt, scenePrompt, kind, templateTypeId, u.id);
  res.status(201).json({ reference: { id: Number(info.lastInsertRowid), url, text_style_prompt: prompt, scene_prompt: scenePrompt, kind, template_type_id: templateTypeId } });
});

referencesRouter.patch('/:id', upload.single('file'), (req, res) => {
  const u = (req as AuthedRequest).user!;
  const id = Number(req.params.id);
  const r = db.prepare('SELECT brand_id, project_id FROM reference_images WHERE id = ?').get(id) as
    | { brand_id: number; project_id: number | null }
    | undefined;
  if (!r) return res.status(404).json({ error: '模板不存在' });
  if (!rowInScope(u, r.project_id, 'templates')) return res.status(403).json({ error: '无权修改该模板' });
  const { text_style_prompt, scene_prompt, kind, name, project_id, template_type_id } = (req.body || {}) as {
    text_style_prompt?: string;
    scene_prompt?: string;
    kind?: string;
    name?: string;
    project_id?: number | null;
    template_type_id?: number | null;
  };
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (text_style_prompt !== undefined) { sets.push('text_style_prompt = ?'); vals.push(text_style_prompt); }
  if (scene_prompt !== undefined) { sets.push('scene_prompt = ?'); vals.push(scene_prompt || null); }
  if (kind !== undefined) { sets.push('kind = ?'); vals.push(kind === 'B' ? 'B' : 'A'); }
  if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
  // 替换模板底图
  if (req.file) { sets.push('url = ?'); vals.push(publicUrlFor('templates', req.file.filename)); }
  if (template_type_id !== undefined) {
    const tid = template_type_id ? Number(template_type_id) : null;
    sets.push('template_type_id = ?'); vals.push(tid);
    if (tid) {
      const t = db.prepare('SELECT path_kind FROM template_types WHERE id = ?').get(tid) as { path_kind: string } | undefined;
      if (t) { sets.push('kind = ?'); vals.push(t.path_kind === 'B' ? 'B' : 'A'); }
    }
  }
  if (project_id !== undefined) {
    const pid = project_id ? Number(project_id) : null;
    if (pid && !rowInScope(u, pid)) return res.status(403).json({ error: '无权设置到该项目' });
    sets.push('project_id = ?'); vals.push(pid);
  }
  if (sets.length) { vals.push(id); db.prepare(`UPDATE reference_images SET ${sets.join(', ')} WHERE id = ?`).run(...vals); }
  res.json({ ok: true });
});

/** 删除模板：进回收站（文件保留 36 小时，只有超管能恢复/彻底删除） */
referencesRouter.delete('/:id', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const id = Number(req.params.id);
  const r = db.prepare('SELECT brand_id, project_id FROM reference_images WHERE id = ?').get(id) as
    | { brand_id: number; project_id: number | null }
    | undefined;
  if (!r) return res.status(404).json({ error: '模板不存在' });
  if (!rowInScope(u, r.project_id, 'templates')) return res.status(403).json({ error: '无权删除该模板' });
  db.prepare("UPDATE reference_images SET deleted_at = datetime('now') WHERE id = ?").run(id);
  res.json({ ok: true, trashed: true });
});
