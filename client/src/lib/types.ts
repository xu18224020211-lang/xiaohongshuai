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
 * 层级：1 超管（最高级）→ 2 高级管理者 / 部门主管 / 项目经理（下级平级）→ 3 部门成员 / 项目成员KOS / 普通用户
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

export const roleLevel = (role: Role): number => ROLE_LEVEL[role] ?? 3;

/** 全部角色（按层级顺序） */
export const ALL_ROLES: Role[] = ['super_admin', 'senior_manager', 'dept_head', 'pm', 'dept_member', 'kos', 'user'];

/** 全局管理者：超管 / 高级管理者 / 部门主管（默认全部品牌、全部项目） */
export const isGlobalRole = (role: Role): boolean =>
  role === 'super_admin' || role === 'senior_manager' || role === 'dept_head';

/**
 * 可在下拉里浏览「全部项目」的角色：超管 / 高级管理者 / 部门主管（默认全部品牌与项目）+ 部门成员
 * （部门成员只读，可查看所有项目的素材与模板）。项目经理仍只看到自己负责的项目。
 */
export const canBrowseAllProjects = (role: Role | undefined | null): boolean =>
  !!role && (isGlobalRole(role) || role === 'dept_member');

export interface User {
  id: number;
  username: string;
  display_name: string | null;
  email?: string | null;
  role: Role;
  brand_id: number | null;
  /** 所属项目（含查看/修改权限） */
  projects?: ProjectGrant[];
  project_ids?: number[];
  project_names?: string[];
  /** 品牌级权限（整个品牌下的全部项目） */
  brand_grants?: BrandGrant[];
  /** 归属负责人：项目成员 → 项目经理；部门成员 → 部门主管 */
  leader_id?: number | null;
  leader_name?: string | null;
  /** 模块权限：生效值 / 角色上限 / 单独勾选值（none | view | edit） */
  perms?: Record<string, string>;
  perm_caps?: Record<string, string>;
  perm_overrides?: Record<string, string>;
}

/** 角色（内置角色 + 超管自定义角色） */
export interface RoleDef {
  id: number;
  key: Role | string;
  name: string;
  level: number;
  builtin: number;
  /** 模块 → none / view / edit */
  perms: Record<string, string>;
  sort: number;
}

/** 项目权限：can_edit = 可修改，否则仅查看 */
export interface ProjectGrant {
  project_id: number;
  project_name?: string | null;
  can_edit: boolean;
}

/** 品牌级权限：该品牌下全部项目（含以后新增项目） */
export interface BrandGrant {
  brand_id: number;
  brand_name?: string | null;
  can_edit: boolean;
}

export interface Brand {
  id: number;
  name: string;
  logo_url?: string | null;
  description?: string | null;
  /** 产品层级：2 = 品牌-类别；3 = 品牌-类别-型号 */
  product_level?: number;
  created_at?: string;
}

/** 产品（品牌 → 类别 → 型号）；可修改命名 */
export interface Category {
  id: number;
  brand_id: number;
  name: string;
  brand_name?: string;
  created_at?: string;
}

/** 型号（产品第三级） */
export interface Model {
  id: number;
  category_id: number;
  name: string;
  description?: string | null;
  category_name?: string;
  brand_id?: number;
  brand_name?: string;
  created_at?: string;
}

/** 模板标签类型（用户可增删改）；path_kind 决定画布界面 A/B，并可配置默认提示词与拼图 */
export interface TemplateType {
  id: number;
  name: string;
  /** 画布界面：A=底图界面，B=产品+AI背景界面 */
  path_kind: 'A' | 'B';
  /** 默认 AI 文字样式提示词（会追加到模板提示词下方，可编辑） */
  prompt_text?: string | null;
  /** 默认 AI 背景提示词（产品+AI背景 / AI背景 用） */
  prompt_scene?: string | null;
  /** 是否显示 2/3/4 拼图单选（1=是） */
  puzzle?: number;
  sort?: number;
  template_count?: number;
}

export interface Project {
  id: number;
  brand_id: number;
  category_id?: number | null;
  name: string;
  brand_name?: string;
  category_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  pm_id?: number | null;
  /** 负责的项目经理昵称（手填） */
  pm_name?: string | null;
  member_count?: number;
  /** 项目内有哪些产品（二级品牌为类别名，三级品牌为型号名） */
  model_names?: string | null;
  model_count?: number;
  product_level?: number;
  asset_count?: number;
  template_count?: number;
  created_at?: string;
}

/** 素材类型 code（内置三种；后台可增删改类型，因此也允许自定义字符串） */
export type AssetType = 'scene' | 'product' | 'sticker' | (string & {});

/** 素材标签（可增删改，多选勾选） */
export interface AssetTag {
  id: number;
  name: string;
  sort?: number;
  asset_count?: number;
  /** 所属大类：product=产品类 / sticker=贴图类 / 空=通用 */
  kind?: 'product' | 'sticker' | null;
}

/** 素材类型（可增删改；code 与素材记录的 type 对应） */
export interface AssetTypeDef {
  code: string;
  name: string;
  sort?: number;
  asset_count?: number;
}

export interface Asset {
  id: number;
  brand_id: number;
  project_id: number | null;
  /** 归属型号（null = 不限型号；二级品牌没有型号） */
  model_id?: number | null;
  type: AssetType;
  name: string | null;
  url: string;
  tag: string | null;
  /** 多标签 */
  tags?: { id: number; name: string }[];
  path_type?: 'A' | 'B' | null;
  brand_name?: string;
  product_level?: number;
  project_name?: string | null;
  /** 归属产品名：3 级品牌=型号名，2 级品牌=类别名 */
  product_name?: string | null;
  model_name?: string | null;
  category_id?: number | null;
  category_name?: string | null;
}

/** 项目内产品：二级品牌 category_id + model_id=null；三级品牌两者都有 */
export interface ProjectProduct {
  link_id?: number;
  project_id: number;
  category_id: number;
  model_id: number | null;
  category_name?: string;
  model_name?: string | null;
  brand_id?: number;
  brand_name?: string;
  product_level?: number;
}

/** 模板：首页瀑布流。kind A=底图压字；B=产品-背景-压字（由模板标签类型决定） */
export interface Template {
  id: number;
  brand_id: number;
  project_id: number | null;
  name: string | null;
  url: string;
  text_style_prompt: string;
  scene_prompt: string | null;
  kind: 'A' | 'B';
  template_type_id?: number | null;
  template_type_name?: string | null;
  brand_name?: string;
  project_name?: string | null;
}

export interface Generation {
  id: number;
  brand_id: number | null;
  project_id: number | null;
  kind: 'scene' | 'text';
  prompt: string;
  url: string;
  size: string | null;
  created_by: number | null;
  created_at: string;
}

export interface DesignMeta {
  id: number;
  name: string;
  project_id: number;
  canvas_width: number;
  canvas_height: number;
  updated_at: string;
  project_name?: string;
  brand_name?: string;
}

export interface AiConfigView {
  endpoint: string;
  model: string;
  timeout_ms: number;
  has_key: boolean;
}

export interface SiteSettings {
  site_title: string;
  /** 网页名称（浏览器标签上的名字），默认「封面三层设计工具」 */
  page_title: string;
  logo_url: string | null;
  footer_text: string | null;
}

/** 回收站条目（素材 / 模板删除后进回收站，仅超管可见/可恢复） */
export interface TrashItem {
  id: number;
  kind: 'asset' | 'template';
  url: string;
  name: string | null;
  type: string | null;
  brand_name: string | null;
  project_name: string | null;
  deleted_at: string;
}

export interface OverlayItem {
  id: string;
  kind: 'text' | 'sticker';
  /** 图层名称（图层面板双击可改） */
  name?: string;
  /** 图层可见性（眼睛：睁眼显示 / 闭眼隐藏） */
  visible?: boolean;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  removeWhite: boolean;
  locked: boolean;
  z: number;
}

export interface PlacedImage {
  url: string;
  name?: string;
  /** 图层可见性（眼睛：睁眼显示 / 闭眼隐藏） */
  visible?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  locked: boolean;
  naturalWidth?: number;
  naturalHeight?: number;
}

/** 拼图容器内的一格（图片始终被裁剪在格内，可移动/缩放） */
export interface PuzzleCell {
  url: string;
  name?: string;
  /** 相对「铺满格子的最小尺寸」的缩放倍数（>=1） */
  zoom: number;
  /** 图片左上角相对格子的偏移（<=0，保证铺满） */
  offsetX: number;
  offsetY: number;
}

/** 拼图容器（2 = 上下均分，3 = 上中下均分，4 = 2×2） */
export interface PuzzleState {
  count: 2 | 3 | 4;
  /** 容器名称（图层面板双击可改） */
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 格子间距 */
  gap: number;
  cells: (PuzzleCell | null)[];
  visible?: boolean;
}

export type DesignPath = 'A' | 'B';
export type ToolMode = 'select' | 'erase';

/** 撤销记录（最多 20 步，可在画布撤销面板中选择回到某一步） */
export interface UndoStep {
  label: string;
  at: number;
  path: DesignPath;
  canvasWidth: number;
  canvasHeight: number;
  layer1: PlacedImage | null;
  layer2: PlacedImage | null;
  layer3: OverlayItem[];
  puzzle: PuzzleState | null;
  selectedId: string | null;
}

export interface DesignState {
  path: DesignPath;
  canvasWidth: number;
  canvasHeight: number;
  layer1: PlacedImage | null;
  layer2: PlacedImage | null;
  layer3: OverlayItem[];
  /** 拼图容器（拼图+压字标签：2/3/4 宫格） */
  puzzle: PuzzleState | null;
  /** 当前模板标签（决定画布界面与默认提示词） */
  tagTypeId: number | null;
  /** 模板自身配置的提示词（标签默认提示词会追加在其下方） */
  baseTextPrompt: string;
  baseScenePrompt: string;
  /** 历史记录（最新在最后，最多 20 步） */
  undoSteps: UndoStep[];
  /** 当前状态在历史中的位置（指针） */
  undoPos: number;
  /** 最新一步「操作完成后」的状态（用于从历史面板跳回最后一步） */
  undoTip: UndoStep | null;
  selectedId: string | null;
  textPrompt: string;
  scenePrompt: string;
  /** 模板标签配置的默认提示词（灰色展示、可编辑，生成时拼在模板提示词下方） */
  tagTextPrompt: string;
  tagScenePrompt: string;
  aiSize: string;
  designName: string;
  designId: number | null;
  projectId: number | null;
  templatePreview: string | null;
  brushMode: ToolMode;
  brushSize: number;
  freeTransform: boolean;
  aiBusy: boolean;
  /** 画布缩放百分比（20 ~ 200，在自适应基础上叠加） */
  zoom: number;
  /** 「+」号按钮是否禁用（大字报等无需底图的标签） */
  plusDisabled: boolean;
  /** 画布上「+」号按钮的处理器：由画布页面注册（打开上传 / 素材库选择） */
  onPlus: ((target: string) => void) | null;
  /** 切换模板标签时待保存的目标（保存成功后应用） */
  pendingSwitch: { path: DesignPath; tagId: number } | null;
  /** 「填写设计名称」弹框（保存 / 保存并切换标签） */
  saveNameOpen: boolean;
  saveNameFlow: 'save' | 'switch' | null;
}
