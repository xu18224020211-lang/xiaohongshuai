import { Router, type Request, type Response } from 'express';
import { db } from '../db';
import { requireAuth, type AuthedRequest } from '../middleware';
import { isGlobalAdmin } from '../scope';

export const templateTypesRouter = Router();
templateTypesRouter.use(requireAuth);

/**
 * 模板标签类型（用户可增删改）：如 底图+压字 / 大字报 / 拼图+压字 / 产品+AI背景+压字 / AI背景
 * 每个标签可配置：画布界面 path_kind（A=底图界面 / B=产品+AI背景界面）、默认文字提示词 prompt_text、
 * 默认背景提示词 prompt_scene、是否拼图容器 puzzle（1=显示 2/3/4 拼图单选）
 */
templateTypesRouter.get('/', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM reference_images r WHERE r.template_type_id = t.id AND r.deleted_at IS NULL) AS template_count
         FROM template_types t ORDER BY t.sort, t.id`
    )
    .all();
  // 「智能参考」标签永远排最前（前端首页标签与画布下拉都按此顺序）
  const list = [...(rows as { name?: string }[])].sort((a, b) => {
    const sa = a.name && /智能参考/.test(a.name) ? 0 : 1;
    const sb = b.name && /智能参考/.test(b.name) ? 0 : 1;
    return sa - sb;
  });
  res.json({ types: list });
});

function ensureAdmin(req: Request, res: Response): boolean {
  const u = (req as AuthedRequest).user!;
  if (!isGlobalAdmin(u)) {
    res.status(403).json({ error: '仅管理员可管理模板标签' });
    return false;
  }
  return true;
}

templateTypesRouter.post('/', (req, res) => {
  if (!ensureAdmin(req, res)) return;
  const { name, path_kind, prompt_text, prompt_scene, puzzle } = (req.body || {}) as {
    name?: string; path_kind?: string; prompt_text?: string; prompt_scene?: string; puzzle?: number | boolean;
  };
  if (!name) return res.status(400).json({ error: '标签名不能为空' });
  if (db.prepare('SELECT id FROM template_types WHERE name = ?').get(name)) {
    return res.status(409).json({ error: '该标签已存在' });
  }
  const kind = path_kind === 'B' ? 'B' : 'A';
  const puzzleFlag = puzzle ? 1 : 0;
  const max = db.prepare('SELECT COALESCE(MAX(sort), 0) AS s FROM template_types').get() as { s: number };
  const info = db
    .prepare('INSERT INTO template_types (name, path_kind, sort, prompt_text, prompt_scene, puzzle) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name, kind, max.s + 1, prompt_text || null, prompt_scene || null, puzzleFlag);
  res.status(201).json({ type: { id: Number(info.lastInsertRowid), name, path_kind: kind, prompt_text: prompt_text || null, prompt_scene: prompt_scene || null, puzzle: puzzleFlag } });
});

templateTypesRouter.patch('/:id', (req, res) => {
  if (!ensureAdmin(req, res)) return;
  const id = Number(req.params.id);
  const row = db.prepare('SELECT id FROM template_types WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '标签不存在' });
  const { name, path_kind, prompt_text, prompt_scene, puzzle, sort } = (req.body || {}) as {
    name?: string; path_kind?: string; prompt_text?: string; prompt_scene?: string; puzzle?: number | boolean; sort?: number;
  };
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (sort !== undefined) { sets.push('sort = ?'); vals.push(Number(sort) || 0); }
  if (name !== undefined && name) {
    const dup = db.prepare('SELECT id FROM template_types WHERE name = ? AND id <> ?').get(name, id);
    if (dup) return res.status(409).json({ error: '该标签已存在' });
    sets.push('name = ?');
    vals.push(name);
  }
  if (path_kind !== undefined) { sets.push('path_kind = ?'); vals.push(path_kind === 'B' ? 'B' : 'A'); }
  if (prompt_text !== undefined) { sets.push('prompt_text = ?'); vals.push(prompt_text || null); }
  if (prompt_scene !== undefined) { sets.push('prompt_scene = ?'); vals.push(prompt_scene || null); }
  if (puzzle !== undefined) { sets.push('puzzle = ?'); vals.push(puzzle ? 1 : 0); }
  if (sets.length) {
    vals.push(id);
    db.prepare(`UPDATE template_types SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    // 同步模板的 kind（画布路径 A/B）
    const kind = db.prepare('SELECT path_kind FROM template_types WHERE id = ?').get(id) as { path_kind: string };
    db.prepare('UPDATE reference_images SET kind = ? WHERE template_type_id = ?').run(kind.path_kind, id);
  }
  res.json({ ok: true });
});

templateTypesRouter.delete('/:id', (req, res) => {
  if (!ensureAdmin(req, res)) return;
  const id = Number(req.params.id);
  const cnt = db.prepare('SELECT COUNT(*) AS c FROM reference_images WHERE template_type_id = ?').get(id) as { c: number };
  if (cnt.c > 0) return res.status(400).json({ error: `该标签下还有 ${cnt.c} 个模板，请先改到其他标签` });
  db.prepare('DELETE FROM template_types WHERE id = ?').run(id);
  res.json({ ok: true });
});
