export type Role =
  | 'super_admin'
  | 'senior_manager'
  | 'dept_head'
  | 'pm'
  | 'dept_member'
  | 'kos'
  | 'user';

/** 角色中文名 */
export const ROLE_LABEL: Record<Role, string> = {
  super_admin: '超管',
  senior_manager: '高级管理者',
  dept_head: '部门主管',
  pm: '项目经理',
  dept_member: '部门成员',
  kos: '项目成员',
  user: '普通用户',
};

/**
 * 层级：1 最高级（超管）→ 2 下级平级（高级管理者 / 部门主管 / 项目经理）→ 3 再下级（部门成员 / 项目成员KOS / 普通用户）
 * 上级可增删改下级；平级不能互相修改。
 */
export const ROLE_LEVEL: Record<Role, number> = {
  super_admin: 1,
  senior_manager: 2,
  dept_head: 2,
  pm: 2,
  dept_member: 3,
  kos: 3,
  user: 3,
};

/** 全部角色（按层级顺序） */
export const ALL_ROLES: Role[] = ['super_admin', 'senior_manager', 'dept_head', 'pm', 'dept_member', 'kos', 'user'];

export function roleLevel(role: Role): number {
  return ROLE_LEVEL[role] ?? 3;
}

export interface AuthUser {
  id: number;
  username: string;
  role: Role;
  brand_id: number | null;
}

export type AssetType = 'scene' | 'product' | 'sticker';

/** 素材路径类型：A/B，或通用(null) */
export type PathType = 'A' | 'B' | null;
