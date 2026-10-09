import { Router } from 'express';
import { db } from '../db';
import { requireAuth, type AuthedRequest } from '../middleware';
import { PERM_MODULES, isSuper, listRoles, type ModulePerm } from '../scope';

export const rolesRouter = Router();
rolesRouter.use(requireAuth);

const PERM_VALUES: ModulePerm[] = ['none', 'view', 'edit'];

/** 规范化权限矩阵：只接受 none / view / edit，模块固定 */
function normalizePerms(input: unknown): Record<string, ModulePerm> {
  const src = (input || {}) as Record<string, unknown>;
  const out: Record<string, ModulePerm> = {};
  for (const m of PERM_MODULES) {
    const v = String(src[m] ?? 'none') as ModulePerm;
    out[m] = PERM_VALUES.includes(v) ? v : 'none';
  }
  return out;
}

// 角色列表：所有登录用户可读（前台需要显示角色名称 / 权限）
rolesRouter.get('/', (_req, res) => {
  res.json({ roles: listRoles(), modules: PERM_MODULES });
});

// 新建角色（仅超管）
rolesRouter.post('/', (req, res) => {
  const u = (req as AuthedRequest).user!;
  if (!isSuper(u)) return res.status(403).json({ error: '仅超管可新建角色' });
  const { name, level, perms } = (req.body || {}) as { name?: string; level?: number; perms?: unknown };
  const roleName = (name || '').trim();
  if (!roleName) return res.status(400).json({ error: '角色名称不能为空' });
  if (db.prepare('SELECT id FROM roles WHERE name = ?').get(roleName)) return res.status(409).json({ error: '角色名称已存在' });
  // key 由名称生成：custom_时间戳（避免中文/重复问题）
  const key = `custom_${Date.now().toString(36)}`;
  const lv = Number(level) === 2 ? 2 : 3;
  const info = db
    .prepare('INSERT INTO roles (key, name, level, builtin, perms, sort) VALUES (?, ?, ?, 0, ?, ?)')
    .run(key, roleName, lv, JSON.stringify(normalizePerms(perms)), 100);
  const role = listRoles().find((r) => r.id === Number(info.lastInsertRowid));
  res.status(201).json({ role });
});

// 修改角色权限 / 名称（仅超管；内置角色只能改权限，不能改名称与层级）
rolesRouter.patch('/:id', (req, res) => {
  const u = (req as AuthedRequest).user!;
  if (!isSuper(u)) return res.status(403).json({ error: '仅超管可修改角色权限' });
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM roles WHERE id = ?').get(id) as { key: string; builtin: number; name: string } | undefined;
  if (!row) return res.status(404).json({ error: '角色不存在' });
  const { name, perms, level } = (req.body || {}) as { name?: string; perms?: unknown; level?: number };
  const sets: string[] = [];
  const vals: (string | number)[] = [];
  if (perms !== undefined) { sets.push('perms = ?'); vals.push(JSON.stringify(normalizePerms(perms))); }
  if (name !== undefined && !row.builtin) {
    const nm = name.trim();
    if (!nm) return res.status(400).json({ error: '角色名称不能为空' });
    const dup = db.prepare('SELECT id FROM roles WHERE name = ? AND id <> ?').get(nm, id);
    if (dup) return res.status(409).json({ error: '角色名称已存在' });
    sets.push('name = ?'); vals.push(nm);
  }
  if (level !== undefined && !row.builtin) { sets.push('level = ?'); vals.push(Number(level) === 2 ? 2 : 3); }
  if (sets.length) { vals.push(id); db.prepare(`UPDATE roles SET ${sets.join(', ')} WHERE id = ?`).run(...vals); }
  res.json({ ok: true, role: listRoles().find((r) => r.id === id) });
});

// 删除角色（仅超管；内置角色不可删；有用户使用中不可删）
rolesRouter.delete('/:id', (req, res) => {
  const u = (req as AuthedRequest).user!;
  if (!isSuper(u)) return res.status(403).json({ error: '仅超管可删除角色' });
  const id = Number(req.params.id);
  const row = db.prepare('SELECT key, builtin FROM roles WHERE id = ?').get(id) as { key: string; builtin: number } | undefined;
  if (!row) return res.status(404).json({ error: '角色不存在' });
  if (row.builtin) return res.status(403).json({ error: '内置角色不可删除' });
  const used = db.prepare('SELECT COUNT(*) AS n FROM users WHERE role = ?').get(row.key) as { n: number };
  if (used.n > 0) return res.status(400).json({ error: `还有 ${used.n} 个用户使用该角色，不能删除` });
  db.prepare('DELETE FROM roles WHERE id = ?').run(id);
  res.json({ ok: true });
});
