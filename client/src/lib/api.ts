import type {
  AiConfigView,
  Asset,
  AssetTag,
  AssetTypeDef,
  Brand,
  BrandGrant,
  Category,
  DesignMeta,
  Generation,
  Model,
  Project,
  ProjectGrant,
  ProjectProduct,
  RoleDef,
  SiteSettings,
  Template,
  TemplateType,
  TrashItem,
  User,
} from './types';

const TOKEN_KEY = 'xhsc_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function request<T>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, { method: opts.method || 'GET', headers, body });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    if (res.status === 401) {
      clearToken();
      if (!location.pathname.startsWith('/login')) location.href = '/login';
    }
    const msg = (data as { error?: string } | null)?.error || `请求失败 ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export const api = {
  // auth
  login: (username: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/login', { method: 'POST', body: { username, password } }),
  me: () => request<{ user: User }>('/api/auth/me'),
  updateProfile: (body: { username?: string; password?: string; display_name?: string }) =>
    request<{ ok: boolean; user: User }>('/api/auth/profile', { method: 'PATCH', body }),

  // brands
  listBrands: (all = false) => request<{ brands: Brand[] }>(`/api/brands${all ? '?all=1' : ''}`),
  createBrand: (name: string, logo_url?: string, description?: string, product_level?: number) =>
    request<{ brand: Brand }>('/api/brands', { method: 'POST', body: { name, logo_url, description, product_level } }),
  updateBrand: (id: number, body: { name?: string; logo_url?: string | null; description?: string | null; product_level?: number }) =>
    request<{ ok: boolean }>(`/api/brands/${id}`, { method: 'PATCH', body }),
  deleteBrand: (id: number) => request<{ ok: boolean }>(`/api/brands/${id}`, { method: 'DELETE' }),

  // asset tags（素材标签，可增删改，多选勾选）
  listAssetTags: (kind?: 'product' | 'sticker') => request<{ tags: AssetTag[] }>(`/api/asset-tags${kind ? `?kind=${kind}` : ''}`),
  createAssetTag: (name: string, kind?: 'product' | 'sticker') => request<{ tag: AssetTag }>('/api/asset-tags', { method: 'POST', body: { name, kind } }),
  updateAssetTag: (id: number, name: string, kind?: 'product' | 'sticker') => request<{ ok: boolean }>(`/api/asset-tags/${id}`, { method: 'PATCH', body: { name, ...(kind ? { kind } : {}) } }),
  deleteAssetTag: (id: number) => request<{ ok: boolean }>(`/api/asset-tags/${id}`, { method: 'DELETE' }),

  // 回收站（仅超管）：素材 / 模板删除后进回收站，36 小时后连文件一起清理
  listTrash: () => request<{ keep_hours: number; assets: TrashItem[]; templates: TrashItem[] }>('/api/trash'),
  restoreTrash: (kind: 'asset' | 'template', id: number) =>
    request<{ ok: boolean }>('/api/trash/restore', { method: 'POST', body: { kind, id } }),
  purgeTrash: (kind: 'asset' | 'template', id: number) =>
    request<{ ok: boolean }>('/api/trash/purge', { method: 'POST', body: { kind, id } }),
  sweepTrash: () => request<{ ok: boolean; assets: number; templates: number }>('/api/trash/sweep', { method: 'POST' }),

  // asset types（素材类型，可增删改）
  listAssetTypes: () => request<{ types: AssetTypeDef[] }>('/api/asset-tags/types'),
  createAssetType: (name: string) => request<{ type: AssetTypeDef }>('/api/asset-tags/types', { method: 'POST', body: { name } }),
  updateAssetType: (code: string, name: string) => request<{ ok: boolean }>(`/api/asset-tags/types/${code}`, { method: 'PATCH', body: { name } }),
  deleteAssetType: (code: string) => request<{ ok: boolean }>(`/api/asset-tags/types/${code}`, { method: 'DELETE' }),

  // categories（产品类别）
  listCategories: (brandId?: number, all = false) =>
    request<{ categories: Category[] }>(`/api/categories${brandId ? `?brand_id=${brandId}${all ? '&all=1' : ''}` : all ? '?all=1' : ''}`),
  createCategory: (name: string, brandId?: number) =>
    request<{ category: Category }>('/api/categories', { method: 'POST', body: { name, brand_id: brandId } }),
  updateCategory: (id: number, body: { name?: string; brand_id?: number }) =>
    request<{ ok: boolean }>(`/api/categories/${id}`, { method: 'PATCH', body }),
  deleteCategory: (id: number) => request<{ ok: boolean }>(`/api/categories/${id}`, { method: 'DELETE' }),

  // models（型号：品牌 → 类别 → 型号）
  listModels: (params?: { brand_id?: number; category_id?: number; all?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.brand_id) q.set('brand_id', String(params.brand_id));
    if (params?.category_id) q.set('category_id', String(params.category_id));
    if (params?.all) q.set('all', '1');
    return request<{ models: Model[] }>(`/api/models${q.toString() ? `?${q}` : ''}`);
  },
  createModel: (name: string, category_id: number, description?: string) =>
    request<{ model: Model }>('/api/models', { method: 'POST', body: { name, category_id, description } }),
  updateModel: (id: number, body: { name?: string; category_id?: number; description?: string | null }) =>
    request<{ ok: boolean }>(`/api/models/${id}`, { method: 'PATCH', body }),
  deleteModel: (id: number) => request<{ ok: boolean }>(`/api/models/${id}`, { method: 'DELETE' }),

  // template types（模板标签类型）
  listTemplateTypes: () => request<{ types: TemplateType[] }>('/api/template-types'),
  createTemplateType: (
    name: string,
    path_kind: 'A' | 'B',
    extra?: { prompt_text?: string; prompt_scene?: string; puzzle?: number | boolean }
  ) => request<{ type: TemplateType }>('/api/template-types', { method: 'POST', body: { name, path_kind, ...(extra || {}) } }),
  updateTemplateType: (
    id: number,
    body: { name?: string; path_kind?: 'A' | 'B'; prompt_text?: string; prompt_scene?: string; puzzle?: number | boolean; sort?: number }
  ) => request<{ ok: boolean }>(`/api/template-types/${id}`, { method: 'PATCH', body }),
  deleteTemplateType: (id: number) => request<{ ok: boolean }>(`/api/template-types/${id}`, { method: 'DELETE' }),

  // projects
  listProjects: (brandId?: number, categoryId?: number, modelId?: number, all = false) => {
    const q = new URLSearchParams();
    if (brandId) q.set('brand_id', String(brandId));
    if (categoryId) q.set('category_id', String(categoryId));
    if (modelId) q.set('model_id', String(modelId));
    if (all) q.set('all', '1');
    return request<{ projects: Project[] }>(`/api/projects${q.toString() ? `?${q}` : ''}`);
  },
  createProject: (body: { name: string; brand_id?: number; category_id?: number; parent_id?: number; start_date?: string | null; end_date?: string | null; pm_id?: number | null; pm_name?: string | null; products?: { category_id: number; model_id?: number | null }[] }) =>
    request<{ project: Project; products: ProjectProduct[] }>('/api/projects', { method: 'POST', body }),
  updateProject: (id: number, body: { name?: string; category_id?: number; parent_id?: number | null; brand_id?: number; start_date?: string | null; end_date?: string | null; pm_id?: number | null; pm_name?: string | null; products?: { category_id: number; model_id?: number | null }[] }) =>
    request<{ ok: boolean }>(`/api/projects/${id}`, { method: 'PATCH', body }),
  deleteProject: (id: number) => request<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),
  /** 项目 ↔ 产品 关联（当前权限范围内全部） */
  listProjectModels: () => request<{ links: ProjectProduct[]; products: ProjectProduct[] }>('/api/projects/models'),
  getProjectModels: (projectId: number) => request<{ products: ProjectProduct[]; models: ProjectProduct[] }>(`/api/projects/${projectId}/products`),
  putProjectModels: (projectId: number, products: { category_id: number; model_id?: number | null }[]) =>
    request<{ ok: boolean; products: ProjectProduct[] }>(`/api/projects/${projectId}/products`, { method: 'PUT', body: { products } }),

  // user grants（权限绑定）
  getGrants: (userId: number) => request<{ grants: { brands: number[]; categories: number[] } }>(`/api/users/${userId}/grants`),
  putUserBrands: (userId: number, brandIds: number[]) => request<{ ok: boolean }>(`/api/users/${userId}/brands`, { method: 'PUT', body: { brand_ids: brandIds } }),
  putUserCategories: (userId: number, categoryIds: number[]) => request<{ ok: boolean }>(`/api/users/${userId}/categories`, { method: 'PUT', body: { category_ids: categoryIds } }),
  getUserProjects: (userId: number) => request<{ project_ids: number[]; grants: ProjectGrant[]; brand_grants: BrandGrant[] }>(`/api/users/${userId}/projects`),
  putUserProjects: (userId: number, grants: number[] | { project_id: number; can_edit: boolean }[]) =>
    request<{ ok: boolean }>(`/api/users/${userId}/projects`, {
      method: 'PUT',
      body: Array.isArray(grants) && typeof grants[0] === 'number'
        ? { project_ids: grants as number[] }
        : { grants: grants as { project_id: number; can_edit: boolean }[] },
    }),
  /** 权限总入口：项目级 + 品牌级（整品牌，含以后新增项目） */
  getPermissions: (userId: number) =>
    request<{ project_ids: number[]; grants: ProjectGrant[]; brand_grants: BrandGrant[] }>(`/api/users/${userId}/permissions`),
  putPermissions: (userId: number, body: { project_grants: { project_id: number; can_edit: boolean }[]; brand_grants: { brand_id: number; can_edit: boolean }[] }) =>
    request<{ ok: boolean; grants: ProjectGrant[]; brand_grants: BrandGrant[] }>(`/api/users/${userId}/permissions`, { method: 'PUT', body }),

  // users
  listUsers: () => request<{ users: User[] }>('/api/users'),
  createUser: (body: {
    username: string;
    password?: string;
    display_name?: string;
    role?: string;
    brand_id?: number;
    project_id?: number;
    leader_id?: number | null;
    project_perms?: { project_id: number; can_edit?: boolean }[];
    brand_perms?: { brand_id: number; can_edit?: boolean }[];
  }) => request<{ user: User }>('/api/users', { method: 'POST', body }),
  updateUser: (id: number, body: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/api/users/${id}`, { method: 'PATCH', body }),
  deleteUser: (id: number) => request<{ ok: boolean }>(`/api/users/${id}`, { method: 'DELETE' }),
  /** 模块权限：读取（自己 / 可授权的下属） */
  getUserPerms: (id: number) =>
    request<{ perms: Record<string, string>; caps: Record<string, string>; overrides: Record<string, string> }>(`/api/users/${id}/perms`),
  /** 模块权限：勾选分配（不超过目标角色上限） */
  putUserPerms: (id: number, perms: Record<string, string>) =>
    request<{ ok: boolean; perms: Record<string, string> }>(`/api/users/${id}/perms`, { method: 'PUT', body: { perms } }),

  // ui texts（提示语 / 引导语：超管可改，其他角色只读）
  listUiTexts: () => request<{ texts: Record<string, string> }>('/api/ui-texts'),
  saveUiTexts: (texts: Record<string, string>) =>
    request<{ ok: boolean; texts: Record<string, string> }>('/api/ui-texts', { method: 'PUT', body: { texts } }),

  // roles（角色权限：超管可管理；其他角色只读）
  listRoles: () => request<{ roles: RoleDef[]; modules: string[] }>('/api/roles'),
  createRole: (body: { name: string; level?: number; perms: Record<string, string> }) =>
    request<{ role: RoleDef }>('/api/roles', { method: 'POST', body }),
  updateRole: (id: number, body: { name?: string; level?: number; perms?: Record<string, string> }) =>
    request<{ ok: boolean; role: RoleDef }>(`/api/roles/${id}`, { method: 'PATCH', body }),
  deleteRole: (id: number) => request<{ ok: boolean }>(`/api/roles/${id}`, { method: 'DELETE' }),

  // assets
  listAssets: (params?: { type?: string; project_id?: number; scope?: 'all' | 'generic' | 'project'; tag_id?: number; mine?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.type) q.set('type', params.type);
    if (params?.project_id) q.set('project_id', String(params.project_id));
    if (params?.scope && params.scope !== 'all') q.set('scope', params.scope);
    if (params?.tag_id) q.set('tag_id', String(params.tag_id));
    if (params?.mine) q.set('mine', '1');
    return request<{ assets: Asset[] }>(`/api/assets${q.toString() ? `?${q}` : ''}`);
  },
  uploadAsset: (form: FormData) => request<{ asset: Asset }>('/api/assets', { method: 'POST', form }),
  updateAsset: (id: number, body: { name?: string; project_id?: number | null; path_type?: string; model_id?: number | null; category_id?: number | null; type?: string; tag_ids?: number[] }) =>
    request<{ ok: boolean }>(`/api/assets/${id}`, { method: 'PATCH', body }),
  deleteAsset: (id: number) => request<{ ok: boolean }>(`/api/assets/${id}`, { method: 'DELETE' }),

  // templates（模板库）
  listTemplates: (params?: { project_id?: number; template_type_id?: number; scope?: 'all' | 'generic' | 'project'; mine?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.project_id) q.set('project_id', String(params.project_id));
    if (params?.template_type_id) q.set('template_type_id', String(params.template_type_id));
    if (params?.scope && params.scope !== 'all') q.set('scope', params.scope);
    if (params?.mine) q.set('mine', '1');
    return request<{ references: Template[] }>(`/api/references${q.toString() ? `?${q}` : ''}`);
  },
  createTemplate: (form: FormData) => request<{ reference: Template }>('/api/references', { method: 'POST', form }),
  /** 记录一次模板使用（画布打开模板时调用） */
  useTemplate: (id: number) => request<{ ok: boolean; usage_count: number }>(`/api/references/${id}/use`, { method: 'POST' }),
  updateTemplate: (id: number, body: { name?: string; text_style_prompt?: string; scene_prompt?: string | null; kind?: 'A' | 'B'; project_id?: number | null; template_type_id?: number | null }, file?: File | null) => {
    if (file) {
      const fd = new FormData();
      Object.entries(body).forEach(([k, v]) => {
        if (v !== undefined && v !== null) fd.append(k, String(v));
      });
      fd.append('file', file);
      return request<{ ok: boolean }>(`/api/references/${id}`, { method: 'PATCH', form: fd });
    }
    return request<{ ok: boolean }>(`/api/references/${id}`, { method: 'PATCH', body: body as Record<string, unknown> });
  },
  deleteTemplate: (id: number) => request<{ ok: boolean }>(`/api/references/${id}`, { method: 'DELETE' }),

  // generations（AI 历史）
  listGenerations: (kind?: string, opts?: { mine?: boolean }) => {
    const q = new URLSearchParams();
    if (kind) q.set('kind', kind);
    if (opts?.mine) q.set('mine', '1');
    return request<{ generations: Generation[] }>(`/api/generations${q.toString() ? `?${q}` : ''}`);
  },
  deleteGeneration: (id: number) => request<{ ok: boolean }>(`/api/generations/${id}`, { method: 'DELETE' }),

  // designs
  listDesigns: (projectId?: number) =>
    request<{ designs: DesignMeta[] }>(`/api/designs${projectId ? `?project_id=${projectId}` : ''}`),

  // 仪表盘统计（按当前用户权限范围）
  getDashboard: () =>
    request<{
      scope: 'all' | 'own';
      projects: { total: number; new7: number };
      templates: { total: number; new7: number; uses: number; generic: number; exclusive: number };
      assets: { total: number; new7: number; scene: number; product: number; sticker: number };
      users: { total: number };
      designs: { total: number };
      topTemplates: { id: number; name: string | null; url: string; usage_count: number; brand_name?: string; project_name?: string | null }[];
      recentAssets: { id: number; name: string | null; url: string; type: string; created_at: string }[];
    }>('/api/stats/dashboard'),
  getDesign: (id: number) => request<{ design: { id: number; name: string; project_id: number; canvas_width: number; canvas_height: number; layers_json: string } }>(`/api/designs/${id}`),
  createDesign: (body: { name?: string; project_id: number; canvas_width: number; canvas_height: number; layers_json: unknown }) =>
    request<{ design: { id: number } }>('/api/designs', { method: 'POST', body }),
  updateDesign: (id: number, body: { name?: string; canvas_width?: number; canvas_height?: number; layers_json?: unknown }) =>
    request<{ ok: boolean }>(`/api/designs/${id}`, { method: 'PATCH', body }),
  deleteDesign: (id: number) => request<{ ok: boolean }>(`/api/designs/${id}`, { method: 'DELETE' }),

  // site settings
  getSettings: () => request<{ settings: SiteSettings }>('/api/settings'),
  updateSettings: (body: { site_title?: string; page_title?: string; logo_url?: string; footer_text?: string }) =>
    request<{ ok: boolean }>('/api/settings', { method: 'PUT', body }),

  // ai config
  getAiConfig: () => request<{ config: AiConfigView }>('/api/ai-config'),
  updateAiConfig: (body: { endpoint: string; api_key?: string; model: string; timeout_ms: number }) =>
    request<{ ok: boolean }>('/api/ai-config', { method: 'PUT', body }),

  // ai generate
  generate: (body: { kind: 'scene' | 'text'; prompt: string; size?: string; project_id?: number; referenceImages?: string[]; canvas_width?: number; canvas_height?: number }) =>
    request<{ url: string; cost: number; usedPrompt?: string }>('/api/ai/generate', { method: 'POST', body }),

  // 通用上传（返回同源 url）
  upload: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<{ url: string }>('/api/upload', { method: 'POST', form: fd });
  },
};
