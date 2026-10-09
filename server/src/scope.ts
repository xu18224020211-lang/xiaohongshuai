import { db } from './db';
import { roleLevel, type AuthUser, type Role } from './types';

/**
 * 全局管理者：超管 / 高级管理者 / 部门主管
 * —— 高级管理者拥有「除管理超管外」的全部权限；部门主管由超管分配，默认拥有全部项目权限
 */
export function isGlobalAdmin(user: AuthUser): boolean {
  return user.role === 'super_admin' || user.role === 'senior_manager' || user.role === 'dept_head';
}

/** 仅超管可执行的动作（如管理 AI 配置 / 站点基础信息 / 其他超管账户） */
export function isSuper(user: AuthUser): boolean {
  return user.role === 'super_admin';
}

/** 可以管理后台的角色（仪表盘 / 业务管理）：超管 / 高级管理者 / 部门主管 / 项目经理 */
export function canEnterAdmin(user: AuthUser): boolean {
  return roleLevel(user.role) <= 2;
}

/**
 * 上级可增删改下级；平级不能互相修改。
 * - 超管：不受限制
 * - 高级管理者：除「超管」以外都能管理（含其他高级管理者、部门主管）
 * - 其他：只能管理层级更低的角色
 */
export function canManageUser(actor: AuthUser, targetRole: Role, targetId?: number): boolean {
  if (actor.id === targetId) return true; // 自己可以改自己（个人资料）
  if (isSuper(actor)) return true;
  if (actor.role === 'senior_manager') return targetRole !== 'super_admin';
  return roleLevel(actor.role) < roleLevel(targetRole);
}

/**
 * 「名下成员」管理权：
 * - 超管：全部；高级管理者：除超管外全部
 * - 项目经理：自己 + 名下项目成员（leader_id = 自己）
 * - 部门主管：自己 + 名下部门成员（leader_id = 自己）
 * - 其他角色：只能改自己（个人资料）
 */
export function canManageUserRow(actor: AuthUser, target: { id: number; role: Role; leader_id?: number | null }): boolean {
  if (actor.id === target.id) return true;
  if (actor.role === 'super_admin') return true;
  if (actor.role === 'senior_manager') return target.role !== 'super_admin';
  if (actor.role === 'pm' || actor.role === 'dept_head') return Number(target.leader_id) === actor.id;
  return false;
}

/** 角色权限矩阵：模块 → none / view / edit */
export type ModulePerm = 'none' | 'view' | 'edit';
export type PermMatrix = Record<string, ModulePerm>;
export const PERM_MODULES = ['products', 'projects', 'users', 'assets', 'templates'] as const;

export interface RoleRow {
  id: number;
  key: string;
  name: string;
  level: number;
  builtin: number;
  perms: PermMatrix;
  sort: number;
}

/** 内置角色缺省权限（roles 表里没有该 key 时的兜底） */
function defaultPerms(role: string): PermMatrix {
  const lvl = roleLevel(role as Role);
  if (role === 'super_admin' || role === 'senior_manager') return { products: 'edit', projects: 'edit', users: 'edit', assets: 'edit', templates: 'edit' };
  if (role === 'pm') return { products: 'view', projects: 'edit', users: 'edit', assets: 'edit', templates: 'edit' };
  if (role === 'dept_head') return { products: 'view', projects: 'view', users: 'edit', assets: 'edit', templates: 'edit' };
  if (role === 'dept_member') return { products: 'view', projects: 'view', users: 'view', assets: 'view', templates: 'view' };
  return lvl <= 2 ? { products: 'view', projects: 'view', users: 'view', assets: 'view', templates: 'view' } : { products: 'none', projects: 'none', users: 'none', assets: 'none', templates: 'none' };
}

export function listRoles(): RoleRow[] {
  const rows = db.prepare('SELECT * FROM roles ORDER BY sort, id').all() as Record<string, unknown>[];
  return rows.map((r) => {
    let perms: PermMatrix = {};
    try { perms = JSON.parse(String(r.perms || '{}')) as PermMatrix; } catch { perms = {}; }
    return {
      id: Number(r.id),
      key: String(r.key),
      name: String(r.name),
      level: Number(r.level ?? 3),
      builtin: Number(r.builtin ?? 0),
      perms,
      sort: Number(r.sort ?? 0),
    };
  });
}

/** 某角色的权限矩阵（自定义角色取表内配置，内置角色取表内或兜底） */
export function rolePerms(role: string): PermMatrix {
  const row = db.prepare('SELECT perms FROM roles WHERE key = ?').get(role) as { perms: string } | undefined;
  if (row) {
    try { return { ...defaultPerms(role), ...(JSON.parse(row.perms || '{}') as PermMatrix) }; } catch { /* 忽略 */ }
  }
  return defaultPerms(role);
}

/** 角色层级（自定义角色默认按最低层级 3 处理） */
export function roleLevelOf(role: string): number {
  const row = db.prepare('SELECT level FROM roles WHERE key = ?').get(role) as { level: number } | undefined;
  return row ? Number(row.level) : roleLevel(role as Role);
}

/** 该角色是否为「内置角色」 */
export function isBuiltinRole(role: string): boolean {
  const row = db.prepare('SELECT builtin FROM roles WHERE key = ?').get(role) as { builtin: number } | undefined;
  return !!row && Number(row.builtin) === 1;
}

const PERM_RANK: Record<ModulePerm, number> = { none: 0, view: 1, edit: 2 };

/** 角色「默认」权限（未单独给该用户勾选时生效） */
export function roleDefaultPerms(role: string): PermMatrix {
  const row = db.prepare('SELECT default_perms FROM roles WHERE key = ?').get(role) as { default_perms: string } | undefined;
  if (row) {
    try {
      const parsed = JSON.parse(row.default_perms || '{}') as PermMatrix;
      if (Object.keys(parsed).length) return { ...defaultPerms(role), ...parsed };
      return { products: 'none', projects: 'none', users: 'none', assets: 'none', templates: 'none' };
    } catch { /* 忽略 */ }
  }
  return defaultPerms(role);
}

/** 某用户被单独勾选的模块权限（覆盖默认值） */
export function userPermOverrides(userId: number): PermMatrix {
  const rows = db.prepare('SELECT module, perm FROM user_perms WHERE user_id = ?').all(userId) as { module: string; perm: string }[];
  const out: PermMatrix = {};
  for (const r of rows) out[r.module] = (r.perm as ModulePerm) || 'none';
  return out;
}

/** 该用户实际生效的模块权限 = 默认/勾选值，且不超过角色上限 */
export function effectivePerms(user: { id: number; role: string }): PermMatrix {
  const cap = rolePerms(user.role);
  const base = roleDefaultPerms(user.role);
  const over = userPermOverrides(user.id);
  const out: PermMatrix = {};
  for (const m of PERM_MODULES) {
    const want = (over[m] ?? base[m] ?? 'none') as ModulePerm;
    const limit = (cap[m] ?? 'none') as ModulePerm;
    out[m] = PERM_RANK[want] > PERM_RANK[limit] ? limit : want;
  }
  return out;
}

/** 能否给某个下属勾选模块权限：超管/高级管理者（除超管外）任意；项目经理/部门主管只能改自己名下成员 */
export function canGrantPerms(actor: AuthUser, target: { id: number; role: Role; leader_id?: number | null }): boolean {
  if (actor.id === target.id) return false; // 不能给自己授权
  if (actor.role === 'super_admin') return true;
  if (actor.role === 'senior_manager') return target.role !== 'super_admin';
  if (actor.role === 'pm' || actor.role === 'dept_head') return Number(target.leader_id) === actor.id;
  return false;
}


/** 可创建的角色：超管=全部；高级管理者=除超管外全部；项目经理=仅项目成员；部门主管=仅部门成员 */
export function creatableRoles(actor: AuthUser): Role[] {
  const all: Role[] = ['super_admin', 'senior_manager', 'dept_head', 'pm', 'dept_member', 'kos', 'user'];
  if (isSuper(actor)) return all;
  if (actor.role === 'senior_manager') return all.filter((r) => r !== 'super_admin');
  if (actor.role === 'pm') return ['kos'];
  if (actor.role === 'dept_head') return ['dept_member'];
  return [];
}

/** 可见品牌 id：全局管理者=null（全部）；其他=自己品牌 ∪ 品牌授权 ∪ 项目/类别授权推导出的品牌 */
export function visibleBrandIds(user: AuthUser): number[] | null {
  if (isGlobalAdmin(user)) return null;
  const ids = new Set<number>();
  if (user.brand_id) ids.add(user.brand_id);
  for (const r of db.prepare('SELECT brand_id FROM user_brands WHERE user_id = ?').all(user.id) as { brand_id: number }[]) {
    ids.add(r.brand_id);
  }
  for (const r of db
    .prepare('SELECT DISTINCT brand_id FROM projects WHERE id IN (SELECT project_id FROM project_members WHERE user_id = ?)')
    .all(user.id) as { brand_id: number }[]) {
    ids.add(r.brand_id);
  }
  for (const r of db
    .prepare(
      `SELECT DISTINCT c.brand_id FROM user_categories uc JOIN categories c ON c.id = uc.category_id WHERE uc.user_id = ?`
    )
    .all(user.id) as { brand_id: number }[]) {
    ids.add(r.brand_id);
  }
  for (const r of db
    .prepare(
      `SELECT DISTINCT p.brand_id FROM projects p WHERE p.category_id IN (SELECT category_id FROM user_categories WHERE user_id = ?)`
    )
    .all(user.id) as { brand_id: number }[]) {
    ids.add(r.brand_id);
  }
  return [...ids];
}

/** 可见类别 id：全局管理者=null（全部）；其他=可见品牌下的类别 ∪ 类别授权 ∪ 项目类别 */
export function visibleCategoryIds(user: AuthUser): number[] | null {
  if (isGlobalAdmin(user)) return null;
  const brands = visibleBrandIds(user);
  const ids = new Set<number>();
  if (brands === null) return null;
  const ph = brands.map(() => '?').join(',');
  if (brands.length) {
    for (const r of db.prepare(`SELECT id FROM categories WHERE brand_id IN (${ph})`).all(...brands) as { id: number }[]) {
      ids.add(r.id);
    }
  }
  for (const r of db.prepare('SELECT category_id FROM user_categories WHERE user_id = ?').all(user.id) as { category_id: number }[]) {
    ids.add(r.category_id);
  }
  for (const r of db
    .prepare(
      `SELECT DISTINCT category_id FROM projects WHERE id IN (SELECT project_id FROM project_members WHERE user_id = ?) AND category_id IS NOT NULL`
    )
    .all(user.id) as { category_id: number }[]) {
    ids.add(r.category_id);
  }
  return [...ids];
}

/** 某项目及其所有子项目 id（递归） */
export function projectWithDescendants(projectId: number): number[] {
  const out: number[] = [projectId];
  const queue = [projectId];
  while (queue.length) {
    const cur = queue.shift()!;
    const kids = db.prepare('SELECT id FROM projects WHERE parent_id = ?').all(cur) as { id: number }[];
    for (const k of kids) {
      if (!out.includes(k.id)) {
        out.push(k.id);
        queue.push(k.id);
      }
    }
  }
  return out;
}

/** 用户负责的项目（项目成员/负责项目经理；兼容品牌、产品授权），含子项目 */
export function ownedProjectIds(user: AuthUser): number[] {
  if (isGlobalAdmin(user)) return [];
  const rows = db
    .prepare(
      `SELECT id FROM projects
        WHERE pm_id = ?
           OR id IN (SELECT project_id FROM project_members WHERE user_id = ?)
           OR brand_id IN (SELECT brand_id FROM user_brands WHERE user_id = ?)
           OR category_id IN (SELECT category_id FROM user_categories WHERE user_id = ?)`
    )
    .all(user.id, user.id, user.id, user.id) as { id: number }[];
  const all = new Set<number>();
  for (const r of rows) for (const d of projectWithDescendants(r.id)) all.add(d);
  return [...all];
}

/** 可见项目过滤（projects 表别名 p） */
export function projectFilter(user: AuthUser): { sql: string; params: (string | number | null)[] } {
  if (isGlobalAdmin(user)) return { sql: '1=1', params: [] };
  const ids = ownedProjectIds(user);
  if (ids.length === 0) return { sql: '1=0', params: [] };
  return { sql: `p.id IN (${ids.map(() => '?').join(',')})`, params: ids };
}

/** 可见设计稿过滤（designs 表别名 d） */
export function designFilter(user: AuthUser): { sql: string; params: (string | number | null)[] } {
  if (isGlobalAdmin(user)) return { sql: '1=1', params: [] };
  const ids = ownedProjectIds(user);
  if (ids.length === 0) return { sql: '1=0', params: [] };
  return { sql: `d.project_id IN (${ids.map(() => '?').join(',')})`, params: ids };
}

/**
 * 素材/模板/生成历史可见性：
 * - 全局管理员（超管/高级管理者/部门主管）：全部
 * - 部门成员（opts.deptMemberAll）：也按「全部可见」处理（只读，不能修改）
 * - 其他：通用（project_id IS NULL，所有人可用）+ 自己项目下的专属
 */
export function assetFilter(user: AuthUser, opts: { deptMemberAll?: boolean } = {}): { sql: string; params: (string | number | null)[] } {
  if (isGlobalAdmin(user)) return { sql: '1=1', params: [] };
  if (opts.deptMemberAll && user.role === 'dept_member') return { sql: '1=1', params: [] };
  const ids = ownedProjectIds(user);
  if (ids.length === 0) return { sql: 'project_id IS NULL', params: [] };
  return {
    sql: `(project_id IS NULL OR project_id IN (${ids.map(() => '?').join(',')}))`,
    params: ids,
  };
}

/** 可只读浏览全部产品目录 / 项目列表的角色：超管 / 高级管理者 / 部门主管 / 项目经理 / 部门成员 */
export function canBrowseAll(user: AuthUser): boolean {
  return isGlobalAdmin(user) || user.role === 'pm' || user.role === 'dept_member';
}

/** 能否访问某项目 */
export function canAccessProject(user: AuthUser, projectId: number): boolean {
  if (isGlobalAdmin(user)) return true;
  return ownedProjectIds(user).includes(projectId);
}

/**
 * 能否「修改」某项目（全局管理员 / 被授予「修改」权限 / 品牌或产品授权的项目经理）
 * —— 对应后台用户里的「查看 / 修改」权限分配
 */
export function canEditProject(user: AuthUser, projectId: number): boolean {
  if (isGlobalAdmin(user)) return true;
  const row = db
    .prepare('SELECT can_edit FROM project_members WHERE user_id = ? AND project_id = ?')
    .get(user.id, projectId) as { can_edit: number } | undefined;
  if (row && (row.can_edit || user.role === 'pm')) return true;
  // 品牌级授权：该品牌下全部项目（含以后新增）
  const proj = db.prepare('SELECT brand_id, category_id FROM projects WHERE id = ?').get(projectId) as
    | { brand_id: number; category_id: number | null }
    | undefined;
  if (!proj) return false;
  const brandGrant = db
    .prepare('SELECT can_edit FROM user_brands WHERE user_id = ? AND brand_id = ?')
    .get(user.id, proj.brand_id) as { can_edit: number } | undefined;
  if (brandGrant?.can_edit) return true;
  if (proj.category_id) {
    const catGrant = db
      .prepare('SELECT can_edit FROM user_categories WHERE user_id = ? AND category_id = ?')
      .get(user.id, proj.category_id) as { can_edit: number } | undefined;
    if (catGrant?.can_edit) return true;
  }
  return false;
}

/** 能否管理某项目（全局管理员 / 有修改权限的下级） */
export function canManageProject(user: AuthUser, projectId: number): boolean {
  if (isGlobalAdmin(user)) return true;
  return canEditProject(user, projectId);
}

/**
 * 能否修改「项目本身」（名称 / 时间 / 项目内产品 / 项目经理）：
 * 超管 / 高级管理者 / 项目经理；部门主管没有修改项目的权限（只能查看）
 */
export function canEditProjectMeta(user: AuthUser, projectId: number): boolean {
  if (user.role === 'dept_head') return false;
  if (user.role === 'super_admin' || user.role === 'senior_manager') return true;
  return canEditProject(user, projectId);
}

/**
 * 能否新增 / 修改 / 删除素材与模板：
 * - 超管 / 高级管理者 / 部门主管：全部
 * - 项目经理：通用素材/模板 + 自己权限内项目的专属素材/模板
 * - 部门成员 / 项目成员 / 普通用户：只读（无增删改权限）
 */
export function canManageAssets(user: AuthUser): boolean {
  return isGlobalAdmin(user) || user.role === 'pm';
}

/**
 * 行级素材/模板管理权（查看 / 修改）：
 * - 全局管理员（超管 / 高级管理者 / 部门主管）：全部（含所有通用素材与模板）
 * - 项目经理：通用素材/模板 + 自己权限内项目的专属素材/模板
 * - 被授予「修改」权限的项目成员 / 部门成员：该项目内的专属素材/模板
 * - 普通用户：只读（后台只有个人信息权限）
 */
/**
 * 是否被授予了某个模块的「修改」权限（部门主管给部门成员勾选后即可用）。
 * 角色的权限上限由 effectivePerms 内部截断，所以这里直接看结果即可。
 */
export function canEditModule(user: AuthUser, module: 'assets' | 'templates'): boolean {
  if (canManageAssets(user)) return true;
  return effectivePerms(user)[module] === 'edit';
}

export function rowInScope(user: AuthUser, projectId: number | null, module: 'assets' | 'templates' = 'assets'): boolean {
  if (isGlobalAdmin(user)) return true;
  // 被授予「素材 / 模板 修改」权限的成员（如部门成员）：可修改全部行
  if (canEditModule(user, module)) return true;
  if (user.role === 'user') return false;
  if (projectId == null) return user.role === 'pm'; // 通用素材/模板：项目经理可管理
  return canEditProject(user, projectId);
}

/** 能否新增素材 / 模板：管理员、项目经理、被授予「修改」权限的成员，或被授予项目修改权限者 */
export function canUploadAssets(user: AuthUser, projectId: number | null, module: 'assets' | 'templates' = 'assets'): boolean {
  if (canManageAssets(user)) return true;
  if (canEditModule(user, module)) return true;
  if (user.role === 'user') return false;
  return projectId != null && canEditProject(user, projectId);
}

/** 项目经理自己权限内项目的 id（用于素材/模板/产品可见性） */
export function pmProjectIds(user: AuthUser): number[] {
  return ownedProjectIds(user);
}

/** 品牌相关 */
export function canAccessBrand(user: AuthUser, brandId: number): boolean {
  if (isGlobalAdmin(user)) return true;
  return user.brand_id === brandId;
}

export function firstBrandId(): number | null {
  const r = db.prepare('SELECT id FROM brands ORDER BY id LIMIT 1').get() as { id: number } | undefined;
  return r?.id ?? null;
}
