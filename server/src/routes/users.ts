import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { requireAuth, type AuthedRequest } from '../middleware';
import { canAccessBrand, canAccessProject, canEditProject, canGrantPerms, canManageUserRow, creatableRoles, effectivePerms, isGlobalAdmin, isSuper, ownedProjectIds, rolePerms, userPermOverrides } from '../scope';
import { ROLE_LABEL, roleLevel, type Role } from '../types';

export const usersRouter = Router();
usersRouter.use(requireAuth);

/** 新用户默认密码（超管账户除外） */
export const DEFAULT_PASSWORD = '@123456';

function safe(u: Record<string, unknown>) {
  const id = Number(u.id);
  const projRows = db
    .prepare(
      `SELECT pm.project_id, p.name AS project_name, pm.can_edit
         FROM project_members pm LEFT JOIN projects p ON p.id = pm.project_id
        WHERE pm.user_id = ?
        UNION
       SELECT p.id AS project_id, p.name AS project_name, 1 AS can_edit
         FROM projects p WHERE p.pm_id = ?
        ORDER BY project_id`
    )
    .all(id, id) as { project_id: number; project_name: string | null; can_edit: number }[];
  const projects = projRows.map((r) => ({ project_id: r.project_id, project_name: r.project_name, can_edit: !!r.can_edit }));
  const brandRows = db
    .prepare(
      `SELECT ub.brand_id, ub.can_edit, b.name AS brand_name
         FROM user_brands ub LEFT JOIN brands b ON b.id = ub.brand_id
        WHERE ub.user_id = ? ORDER BY ub.brand_id`
    )
    .all(id) as { brand_id: number; can_edit: number; brand_name: string | null }[];
  const leaderId = u.leader_id == null ? null : Number(u.leader_id);
  const leader = leaderId
    ? (db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(leaderId) as
      | { id: number; username: string; display_name: string | null }
      | undefined)
    : undefined;
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    email: u.email,
    role: u.role,
    brand_id: u.brand_id,
    leader_id: leaderId,
    leader_name: leader ? leader.display_name || leader.username : null,
    created_at: u.created_at,
    projects,
    project_ids: projects.map((p) => p.project_id),
    project_names: projects.map((p) => p.project_name || `项目 ${p.project_id}`),
    brand_grants: brandRows.map((r) => ({ brand_id: r.brand_id, brand_name: r.brand_name, can_edit: !!r.can_edit })),
    // 模块权限：生效值 / 角色上限 / 是否被单独勾选（供后台勾选矩阵使用）
    perms: effectivePerms({ id, role: String(u.role) }),
    perm_caps: rolePerms(String(u.role)),
    perm_overrides: userPermOverrides(id),
  };
}

/** PM 管辖项目内的成员 id 集合 */
function membersOfOwnedProjects(userId: number): number[] {
  const ids = ownedProjectIds({ id: userId, username: '', role: 'pm', brand_id: null });
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT DISTINCT user_id AS id FROM project_members WHERE project_id IN (${ph})`).all(...ids) as { id: number }[];
  return rows.map((r) => r.id);
}

// 列表：按「层级 + 名下成员」返回
// - 超管 / 高级管理者：全部
// - 项目经理：自己 + 名下项目成员（leader_id = 自己）
// - 部门主管：自己 + 名下部门成员（leader_id = 自己）
// - 部门成员：自己 + 所属主管 + 同部门用户
// - 项目成员 / 普通用户：只有自己
usersRouter.get('/', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const byIds = (ids: number[]) => {
    const list = [...new Set(ids)].filter((n) => Number.isFinite(n) && n > 0);
    if (!list.length) return [] as Record<string, unknown>[];
    const ph = list.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM users WHERE id IN (${ph}) ORDER BY id`).all(...list) as Record<string, unknown>[];
  };
  let rows: Record<string, unknown>[];
  if (u.role === 'super_admin' || u.role === 'senior_manager') {
    rows = db.prepare('SELECT * FROM users ORDER BY id').all() as Record<string, unknown>[];
  } else if (u.role === 'pm' || u.role === 'dept_head') {
    const members = db.prepare('SELECT id FROM users WHERE leader_id = ?').all(u.id) as { id: number }[];
    rows = byIds([u.id, ...members.map((m) => m.id)]);
  } else if (u.role === 'dept_member') {
    const me = db.prepare('SELECT leader_id FROM users WHERE id = ?').get(u.id) as { leader_id: number | null } | undefined;
    const leaderId = me?.leader_id ?? null;
    const sibs = leaderId ? (db.prepare('SELECT id FROM users WHERE leader_id = ?').all(leaderId) as { id: number }[]) : [];
    rows = byIds([u.id, ...(leaderId ? [leaderId] : []), ...sibs.map((s) => s.id)]);
  } else {
    rows = byIds([u.id]);
  }
  res.json({ users: rows.map(safe) });
});

// 新建用户：上级可创建下级（超管可创建全部）
// 项目成员 / 部门成员必须归属到某个项目经理 / 部门主管名下
usersRouter.post('/', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const { username, password, display_name, email, role, brand_id, project_id, project_ids, project_perms, brand_perms, leader_id } = (req.body || {}) as {
    username?: string;
    password?: string;
    display_name?: string;
    email?: string;
    role?: Role;
    brand_id?: number;
    project_id?: number;
    project_ids?: number[];
    project_perms?: { project_id: number; can_edit?: boolean }[];
    brand_perms?: { brand_id: number; can_edit?: boolean }[];
    leader_id?: number;
  };
  if (!username) return res.status(400).json({ error: '用户名不能为空' });
  let r: Role = role || 'user';
  let brandId: number | null = brand_id ?? null;

  const allowed = creatableRoles(u);
  const customKeys = (db.prepare('SELECT key FROM roles WHERE builtin = 0').all() as { key: string }[]).map((x) => x.key);
  const canCreate = allowed.includes(r) || ((u.role === 'super_admin' || u.role === 'senior_manager') && customKeys.includes(String(r)));
  if (!canCreate) {
    return res.status(403).json({ error: `无权创建「${ROLE_LABEL[r] || r}」账户` });
  }
  // 需要归属负责人的角色：项目成员 → 项目经理；部门成员 → 部门主管
  const needsLeader = r === 'kos' || r === 'dept_member';
  let leaderId: number | null = leader_id ? Number(leader_id) : null;
  if (u.role === 'pm') leaderId = u.id;          // 项目经理只能建自己名下的项目成员
  if (u.role === 'dept_head') leaderId = u.id;   // 部门主管只能建自己名下的部门成员
  if (needsLeader) {
    if (!leaderId) return res.status(400).json({ error: `「${ROLE_LABEL[r] || r}」必须归属到一位${r === 'kos' ? '项目经理' : '部门主管'}名下` });
    const leader = db.prepare('SELECT id, role FROM users WHERE id = ?').get(leaderId) as { id: number; role: Role } | undefined;
    const want: Role = r === 'kos' ? 'pm' : 'dept_head';
    if (!leader || leader.role !== want) {
      return res.status(400).json({ error: `归属负责人必须是「${ROLE_LABEL[want]}」角色` });
    }
  } else {
    leaderId = null;
  }
  if (isGlobalAdmin(u)) {
    if (r !== 'super_admin' && !brandId) brandId = u.brand_id ?? null;
  } else if (u.role === 'pm' || u.role === 'dept_head') {
    // 项目经理 / 部门主管：只能建自己名下的成员；可选加入自己管辖的某个项目
    if (project_id && !canAccessProject(u, Number(project_id))) return res.status(403).json({ error: '无权加入该项目' });
    if (u.brand_id) brandId = u.brand_id;
  }

  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ error: '用户名已存在' });
  }
  // 默认密码：除超管外，新用户默认 @123456
  let pwd = (password || '').trim();
  if (!pwd) {
    if (r === 'super_admin') return res.status(400).json({ error: '超管账户必须单独设置密码' });
    pwd = DEFAULT_PASSWORD;
  } else if (pwd.length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' });
  }
  const hash = bcrypt.hashSync(pwd, 10);
  const info = db
    .prepare('INSERT INTO users (username, password_hash, display_name, email, role, brand_id, leader_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(username, hash, display_name || username, email || null, r, brandId, leaderId);
  const newId = Number(info.lastInsertRowid);
  if ((u.role === 'pm' || u.role === 'dept_head') && project_id) {
    db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, can_edit) VALUES (?, ?, 1)').run(Number(project_id), newId);
  }
  // 管理员建号时可直接分配项目权限（查看 / 修改）
  if (isGlobalAdmin(u)) {
    if (Array.isArray(project_perms)) {
      for (const perm of project_perms) {
        const pid = Number(perm?.project_id);
        if (!pid || !canAccessProject(u, pid)) continue;
        db.prepare('INSERT OR REPLACE INTO project_members (project_id, user_id, can_edit) VALUES (?, ?, ?)')
          .run(pid, newId, perm?.can_edit ? 1 : 0);
      }
    } else if (Array.isArray(project_ids)) {
      for (const pid of project_ids.filter(Number.isFinite)) {
        if (!canAccessProject(u, Number(pid))) continue;
        db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, can_edit) VALUES (?, ?, 1)').run(Number(pid), newId);
      }
    }
    // 品牌级权限：该品牌下全部项目（含以后新增）
    if (Array.isArray(brand_perms)) {
      for (const perm of brand_perms) {
        const bid = Number(perm?.brand_id);
        if (!bid || !canAccessBrand(u, bid)) continue;
        db.prepare('INSERT OR REPLACE INTO user_brands (user_id, brand_id, can_edit) VALUES (?, ?, ?)')
          .run(newId, bid, perm?.can_edit ? 1 : 0);
      }
    }
  }
  res.status(201).json({ user: safe({ id: newId, username, display_name: display_name || username, email: email || null, role: r, brand_id: brandId, leader_id: leaderId }) });
});

// 修改用户
usersRouter.patch('/:id', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
    | { id: number; role: Role; brand_id: number | null; leader_id: number | null }
    | undefined;
  if (!target) return res.status(404).json({ error: '用户不存在' });

  const { username, display_name, role, brand_id, password, email, leader_id } = (req.body || {}) as {
    username?: string;
    display_name?: string;
    role?: Role;
    brand_id?: number;
    password?: string;
    email?: string;
    leader_id?: number | null;
  };

  // 只能改自己 + 自己名下的成员（超管 / 高级管理者不受限制）
  if (!canManageUserRow(u, target)) {
    return res.status(403).json({ error: `「${ROLE_LABEL[u.role] || u.role}」无权修改该账户（只能管理自己名下的成员）` });
  }
  // 项目经理 / 部门主管不能改自己的角色
  const selfRoleLocked = id === u.id && (u.role === 'pm' || u.role === 'dept_head');
  if (role !== undefined && role !== target.role && selfRoleLocked) {
    return res.status(403).json({ error: '不能修改自己的角色' });
  }
  if (role !== undefined && role !== target.role) {
    if (!isSuper(u)) {
      const allowed = creatableRoles(u);
      if (!allowed.includes(role)) return res.status(403).json({ error: `无权把角色改为「${ROLE_LABEL[role] || role}」` });
    }
  }
  const canEditRoleOrBrand = isGlobalAdmin(u);

  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (username !== undefined && username) {
    const dup = db.prepare('SELECT id FROM users WHERE username = ? AND id <> ?').get(username, id);
    if (dup) return res.status(409).json({ error: '用户名已被占用' });
    sets.push('username = ?'); vals.push(username);
  }
  if (display_name !== undefined) { sets.push('display_name = ?'); vals.push(display_name); }
  if (email !== undefined) { sets.push('email = ?'); vals.push(email || null); }
  if (role !== undefined && canEditRoleOrBrand) { sets.push('role = ?'); vals.push(role); }
  if (brand_id !== undefined && canEditRoleOrBrand) { sets.push('brand_id = ?'); vals.push(brand_id || null); }
  // 归属负责人：只有超管 / 高级管理者可以调整
  if (leader_id !== undefined && (u.role === 'super_admin' || u.role === 'senior_manager')) {
    sets.push('leader_id = ?'); vals.push(leader_id ? Number(leader_id) : null);
  }
  if (password) { sets.push('password_hash = ?'); vals.push(bcrypt.hashSync(password, 10)); }
  if (sets.length) { vals.push(id); db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals); }
  res.json({ ok: true });
});

// 删除用户
usersRouter.delete('/:id', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const id = Number(req.params.id);
  if (id === u.id) return res.status(400).json({ error: '不能删除自己' });
  const target = db.prepare('SELECT id, role, leader_id FROM users WHERE id = ?').get(id) as { id: number; role: Role; leader_id: number | null } | undefined;
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (!canManageUserRow(u, target)) {
    return res.status(403).json({ error: `「${ROLE_LABEL[u.role] || u.role}」无权删除该账户（只能管理自己名下的成员）` });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---------- 模块权限：读取（自己 / 可授权的下属） ----------
usersRouter.get('/:id/perms', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const id = Number(req.params.id);
  const target = db.prepare('SELECT id, role, leader_id FROM users WHERE id = ?').get(id) as
    | { id: number; role: Role; leader_id: number | null }
    | undefined;
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (id !== u.id && !canGrantPerms(u, target)) return res.status(403).json({ error: '无权查看该用户的权限' });
  res.json({
    perms: effectivePerms({ id, role: String(target.role) }),
    caps: rolePerms(String(target.role)),
    overrides: userPermOverrides(id),
  });
});

// ---------- 模块权限：勾选分配（超管 / 高级管理者 / 项目经理与部门主管给自己的名下成员） ----------
usersRouter.put('/:id/perms', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const id = Number(req.params.id);
  const target = db.prepare('SELECT id, role, leader_id FROM users WHERE id = ?').get(id) as
    | { id: number; role: Role; leader_id: number | null }
    | undefined;
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (!canGrantPerms(u, target)) return res.status(403).json({ error: '只能给自己名下的成员分配权限' });

  const { perms } = (req.body || {}) as { perms?: Record<string, string> };
  const cap = rolePerms(String(target.role));
  const rank: Record<string, number> = { none: 0, view: 1, edit: 2 };
  const keep = ['products', 'projects', 'users', 'assets', 'templates'];
  for (const m of keep) {
    const want = String(perms?.[m] ?? 'none');
    const wv = rank[want] === undefined ? 'none' : want;
    const cv = String(cap[m] ?? 'none');
    const real = rank[wv] > rank[cv] ? cv : wv;
    db.prepare('INSERT INTO user_perms (user_id, module, perm) VALUES (?, ?, ?) ON CONFLICT(user_id, module) DO UPDATE SET perm = excluded.perm')
      .run(id, m, real);
  }
  res.json({ ok: true, perms: effectivePerms({ id, role: String(target.role) }) });
});

// 项目授权读取（查看 / 修改）
usersRouter.get('/:id/projects', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const id = Number(req.params.id);
  if (roleLevel(u.role) === 3) return res.status(403).json({ error: '无权查看' });
  if (u.role === 'pm' && !membersOfOwnedProjects(u.id).includes(id) && id !== u.id) {
    return res.status(403).json({ error: '无权查看' });
  }
  res.json(readPermissions(id));
});

/** 读取某用户的全部权限：项目级 + 品牌级（整品牌，含以后新增项目） */
function readPermissions(id: number) {
  const rows = db
    .prepare(
      `SELECT pm.project_id, pm.can_edit, p.name AS project_name, p.brand_id
         FROM project_members pm LEFT JOIN projects p ON p.id = pm.project_id
        WHERE pm.user_id = ? ORDER BY pm.project_id`
    )
    .all(id) as { project_id: number; can_edit: number; project_name: string | null; brand_id: number | null }[];
  const brandRows = db
    .prepare(
      `SELECT ub.brand_id, ub.can_edit, b.name AS brand_name
         FROM user_brands ub LEFT JOIN brands b ON b.id = ub.brand_id
        WHERE ub.user_id = ? ORDER BY ub.brand_id`
    )
    .all(id) as { brand_id: number; can_edit: number; brand_name: string | null }[];
  return {
    project_ids: rows.map((r) => r.project_id),
    grants: rows.map((r) => ({ project_id: r.project_id, project_name: r.project_name, can_edit: !!r.can_edit })),
    brand_grants: brandRows.map((r) => ({ brand_id: r.brand_id, brand_name: r.brand_name, can_edit: !!r.can_edit })),
  };
}

usersRouter.put('/:id/projects', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const id = Number(req.params.id);
  if (roleLevel(u.role) === 3) return res.status(403).json({ error: '无权设置' });
  const target = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: Role } | undefined;
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (target.role === 'super_admin') return res.status(400).json({ error: '超管无需绑定项目' });
  const { project_ids, grants } = (req.body || {}) as {
    project_ids?: number[];
    grants?: { project_id: number; can_edit?: boolean }[];
  };
  // 兼容两种入参：project_ids（默认给「修改」） / grants（带 can_edit）
  const list: { project_id: number; can_edit: boolean }[] = Array.isArray(grants) && grants.length
    ? grants.map((g) => ({ project_id: Number(g.project_id), can_edit: !!g.can_edit }))
    : (project_ids || []).map((pid) => ({ project_id: Number(pid), can_edit: true }));
  for (const g of list) {
    if (!Number.isFinite(g.project_id)) return res.status(400).json({ error: '项目参数不正确' });
    const exists = db.prepare('SELECT id FROM projects WHERE id = ?').get(g.project_id);
    if (!exists) return res.status(400).json({ error: `项目 ${g.project_id} 不存在` });
    if (!canAccessProject(u, g.project_id)) return res.status(403).json({ error: '无权操作该项目' });
  }
  db.prepare('DELETE FROM project_members WHERE user_id = ?').run(id);
  for (const g of list) {
    db.prepare('INSERT OR REPLACE INTO project_members (project_id, user_id, can_edit) VALUES (?, ?, ?)')
      .run(g.project_id, id, g.can_edit ? 1 : 0);
  }
  // 项目经理：给项目经理「分配项目」= 同步项目上的项目经理（项目页与用户页保持一致）
  const name = db.prepare('SELECT display_name, username FROM users WHERE id = ?').get(id) as { display_name: string | null; username: string } | undefined;
  const pmName = name ? (name.display_name || name.username) : null;
  if (target.role === 'pm') {
    const keep = new Set(list.map((g) => g.project_id));
    // 取消掉不再归属于他的项目
    const mine = db.prepare('SELECT id FROM projects WHERE pm_id = ?').all(id) as { id: number }[];
    for (const p of mine) {
      if (!keep.has(p.id)) db.prepare('UPDATE projects SET pm_id = NULL, pm_name = NULL WHERE id = ?').run(p.id);
    }
    for (const g of list) {
      db.prepare('UPDATE projects SET pm_id = ?, pm_name = ? WHERE id = ?').run(id, pmName, g.project_id);
    }
  }
  res.json({ ok: true });
});

// ---------- 权限总入口：项目级 + 品牌级（整品牌）----------
usersRouter.get('/:id/permissions', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const id = Number(req.params.id);
  // 层级 3 的用户只能查看「自己的」权限（后台据此刻画只读 / 可修改范围）
  if (id !== u.id && roleLevel(u.role) === 3) return res.status(403).json({ error: '无权查看' });
  if (u.role === 'pm' && !membersOfOwnedProjects(u.id).includes(id) && id !== u.id) {
    return res.status(403).json({ error: '无权查看' });
  }
  res.json(readPermissions(id));
});

usersRouter.put('/:id/permissions', (req, res) => {
  const u = (req as AuthedRequest).user!;
  const id = Number(req.params.id);
  if (roleLevel(u.role) === 3) return res.status(403).json({ error: '无权设置' });
  const target = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: Role } | undefined;
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (target.role === 'super_admin') return res.status(400).json({ error: '超管默认拥有全部权限，无需分配' });

  const { project_grants, brand_grants } = (req.body || {}) as {
    project_grants?: { project_id: number; can_edit?: boolean }[];
    brand_grants?: { brand_id: number; can_edit?: boolean }[];
  };

  const projList = (project_grants || []).map((g) => ({ project_id: Number(g.project_id), can_edit: !!g.can_edit }));
  for (const g of projList) {
    if (!Number.isFinite(g.project_id)) return res.status(400).json({ error: '项目参数不正确' });
    if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(g.project_id)) {
      return res.status(400).json({ error: `项目 ${g.project_id} 不存在` });
    }
    if (!canAccessProject(u, g.project_id)) return res.status(403).json({ error: '无权操作该项目' });
  }
  const brandList = (brand_grants || []).map((g) => ({ brand_id: Number(g.brand_id), can_edit: !!g.can_edit }));
  for (const g of brandList) {
    if (!Number.isFinite(g.brand_id)) return res.status(400).json({ error: '品牌参数不正确' });
    if (!db.prepare('SELECT id FROM brands WHERE id = ?').get(g.brand_id)) {
      return res.status(400).json({ error: `品牌 ${g.brand_id} 不存在` });
    }
    if (!canAccessBrand(u, g.brand_id)) return res.status(403).json({ error: '无权操作该品牌' });
  }

  db.prepare('DELETE FROM project_members WHERE user_id = ?').run(id);
  for (const g of projList) {
    db.prepare('INSERT OR REPLACE INTO project_members (project_id, user_id, can_edit) VALUES (?, ?, ?)')
      .run(g.project_id, id, g.can_edit ? 1 : 0);
  }
  db.prepare('DELETE FROM user_brands WHERE user_id = ?').run(id);
  for (const g of brandList) {
    db.prepare('INSERT OR REPLACE INTO user_brands (user_id, brand_id, can_edit) VALUES (?, ?, ?)')
      .run(id, g.brand_id, g.can_edit ? 1 : 0);
  }
  res.json({ ok: true, ...readPermissions(id) });
});
