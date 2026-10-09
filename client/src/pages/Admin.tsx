import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiUrl } from '../lib/api';
import { useAuth } from '../store/auth';
import { useIsMobileLayout } from '../store/viewMode';
import Modal from '../components/Modal';
import DatePicker from '../components/DatePicker';
import AssetKindBar, { ASSET_KIND_LABEL, type AssetKind } from '../components/AssetKindBar';
import EditableHint from '../components/EditableHint';
import { loadUiTexts } from '../lib/uiTexts';
import { isSmartRefType } from '../lib/smartRef';
import { ALL_ROLES, ROLE_LABEL, canBrowseAllProjects, isGlobalRole, roleLevel } from '../lib/types';
import { UI_TEXT_DEFAULTS, useUiTexts } from '../lib/uiTexts';
import type { AiConfigView, Asset, AssetTag, AssetType, AssetTypeDef, Brand, BrandGrant, Category, Model, Project, ProjectGrant, ProjectProduct, Role, RoleDef, Template, TemplateType, TrashItem, User } from '../lib/types';

type Tab = 'dashboard' | 'products' | 'projects' | 'users' | 'assets' | 'templates' | 'profile' | 'ai' | 'settings';

const DEFAULT_PASSWORD = '@123456';

/* ==================== 后台外壳 ==================== */
export default function Admin() {
  const user = useAuth((s) => s.user)!;
  const isMobileLayout = useIsMobileLayout();
  const isSuper = user.role === 'super_admin';
  const isGlobalAdmin = isGlobalRole(user.role);
  const isManager = roleLevel(user.role) <= 2;
  /** 角色默认模块权限（与后端一致，取到真实权限前先用它渲染） */
  const roleDefaultPerms = (role: Role): Record<string, string> => {
    if (role === 'super_admin' || role === 'senior_manager' || role === 'pm' || role === 'dept_head') {
      const top = role === 'super_admin' || role === 'senior_manager';
      return {
        products: top ? 'edit' : 'view',
        projects: role === 'dept_head' ? 'view' : 'edit',
        users: 'edit', assets: 'edit', templates: 'edit',
      };
    }
    if (role === 'dept_member') return { products: 'view', projects: 'view', users: 'view', assets: 'view', templates: 'view' };
    return { products: 'none', projects: 'none', users: 'none', assets: 'none', templates: 'none' };
  };
  // 模块权限：以后台勾选的分配为准（项目经理 / 部门主管可给名下成员勾选）
  const [myPerms, setMyPerms] = useState<Record<string, string>>(() => roleDefaultPerms(user.role));
  useEffect(() => {
    api.getUserPerms(user.id)
      .then((r) => setMyPerms((p) => ({ ...p, ...r.perms })))
      .catch(() => { /* 忽略：保持角色默认 */ });
  }, [user.id]);
  const canView = (m: string) => (myPerms[m] ?? 'none') !== 'none';
  const canEditMod = (m: string) => myPerms[m] === 'edit';
  const canEditAssets = canEditMod('assets');
  const canEditProjects = canEditMod('projects') && (user.role === 'super_admin' || user.role === 'senior_manager' || user.role === 'pm');
  /** 项目成员 / 普通用户：后台只有「个人信息」 */
  const isPlainMember = user.role === 'kos' || user.role === 'user';
  const [tab, setTab] = useState<Tab>(isManager ? 'dashboard' : 'profile');

  const PRIMARY: { key: Tab; label: string; icon: string; desc: string; show: boolean }[] = [
    { key: 'profile', label: '个人信息', icon: '👤', desc: '昵称 · 用户名 · 密码', show: true },
    { key: 'products', label: '产品', icon: '🗂', desc: canEditMod('products') ? '品牌 → 类别 → 型号' : '品牌 → 类别 → 型号（只读）', show: canView('products') },
    { key: 'projects', label: '项目', icon: '📁', desc: canEditProjects ? '项目内产品 · 专属素材 · 专属模板' : '项目信息（只读）', show: canView('projects') },
    { key: 'users', label: '用户', icon: '👥', desc: isManager ? '超管 / 高级管理者 / 项目经理 / 部门主管 / 部门成员 / 项目成员 / 普通用户' : '我所在部门的主管与成员', show: canView('users') },
    { key: 'assets', label: '素材', icon: '🖼', desc: canEditAssets ? '产品类 · 贴图类' : '产品类 · 贴图类（只读）', show: canView('assets') },
    { key: 'templates', label: '模板', icon: '✨', desc: canEditAssets ? '模板标签 · 通用 / 专属' : '模板标签 · 通用 / 专属（只读）', show: canView('templates') },
  ];
  const SYSTEM: { key: Tab; label: string; show: boolean }[] = [
    { key: 'dashboard', label: '仪表盘', show: true },
    { key: 'ai', label: 'AI 配置', show: isSuper },
    { key: 'settings', label: '站点设置', show: isSuper },
  ];

  return (
    <div className={`h-full overflow-y-auto overflow-x-hidden bg-zinc-950 ${isMobileLayout ? 'admin-mobile' : ''}`}>
      <div className={`mx-auto max-w-[1400px] ${isMobileLayout ? 'px-2.5 py-3' : 'px-4 py-6 md:px-8'}`}>
        <div className={`flex flex-wrap items-center justify-between ${isMobileLayout ? 'mb-3 gap-2' : 'mb-6 gap-3'}`}>
          <div>
            <h1 className={`font-extrabold tracking-tight text-white ${isMobileLayout ? 'text-lg' : 'text-2xl'}`}>管理后台</h1>
            <p className={`mt-0.5 text-zinc-500 ${isMobileLayout ? 'text-[11px]' : 'text-xs'}`}>
              当前身份：<span className="text-zinc-300">{ROLE_LABEL[user.role]}</span>
              {user.display_name ? ` · ${user.display_name}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {SYSTEM.filter((s) => s.show).map((s) => (
              <button
                key={s.key}
                onClick={() => setTab(s.key)}
                className={`rounded-lg border transition ${
                  isMobileLayout ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
                } ${
                  tab === s.key ? 'border-indigo-500 bg-indigo-600/20 text-white' : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                }`}
              >
                {s.label}
              </button>
            ))}
            <Link
              to="/"
              className={`inline-flex items-center gap-1.5 rounded-xl bg-[#ff2442] font-semibold text-white shadow-lg shadow-[#ff2442]/30 transition hover:bg-[#ff3d58] ${
                isMobileLayout ? 'px-2.5 py-1 text-[11px]' : 'px-4 py-2 text-sm'
              }`}
            >
          ← 返回首页
            </Link>
          </div>
        </div>

        {/* 6 大类导航 */}
        <div className={`grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6 ${isMobileLayout ? 'mb-4' : 'mb-7'}`}>
          {PRIMARY.filter((t) => t.show).map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`group flex items-start gap-3 rounded-2xl border text-left transition ${
                  isMobileLayout ? 'gap-2 rounded-xl p-2' : 'p-3.5'
                } ${
                  active
                    ? 'border-indigo-500 bg-gradient-to-br from-indigo-600/25 to-violet-600/10 shadow-lg shadow-indigo-950/40'
                    : 'border-zinc-800 bg-zinc-900/70 hover:border-zinc-600 hover:bg-zinc-900'
                }`}
              >
                <span className={`grid shrink-0 place-items-center rounded-xl ${isMobileLayout ? 'h-7 w-7 text-sm' : 'h-9 w-9 text-base'} ${active ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 group-hover:text-zinc-200'}`}>
                  {t.icon}
                </span>
                <span className="min-w-0">
                  <span className={`block font-bold ${isMobileLayout ? 'truncate text-xs' : 'text-sm'} ${active ? 'text-white' : 'text-zinc-200'}`}>{t.label}</span>
                  <span className={`mt-0.5 block truncate text-zinc-500 ${isMobileLayout ? 'hidden text-[10px]' : 'text-[11px]'}`}>{t.desc}</span>
                </span>
              </button>
            );
          })}
        </div>

        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'products' && <ProductsTab readOnly={!canEditMod('products')} />}
        {tab === 'projects' && <ProjectsTab readOnly={!canEditProjects} />}
        {tab === 'users' && <UsersTab />}
        {tab === 'assets' && <AssetsTab canEdit={canEditAssets} />}
        {tab === 'templates' && <TemplatesTab canEdit={canEditAssets} canBrowse={canView('templates')} />}
        {tab === 'profile' && <ProfileTab />}
        {tab === 'ai' && <AiTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}

/* ==================== 后台外壳 ==================== */
type DashboardData = Awaited<ReturnType<typeof api.getDashboard>>;

function StatCard({ label, value, sub, tone = 'indigo', icon }: { label: string; value: number | string; sub?: string; tone?: 'indigo' | 'emerald' | 'amber' | 'sky'; icon: string }) {
  const tones = {
    indigo: 'from-indigo-600/25 to-violet-600/5 border-indigo-500/40',
    emerald: 'from-emerald-600/25 to-teal-600/5 border-emerald-500/40',
    amber: 'from-amber-500/25 to-orange-600/5 border-amber-500/40',
    sky: 'from-sky-600/25 to-cyan-600/5 border-sky-500/40',
  } as const;
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 ${tones[tone]}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-300">{label}</span>
        <span className="text-base">{icon}</span>
      </div>
      <div className="mt-2 text-3xl font-extrabold tracking-tight text-white">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-zinc-400">{sub}</div>}
    </div>
  );
}

function DashboardTab() {
  const user = useAuth((s) => s.user)!;
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(true);

  const load = useCallback(() => {
    setBusy(true);
    api
      .getDashboard()
      .then((d) => { setData(d); setErr(''); })
      .catch((e) => setErr(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setBusy(false));
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (busy && !data) return <div className="py-16 text-center text-sm text-zinc-500">统计加载中…</div>;
  if (err) return <Empty text={`统计加载失败：${err}`} />;
  if (!data) return <Empty text="暂无统计数据" />;

  const t = data.templates;
  const a = data.assets;

  return (
    <Section
        title="仪表盘"
      desc={`${isGlobalRole(user.role) ? '全部数据' : '你权限范围内的数据'}（近 7 天为新增统计）`}
      actions={<button className="btn-soft !px-3 !py-1.5 text-xs" onClick={load} disabled={busy}>{busy ? '刷新中…' : '刷新'}</button>}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
<StatCard label="项目总数" value={data.projects.total} sub={`近 7 天新增 ${data.projects.new7}`} tone="indigo" icon="📁" />
        <StatCard label="模板使用次数" value={t.uses} sub={`模板共 ${t.total} 个（通用 ${t.generic} · 专属 ${t.exclusive}）`} tone="amber" icon="🔥" />
<StatCard label="模板新增" value={t.new7} sub={`近 7 天新增，累计 ${t.total} 个`} tone="emerald" icon="✨" />
<StatCard label="素材新增" value={a.new7} sub={`近 7 天新增，累计 ${a.total} 个`} tone="sky" icon="🖼" />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <div className="mb-3 text-sm font-semibold text-zinc-200">素材构成</div>
          <div className="space-y-2 text-xs">
            {([['底图', a.scene], ['产品图', a.product], ['贴纸', a.sticker]] as [string, number][]).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-zinc-400">{k}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
                  <span className="block h-full rounded-full bg-sky-500" style={{ width: `${a.total ? Math.round((v / a.total) * 100) : 0}%` }} />
                </span>
                <span className="w-10 shrink-0 text-right text-zinc-300">{v}</span>
              </div>
            ))}
            <div className="mt-2 border-t border-zinc-800 pt-2 text-zinc-500">素材总数 {a.total} · 设计稿 {data.designs.total}{data.users.total ? ` · 用户 ${data.users.total}` : ''}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <div className="mb-3 text-sm font-semibold text-zinc-200">模板使用排行（Top 5）</div>
          <div className="space-y-2">
            {data.topTemplates.length === 0 && <div className="text-xs text-zinc-600">暂无模板</div>}
            {data.topTemplates.map((tpl) => (
              <div key={tpl.id} className="flex items-center gap-2.5">
                <img src={apiUrl(tpl.url)} alt="" className="h-9 w-7 shrink-0 rounded bg-zinc-950 object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-zinc-200">{tpl.name || '未命名模板'}</div>
                  <div className="truncate text-[10px] text-zinc-500">
                    {tpl.project_name ? `「${tpl.project_name}」专属` : '通用'}{tpl.brand_name ? ` · ${tpl.brand_name}` : ''}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-200">{tpl.usage_count} 次</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
            <div className="mb-2 text-sm font-semibold text-zinc-200">最近上传素材</div>
          <div className="grid grid-cols-5 gap-2">
            {data.recentAssets.length === 0 && <div className="col-span-5 text-xs text-zinc-600">暂无素材</div>}
            {data.recentAssets.map((x) => (
              <div key={x.id} className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
                <img src={apiUrl(x.url)} alt="" className="aspect-square w-full object-cover" />
              </div>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-zinc-500">当前身份：{ROLE_LABEL[user.role]}（{data.scope === 'all' ? '可见全部数据' : '仅统计权限内数据'}）</div>
        </div>
      </div>
    </Section>
  );
}

/* ==================== 后台外壳 ==================== */
/** 区域标题 → 提示语 key（超管可在文案上悬停点「修改」就地编辑） */
const SECTION_TEXT_KEY: Record<string, string> = {
  '用户': 'users',
  '素材': 'assets',
  '模板': 'templates',
  '项目': 'projects',
  '个人信息': 'profile',
  '产品': 'products',
  '仪表盘': 'dashboard',
  '站点设置': 'settings',
  'AI 配置': 'ai',
};
/** 各区域用不同色调的背景 + 左侧色条区分（同一后台里一眼能分清区块） */
const SECTION_TONES: Record<string, string> = {
  '个人信息': 'from-sky-500/10 to-transparent border-sky-500/30',
  '产品': 'from-violet-500/10 to-transparent border-violet-500/30',
  '项目': 'from-emerald-500/10 to-transparent border-emerald-500/30',
  '用户': 'from-amber-500/10 to-transparent border-amber-500/30',
  '素材': 'from-rose-500/10 to-transparent border-rose-500/30',
  '模板': 'from-indigo-500/10 to-transparent border-indigo-500/30',
  '站点设置': 'from-cyan-500/10 to-transparent border-cyan-500/30',
  'AI 配置': 'from-fuchsia-500/10 to-transparent border-fuchsia-500/30',
};

function Section({ title, desc, actions, children }: { title: string; desc?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const tone = SECTION_TONES[title] || 'from-zinc-500/10 to-transparent border-zinc-600/40';
  return (
    <section className={`mb-8 rounded-2xl border border-zinc-800 bg-gradient-to-br ${tone} p-4 md:p-5`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-zinc-800/70 pb-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
          {desc && <p className="mt-0.5 text-xs text-zinc-400"><EditableHint k={`admin.${SECTION_TEXT_KEY[title] || 'misc'}.desc`} fallback={desc} inputClassName="input !py-0.5 !px-2 text-xs !w-96" /></p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-sm shadow-black/20 ${className}`}>{children}</div>;
}

function Badge({ children, tone = 'zinc' }: { children: React.ReactNode; tone?: 'zinc' | 'indigo' | 'amber' | 'emerald' }) {
  const tones = {
    zinc: 'bg-zinc-800 text-zinc-300',
    indigo: 'bg-indigo-600/20 text-indigo-200',
    amber: 'bg-amber-500/20 text-amber-200',
    emerald: 'bg-emerald-600/20 text-emerald-200',
  } as const;
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${tones[tone]}`}>{children}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-600">{text}</div>;
}

/** 项目专属素材 / 专属模板（在「修改项目」弹窗内管理；时间与项目内产品在弹窗表单里） */
function ConfirmModal({ open, title, desc, onCancel, onConfirm }: { open: boolean; title: string; desc?: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn-soft" onClick={onCancel}>取消</button>
          <button
            className="rounded-lg bg-red-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-red-950/40 ring-1 ring-red-400/60 transition hover:bg-red-500"
            onClick={onConfirm}
          >确认删除</button>
        </>
      }
    >
      <p className="text-sm text-zinc-300">是否确认操作？删除后不可恢复，确认要删除吗？</p>
      <p className="mt-2 text-xs text-zinc-500">{desc || '删除后不可恢复，请谨慎操作。'}</p>
    </Modal>
  );
}

function ModalFooter({ onCancel, onOk, okText = '确定' }: { onCancel: () => void; onOk: () => void; okText?: string }) {
  return (
    <>
      <button className="btn-soft" onClick={onCancel}>取消</button>
      <button className="btn-primary" onClick={onOk}>{okText}</button>
    </>
  );
}

/** 品牌 → 类别（→ 型号） 联动选择：2 级品牌只显示两个下拉；compact = 小字号 */
function ProductCascade({
  brands, cats, models, value, onChange, allowAll = true, compact = false,
}: {
  brands: Brand[];
  cats: Category[];
  models: Model[];
  value: { brand: number; cat: number; model: number };
  onChange: (v: { brand: number; cat: number; model: number }) => void;
  allowAll?: boolean;
  compact?: boolean;
}) {
  const brandObj = brands.find((b) => b.id === value.brand);
  const level = brandObj?.product_level === 2 ? 2 : 3;
  const catList = value.brand ? cats.filter((c) => c.brand_id === value.brand) : cats;
  const catIds = catList.map((c) => c.id);
  const modelList = models.filter((m) => catIds.includes(m.category_id) && (!value.cat || m.category_id === value.cat));
  const cls = compact ? 'input !w-32 !px-2 !py-1 text-xs' : 'input !w-36';
  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? 'text-xs' : ''}`}>
      <select className={cls} value={value.brand} onChange={(e) => onChange({ brand: Number(e.target.value), cat: 0, model: 0 })}>
        <option value={0}>{allowAll ? '选择品牌（全部）' : '选择品牌'}</option>
        {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <select className={cls} value={value.cat} onChange={(e) => onChange({ ...value, cat: Number(e.target.value), model: 0 })}>
        <option value={0}>{allowAll ? '选择产品（全部）' : '选择产品'}</option>
        {catList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {level === 3 && (
        <select className={cls} value={value.model} onChange={(e) => onChange({ ...value, model: Number(e.target.value) })}>
          <option value={0}>{allowAll ? '选择型号（全部）' : '选择型号'}</option>
          {modelList.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}
    </div>
  );
}

/* ==================== 0. 个人信息（所有角色可用，含普通用户） ==================== */
function ProfileTab() {
  const T = useUiTexts();
  const user = useAuth((s) => s.user)!;
  const [pf, setPf] = useState({ display_name: user.display_name || '', username: user.username || '', password: '' });
  const [msg, setMsg] = useState('');
  const [brandName, setBrandName] = useState('');
  const [myProjects, setMyProjects] = useState<string[]>([]);

  useEffect(() => {
    if (user.brand_id) {
      api.listBrands().then((r) => setBrandName(r.brands.find((b) => b.id === user.brand_id)?.name || '')).catch(() => {});
    } else {
      setBrandName('');
    }
    if (isGlobalRole(user.role)) {
      setMyProjects(['全部项目']);
    } else {
      api.listProjects().then((r) => setMyProjects(r.projects.map((p) => p.name))).catch(() => setMyProjects([]));
    }
  }, [user.id, user.role, user.brand_id]);

  function flash(t: string) { setMsg(t); window.setTimeout(() => setMsg(''), 2500); }

  return (
    <Section
      title="个人信息"
      desc={T('admin.profile.desc')}
      actions={msg ? <span className="text-xs text-amber-400">{msg}</span> : undefined}
    >
      <div className="grid max-w-3xl gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="mb-3 text-sm font-semibold text-zinc-200">可修改</div>
          <div className="grid gap-3">
            <label className="label">昵称<input className="input mt-1" value={pf.display_name} onChange={(e) => setPf({ ...pf, display_name: e.target.value })} placeholder="如：张三" /></label>
            <label className="label">用户名（登录账号）<input className="input mt-1" value={pf.username} onChange={(e) => setPf({ ...pf, username: e.target.value })} placeholder="登录账号，如：13800000000" /></label>
            <label className="label">修改密码（留空不改）<input className="input mt-1" type="password" value={pf.password} onChange={(e) => setPf({ ...pf, password: e.target.value })} placeholder="至少 6 位" /></label>
            {/* 保存按钮放在密码下方（左侧卡片内） */}
            <button className="btn-primary !w-32" onClick={async () => {
              try {
                await api.updateProfile({ display_name: pf.display_name, username: pf.username, password: pf.password || undefined });
                setPf((s) => ({ ...s, password: '' }));
                await useAuth.getState().init();
                flash('已保存 ✓');
              } catch (e) { flash(e instanceof Error ? e.message : '保存失败'); }
            }}>保存</button>
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="mb-3 text-sm font-semibold text-zinc-200">不可自行修改</div>
          <div className="grid gap-2 text-sm">
            <div className="flex items-start justify-between gap-3"><span className="shrink-0 text-zinc-500">角色</span><Badge tone={user.role === 'super_admin' ? 'amber' : isGlobalRole(user.role) ? 'indigo' : user.role === 'pm' ? 'emerald' : 'zinc'}>{ROLE_LABEL[user.role]}</Badge></div>
            <div className="flex items-start justify-between gap-3"><span className="shrink-0 text-zinc-500">所属品牌</span><span className="min-w-0 flex-1 break-words text-right text-zinc-200">{user.brand_id ? (brandName || `品牌 ${user.brand_id}`) : '—'}</span></div>
            <div className="flex items-start justify-between gap-3">
              <span className="shrink-0 text-zinc-500">所属项目</span>
              <span className="flex min-w-0 flex-1 flex-wrap justify-end gap-1 text-right text-zinc-200">
                {myProjects.length
                  ? myProjects.map((p) => <span key={p} className="break-all rounded bg-zinc-800/70 px-1.5 py-0.5 text-[11px]">{p}</span>)
                  : '—'}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3"><span className="shrink-0 text-zinc-500">权限范围</span><span className="min-w-0 flex-1 break-words text-right text-zinc-200">
              {isGlobalRole(user.role) ? '全部品牌 / 全部项目' : user.role === 'pm' ? '权限内项目（可修改素材与模板）' : '权限内素材与模板（仅查看）'}
            </span></div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ==================== 1. 产品（品牌-类别-型号） ==================== */
function ProductsTab({ readOnly = false }: { readOnly?: boolean }) {
  const user = useAuth((s) => s.user)!;
  const isSuper = user.role === 'super_admin';
  const [brands, setBrands] = useState<Brand[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [brandId, setBrandId] = useState(0);
  const [catId, setCatId] = useState(0);

  const [brandForm, setBrandForm] = useState<{ open: boolean; edit: Brand | null; name: string; logo: string; desc: string; level: number }>({ open: false, edit: null, name: '', logo: '', desc: '', level: 3 });
  const [catForm, setCatForm] = useState<{ open: boolean; edit: Category | null; name: string }>({ open: false, edit: null, name: '' });
  const [modelForm, setModelForm] = useState<{ open: boolean; edit: Model | null; name: string; desc: string }>({ open: false, edit: null, name: '', desc: '' });
  const [delBrand, setDelBrand] = useState<Brand | null>(null);
  const [delCat, setDelCat] = useState<Category | null>(null);
  const [delModel, setDelModel] = useState<Model | null>(null);
  const [msg, setMsg] = useState('');
  const logoRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    // 只读（项目经理）时请求全量产品目录：可以浏览「所有产品」，但不能修改
    const [b, c, m] = await Promise.all([
      api.listBrands(readOnly),
      api.listCategories(undefined, readOnly),
      api.listModels({ all: readOnly }),
    ]);
    setBrands(b.brands);
    setCats(c.categories);
    setModels(m.models);
    setBrandId((cur) => (cur && b.brands.some((x) => x.id === cur) ? cur : 0));
  }, [readOnly]);
  useEffect(() => { void load(); }, [load]);

  const catList = useMemo(() => cats.filter((c) => c.brand_id === brandId), [cats, brandId]);
  useEffect(() => {
    setCatId((cur) => (cur && catList.some((c) => c.id === cur) ? cur : 0));
  }, [catList]);
  const modelList = useMemo(() => models.filter((m) => m.category_id === catId), [models, catId]);
  const curBrand = brands.find((b) => b.id === brandId);
  const curCat = cats.find((c) => c.id === catId);
  const brandLevel = curBrand?.product_level === 2 ? 2 : 3;

  function flash(t: string) { setMsg(t); window.setTimeout(() => setMsg(''), 2500); }

  async function guard(fn: () => Promise<unknown>) {
    try { await fn(); await load(); } catch (e) { flash(e instanceof Error ? e.message : '操作失败'); }
  }

  return (
    <Section
      title="产品"
      desc={readOnly
        ? '品牌（1级）→ 类别（2级）→ 型号（3级）。当前身份没有产品修改权限，以下内容仅供查看。'
        : '品牌（1级）→ 类别（2级）→ 型号（3级）。有的品牌只有两级（如特斯拉：品牌-类别），有的三级（如格力：品牌-类别-型号）——在品牌里配置。'}
      actions={msg ? <span className="text-xs text-amber-400">{msg}</span> : (readOnly ? <span className="text-xs text-zinc-500">只读</span> : undefined)}
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* 品牌（1级）：固定占 1/3 */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-200">品牌（1级）<span className="ml-1.5 text-xs text-zinc-500">{brands.length}</span></span>
            {!readOnly && <button className="btn-primary !px-2.5 !py-1 text-xs" onClick={() => setBrandForm({ open: true, edit: null, name: '', logo: '', desc: '', level: 3 })}>新建</button>}
          </div>
          {readOnly && <p className="mb-2 text-[11px] text-zinc-500">当前身份无产品修改权限，仅可查看品牌 / 类别 / 型号。</p>}
          <div className="space-y-1.5">
            {brands.map((b) => (
              <div
                key={b.id}
                onClick={() => { setBrandId(b.id); setCatId(0); }}
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 transition ${brandId === b.id ? 'border-indigo-500 bg-indigo-600/15' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'}`}
              >
                {b.logo_url
                  ? <img src={b.logo_url} alt="" className="h-8 w-8 shrink-0 rounded-lg bg-zinc-900 object-contain" />
                  : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zinc-800 text-[10px] text-zinc-500">LOGO</span>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm text-zinc-100">{b.name}</span>
                    <Badge tone={b.product_level === 2 ? 'amber' : 'indigo'}>{b.product_level === 2 ? '2级' : '3级'}</Badge>
                  </div>
                  <div className="truncate text-[11px] text-zinc-500">{cats.filter((c) => c.brand_id === b.id).length} 个类别</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {!readOnly && <button className="btn-soft !px-2 !py-1 text-[11px]" onClick={(e) => { e.stopPropagation(); setBrandForm({ open: true, edit: b, name: b.name, logo: b.logo_url || '', desc: b.description || '', level: b.product_level === 2 ? 2 : 3 }); }}>修改</button>}
                </div>
              </div>
            ))}
            {brands.length === 0 && <Empty text="暂无品牌，先新建品牌" />}
          </div>
        </div>

      {/* 类别（2级）：选了品牌才出现 */}
        {brandId ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-200">
              类别（2级）<span className="ml-1.5 text-xs text-zinc-500">{catList.length}</span>
              {curBrand && <span className="ml-1.5 text-[11px] text-indigo-300">{curBrand.name}</span>}
            </span>
            {!readOnly && <button className="btn-primary !px-2.5 !py-1 text-xs" disabled={!brandId} onClick={() => setCatForm({ open: true, edit: null, name: '' })}>新建</button>}
          </div>
          <div className="space-y-1.5">
            {catList.map((c) => (
              <div
                key={c.id}
                onClick={() => setCatId(c.id)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 transition ${catId === c.id ? 'border-indigo-500 bg-indigo-600/15' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-zinc-100">{c.name}</div>
                  <div className="truncate text-[11px] text-zinc-500">
                    {brandLevel === 2 ? '该品牌 2 级产品（无需型号）' : `${models.filter((m) => m.category_id === c.id).length} 个型号`}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {!readOnly && <button className="btn-soft !px-2 !py-1 text-[11px]" onClick={(e) => { e.stopPropagation(); setCatForm({ open: true, edit: c, name: c.name }); }}>修改</button>}
                </div>
              </div>
            ))}
            {catList.length === 0 && <Empty text="该品牌下暂无类别" />}
          </div>
        </div>
        ) : (
          <div className="grid min-h-[140px] place-items-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 p-6 text-center text-xs text-zinc-600">
                选择左边任意品牌后，这里显示该品牌的「类别（2级）」
          </div>
        )}

      {/* 型号（3级）：选了类别才出现；2 级品牌保持空白 */}
        {catId && brandLevel === 3 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-200">
              型号（3级）<span className="ml-1.5 text-xs text-zinc-500">{modelList.length}</span>
              {curCat && <span className="ml-1.5 text-[11px] text-indigo-300">{curCat.name}</span>}
            </span>
            {!readOnly && <button className="btn-primary !px-2.5 !py-1 text-xs" disabled={!catId} onClick={() => setModelForm({ open: true, edit: null, name: '', desc: '' })}>新建</button>}
          </div>
          <div className="space-y-1.5">
            {modelList.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-zinc-100">{m.name}</div>
                  {m.description && <div className="truncate text-[11px] text-zinc-500">{m.description}</div>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {!readOnly && <button className="btn-soft !px-2 !py-1 text-[11px]" onClick={() => setModelForm({ open: true, edit: m, name: m.name, desc: m.description || '' })}>修改</button>}
                </div>
              </div>
            ))}
            {modelList.length === 0 && <Empty text="该类别下暂无型号" />}
          </div>
        </div>
        ) : (
          <div className="grid min-h-[140px] place-items-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 p-6 text-center text-xs text-zinc-600">
            {!brandId
                  ? '先选择左边「品牌（1级）」，这里会显示对应的第 3 级'
              : brandLevel === 2
              ? `「${curBrand?.name}」是 2 级产品（品牌-类别），没有 3 级型号`
                  : '选择中间的「类别」后，这里显示该类别下的「型号（3级）」'}
          </div>
        )}
      </div>

      {/* 品牌弹窗 */}
      <Modal
        open={brandForm.open}
        title={brandForm.edit ? '修改品牌信息' : '新建品牌'}
        onClose={() => setBrandForm({ ...brandForm, open: false })}
        footer={
          <>
            {/* 删除按钮挪到弹框左下角（列表里不再放删除） */}
            {brandForm.edit && isSuper && (
              <button className="mr-auto rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-500" onClick={() => { const b = brandForm.edit!; setBrandForm({ open: false, edit: null, name: '', logo: '', desc: '', level: 3 }); setDelBrand(b); }}>删除品牌</button>
            )}
            <ModalFooter onCancel={() => setBrandForm({ ...brandForm, open: false })} onOk={async () => {
          if (!brandForm.name.trim()) return flash('品牌名不能为空');
          await guard(async () => {
            if (brandForm.edit) await api.updateBrand(brandForm.edit.id, { name: brandForm.name.trim(), logo_url: brandForm.logo || null, description: brandForm.desc || null, product_level: brandForm.level });
            else await api.createBrand(brandForm.name.trim(), brandForm.logo || undefined, brandForm.desc || undefined, brandForm.level);
          });
          setBrandForm({ open: false, edit: null, name: '', logo: '', desc: '', level: 3 });
        }} />
          </>
        }
      >
        <div className="grid gap-3">
          <label className="label">品牌名称<input className="input mt-1" value={brandForm.name} onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })} /></label>
          <div>
            <span className="label">产品层级</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {([2, 3] as const).map((lv) => (
                <button
                  key={lv}
                  type="button"
                  onClick={() => setBrandForm({ ...brandForm, level: lv })}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition ${brandForm.level === lv ? 'border-indigo-500 bg-indigo-600/20 text-white' : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600'}`}
                >
<div className="font-semibold">{lv} 级产品</div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">{lv === 2 ? '品牌 → 类别（如：特斯拉）' : '品牌 → 类别 → 型号（如：格力）'}</div>
                </button>
              ))}
            </div>
          <p className="mb-1.5 text-[11px] text-zinc-500">选择品牌 → 类别 → 型号</p>
          </div>
          <label className="label">品牌 Logo
            <div className="mt-1 flex items-center gap-2">
              <input className="input" value={brandForm.logo} onChange={(e) => setBrandForm({ ...brandForm, logo: e.target.value })} placeholder="图片 URL，或点右侧上传" />
              <button className="btn-soft shrink-0" onClick={() => logoRef.current?.click()}>上传</button>
            </div>
            {brandForm.logo && <img src={brandForm.logo} alt="" className="mt-2 h-12 max-w-[180px] rounded-lg bg-zinc-950 object-contain p-1" />}
          </label>
          <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const { url } = await api.upload(f);
            setBrandForm((s) => ({ ...s, logo: url }));
          }} />
          <label className="label">品牌简介<textarea className="input mt-1 min-h-[64px]" value={brandForm.desc} onChange={(e) => setBrandForm({ ...brandForm, desc: e.target.value })} rows={2} /></label>
        </div>
      </Modal>

      {/* 类别弹窗 */}
      <Modal
        open={catForm.open}
        title={catForm.edit ? '修改类别' : '新建类别'}
        onClose={() => setCatForm({ ...catForm, open: false })}
        footer={
          <>
            {catForm.edit && isSuper && (
              <button className="mr-auto rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-500" onClick={() => { const c = catForm.edit!; setCatForm({ open: false, edit: null, name: '' }); setDelCat(c); }}>删除类别</button>
            )}
            <ModalFooter onCancel={() => setCatForm({ ...catForm, open: false })} onOk={async () => {
          if (!catForm.name.trim()) return flash('类别名不能为空');
          await guard(async () => {
            if (catForm.edit) await api.updateCategory(catForm.edit.id, { name: catForm.name.trim() });
            else await api.createCategory(catForm.name.trim(), brandId);
          });
          setCatForm({ open: false, edit: null, name: '' });
        }} />
          </>
        }
      >
        <div className="grid gap-3">
          <div className="text-xs text-zinc-500">所属品牌：<span className="text-zinc-300">{curBrand?.name || '—'}</span></div>
          <label className="label">类别名称<input className="input mt-1" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} placeholder="如：护肤线 / 彩妆线" /></label>
        </div>
      </Modal>

      {/* 型号弹窗 */}
      <Modal
        open={modelForm.open}
        title={modelForm.edit ? '修改型号' : '新建型号'}
        onClose={() => setModelForm({ ...modelForm, open: false })}
        footer={
          <>
            {modelForm.edit && isSuper && (
              <button className="mr-auto rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-500" onClick={() => { const m = modelForm.edit!; setModelForm({ open: false, edit: null, name: '', desc: '' }); setDelModel(m); }}>删除型号</button>
            )}
            <ModalFooter onCancel={() => setModelForm({ ...modelForm, open: false })} onOk={async () => {
          if (!modelForm.name.trim()) return flash('型号名不能为空');
          await guard(async () => {
            if (modelForm.edit) await api.updateModel(modelForm.edit.id, { name: modelForm.name.trim(), description: modelForm.desc || null });
            else await api.createModel(modelForm.name.trim(), catId, modelForm.desc || undefined);
          });
          setModelForm({ open: false, edit: null, name: '', desc: '' });
        }} />
          </>
        }
      >
        <div className="grid gap-3">
          <div className="text-xs text-zinc-500">
              {curBrand?.name || '—'} → <span className="text-zinc-300">{curCat?.name || '—'}</span>
          </div>
          <label className="label">型号名称<input className="input mt-1" value={modelForm.name} onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })} placeholder="如：Model Y / 小黑瓶 30ml" /></label>
          <label className="label">备注<textarea className="input mt-1 min-h-[56px]" value={modelForm.desc} onChange={(e) => setModelForm({ ...modelForm, desc: e.target.value })} rows={2} /></label>
        </div>
      </Modal>

      <ConfirmModal open={delBrand !== null} title="删除品牌" onCancel={() => setDelBrand(null)} onConfirm={async () => { if (delBrand) { await guard(() => api.deleteBrand(delBrand.id)); setDelBrand(null); } }} />
      <ConfirmModal open={delCat !== null} title="删除类别" onCancel={() => setDelCat(null)} onConfirm={async () => { if (delCat) { await guard(() => api.deleteCategory(delCat.id)); setDelCat(null); } }} />
      <ConfirmModal open={delModel !== null} title="删除型号" onCancel={() => setDelModel(null)} onConfirm={async () => { if (delModel) { await guard(() => api.deleteModel(delModel.id)); setDelModel(null); } }} />
    </Section>
  );
}

/* ==================== 2. 项目 ==================== */
function ProjectsTab({ readOnly: readOnlyProp }: { readOnly?: boolean } = {}) {
  const T = useUiTexts();
  const user = useAuth((s) => s.user)!;
  const isGlobalAdmin = isGlobalRole(user.role);
  // 修改项目权限：超管 / 高级管理者 / 项目经理；部门主管 / 部门成员只能查看，弹窗内容全部只读
  const canEditProjects = !readOnlyProp && (user.role === 'super_admin' || user.role === 'senior_manager' || user.role === 'pm');
  const [projects, setProjects] = useState<Project[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [links, setLinks] = useState<ProjectProduct[]>([]);
  const [filter, setFilter] = useState({ brand: 0, cat: 0, model: 0 });
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<Project | null>(null);
  const [delOpen, setDelOpen] = useState<Project | null>(null);
  const [form, setForm] = useState({ name: '', brand: 0, cat: 0, start: '', end: '', pmId: 0, products: [] as { category_id: number; model_id: number | null }[] });
  // 项目经理候选：从「项目经理」角色的用户中筛选绑定（仅超管 / 高级管理者可设置）
  const [pmUsers, setPmUsers] = useState<User[]>([]);
  const canSetPm = user.role === 'super_admin' || user.role === 'senior_manager';
  const pmLabel = pmUsers.find((u) => u.id === form.pmId)?.display_name
    || pmUsers.find((u) => u.id === form.pmId)?.username
    // 没有候选列表时（项目经理本人打开自己的项目）直接用项目上记录的项目经理昵称
    || editOpen?.pm_name
    || '—';
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    // 只读角色（部门主管 / 部门成员）请求全量项目列表：可以浏览，但看不到写入口
    const [p, b, c, m, l] = await Promise.all([
      api.listProjects(undefined, undefined, undefined, !canEditProjects || !!readOnlyProp),
      api.listBrands(), api.listCategories(), api.listModels(), api.listProjectModels(),
    ]);
    setProjects(p.projects); setBrands(b.brands); setCats(c.categories); setModels(m.models); setLinks(l.links ?? l.products ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEditProjects, readOnlyProp]);
  useEffect(() => { void load(); }, [load]);

  // 项目经理候选：仅超管 / 高级管理者需要，且只列「项目经理」角色的用户
  useEffect(() => {
    if (!canSetPm) return;
    api.listUsers()
      .then((r) => setPmUsers(r.users.filter((x) => x.role === 'pm')))
      .catch(() => setPmUsers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSetPm]);

  function flash(t: string) { setMsg(t); window.setTimeout(() => setMsg(''), 2500); }

  const filtered = useMemo(() => {
    let list = projects;
    if (filter.brand) list = list.filter((p) => p.brand_id === filter.brand);
    if (filter.cat) list = list.filter((p) => p.category_id === filter.cat);
    if (filter.model) {
      const ids = links.filter((l) => l.model_id === filter.model).map((l) => l.project_id);
      list = list.filter((p) => ids.includes(p.id));
    }
    return list;
  }, [projects, filter, links]);

  const productLabel = (l: ProjectProduct) => l.model_name || l.category_name || '—';

/** 某品牌内的全部产品（2 级品牌=类别，3 级品牌=型号） */
  const allProductsOf = useCallback(
    (brandId: number) => {
      const catList = cats.filter((c) => c.brand_id === brandId);
      const level = brands.find((b) => b.id === brandId)?.product_level === 2 ? 2 : 3;
      if (level === 2) return catList.map((c) => ({ category_id: c.id, model_id: null as number | null }));
      return catList.flatMap((c) => models.filter((m) => m.category_id === c.id).map((m) => ({ category_id: c.id, model_id: m.id as number | null })));
    },
    [cats, models, brands]
  );

  function openCreate() {
    const firstBrand = brands[0]?.id ?? 0;
    setForm({ name: '', brand: firstBrand, cat: cats.find((c) => c.brand_id === firstBrand)?.id ?? 0, start: '', end: '', pmId: 0, products: allProductsOf(firstBrand) });
    setCreateOpen(true);
  }

  return (
    <Section
      title="项目"
      desc={T('admin.projects.desc')}
      actions={
        <>
          {msg && <span className="text-xs text-amber-400">{msg}</span>}
          <ProductCascade brands={brands} cats={cats} models={models} value={filter} onChange={setFilter} />
          {canEditProjects && <button className="btn-primary" onClick={openCreate}>新建项目</button>}
        </>
      }
    >
      <div className="space-y-3">
        {filtered.map((p) => {
          const pProducts = links.filter((l) => l.project_id === p.id);
          return (
            <div key={p.id} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-100">{p.name}</span>
                    {p.brand_name && <Badge tone="indigo">{p.brand_name}</Badge>}
                    {/* 项目经理昵称 */}
                    <span className="text-[11px] text-zinc-500">
                      项目经理：<span className="text-zinc-300">{p.pm_name || '未填写'}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 text-[11px] text-zinc-500">
                    专属素材 {p.asset_count ?? 0} · 专属模板 {p.template_count ?? 0}
                    {p.start_date || p.end_date ? ` · ${p.start_date || '—'} ~ ${p.end_date || '—'}` : ''}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button className="btn-soft !px-3 !py-1.5 text-xs" onClick={() => {
                    setForm({
                      name: p.name, brand: p.brand_id, cat: p.category_id || 0,
                      start: p.start_date || '', end: p.end_date || '',
                      pmId: p.pm_id || 0,
                      // 项目默认拥有所属品牌内的所有产品：打开时默认全部勾选（可手动取消）
                      products: allProductsOf(p.brand_id),
                    });
                    setEditOpen(p);
                  }}>{canEditProjects ? '修改' : '查看'}</button>
                  {isGlobalAdmin && <button className="btn-danger !px-3 !py-1.5 text-xs" onClick={() => setDelOpen(p)}>删除</button>}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <Empty text="当前筛选下暂无项目" />}
      </div>

      {/* 新建项目 */}
      <Modal
        open={createOpen}
        title="新建项目"
        onClose={() => setCreateOpen(false)}
        footer={<ModalFooter okText="创建项目" onCancel={() => setCreateOpen(false)} onOk={async () => {
          if (!form.name.trim()) return flash('项目名不能为空');
          try {
            await api.createProject({
              name: form.name.trim(),
              brand_id: form.brand || undefined,
              category_id: form.cat || undefined,
              start_date: form.start || null,
              end_date: form.end || null,
              pm_id: form.pmId || null,
              products: form.products,
            });
            setCreateOpen(false);
            void load();
          } catch (e) { flash(e instanceof Error ? e.message : '创建失败'); }
        }} />}
      >
        <div className="grid gap-3">
          <label className="label">项目名称<input className="input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：奥迪小红书 9 月投放" /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="label">开始时间
              <DatePicker className="mt-1" value={form.start} onChange={(v) => setForm({ ...form, start: v })} placeholder="点击弹出日历" />
            </label>
            <label className="label">结束时间
              <DatePicker className="mt-1" value={form.end} onChange={(v) => setForm({ ...form, end: v })} placeholder="点击弹出日历" />
            </label>
          </div>
          <label className="label">项目经理{canSetPm ? '（从「项目经理」角色的用户中选择绑定）' : '（仅超管 / 高级管理者可设置）'}
            {canSetPm ? (
              <select className="input mt-1" value={form.pmId} onChange={(e) => setForm({ ...form, pmId: Number(e.target.value) })}>
                <option value={0}>暂不指定</option>
                {pmUsers.map((u) => <option key={u.id} value={u.id}>{u.display_name || u.username}</option>)}
              </select>
            ) : (
              <input className="input mt-1" value={pmLabel} readOnly disabled placeholder="未指定" />
            )}
          </label>
          <label className="label">所属品牌
            <select className="input mt-1" value={form.brand} onChange={(e) => {
              const b = Number(e.target.value);
              setForm({ ...form, brand: b, cat: cats.find((c) => c.brand_id === b)?.id ?? 0, products: allProductsOf(b) });
            }}>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}（{b.product_level === 2 ? '2级' : '3级'}）</option>)}
            </select>
          </label>
          <BrandProductsPick
            brands={brands} cats={cats} models={models}
            brand={form.brand} value={form.products}
            onChange={(list) => setForm({ ...form, products: list })}
          />
        </div>
      </Modal>

      {/* 修改 / 查看项目（含项目内产品 / 专属素材 / 专属模板） */}
      <Modal
        open={editOpen !== null}
        width="lg"
        title={`${canEditProjects ? '修改' : '查看'}项目：${editOpen?.name || ''}`}
        onClose={() => setEditOpen(null)}
        footer={canEditProjects ? (
          <ModalFooter onCancel={() => setEditOpen(null)} onOk={async () => {
            if (!form.name.trim() || !editOpen) return flash('项目名不能为空');
            try {
              await api.updateProject(editOpen.id, {
                name: form.name.trim(),
                category_id: form.products[0]?.category_id || form.cat || undefined,
                start_date: form.start || null,
                end_date: form.end || null,
                pm_id: form.pmId || null,
                products: form.products,
              });
              setEditOpen(null);
              void load();
            } catch (e) { flash(e instanceof Error ? e.message : '保存失败'); }
          }} />
        ) : (
          <div className="flex justify-end">
            <button className="btn-soft" onClick={() => setEditOpen(null)}>关闭</button>
          </div>
        )}
      >
        {canEditProjects ? (
        <div className="grid gap-3">
          <label className="label">项目名称<input className="input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="label">开始时间
              <DatePicker className="mt-1" value={form.start} onChange={(v) => setForm({ ...form, start: v })} placeholder="点击弹出日历" />
            </label>
            <label className="label">结束时间
              <DatePicker className="mt-1" value={form.end} onChange={(v) => setForm({ ...form, end: v })} placeholder="点击弹出日历" />
            </label>
          </div>
          <label className="label">项目经理{canSetPm ? '（从「项目经理」角色的用户中选择绑定）' : '（仅超管 / 高级管理者可设置）'}
            {canSetPm ? (
              <select className="input mt-1" value={form.pmId} onChange={(e) => setForm({ ...form, pmId: Number(e.target.value) })}>
                <option value={0}>暂不指定</option>
                {pmUsers.map((u) => <option key={u.id} value={u.id}>{u.display_name || u.username}</option>)}
              </select>
            ) : (
              <input className="input mt-1" value={pmLabel} readOnly disabled placeholder="—" />
            )}
          </label>
          <label className="label">所属品牌（可修改，修改后默认勾选该品牌全部产品）
            <select className="input mt-1" value={form.brand} onChange={(e) => {
              const b = Number(e.target.value);
              setForm({ ...form, brand: b, cat: cats.find((c) => c.brand_id === b)?.id ?? 0, products: allProductsOf(b) });
            }}>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <BrandProductsPick brands={brands} cats={cats} models={models} brand={form.brand} value={form.products} onChange={(list) => setForm({ ...form, products: list })} />
          {editOpen && (
            <div className="mt-1 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <ProjectExtras project={editOpen} brands={brands} cats={cats} models={models} onChanged={load} flash={flash} />
            </div>
          )}
        </div>
        ) : (
        /* 只读查看：部门主管等无修改权限的角色，所有项仅展示 */
        <div className="grid gap-2.5">
          <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[11px] text-zinc-500">
            当前身份无修改项目权限，以下内容仅供查看。
          </p>
          <div className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
            <div className="flex justify-between gap-3"><span className="shrink-0 text-zinc-500">项目名称</span><span className="text-right text-zinc-200">{editOpen?.name || '—'}</span></div>
            <div className="flex justify-between gap-3"><span className="shrink-0 text-zinc-500">项目经理</span><span className="text-right text-zinc-200">{editOpen?.pm_name || pmLabel || '—'}</span></div>
            <div className="flex justify-between gap-3"><span className="shrink-0 text-zinc-500">所属品牌</span><span className="text-right text-zinc-200">{editOpen?.brand_name || brands.find((b) => b.id === form.brand)?.name || '—'}</span></div>
            <div className="flex justify-between gap-3"><span className="shrink-0 text-zinc-500">开始时间</span><span className="text-right text-zinc-200">{editOpen?.start_date || '—'}</span></div>
            <div className="flex justify-between gap-3"><span className="shrink-0 text-zinc-500">结束时间</span><span className="text-right text-zinc-200">{editOpen?.end_date || '—'}</span></div>
            <div className="flex justify-between gap-3"><span className="shrink-0 text-zinc-500">专属素材</span><span className="text-right text-zinc-200">{editOpen?.asset_count ?? 0} 个</span></div>
            <div className="flex justify-between gap-3"><span className="shrink-0 text-zinc-500">专属模板</span><span className="text-right text-zinc-200">{editOpen?.template_count ?? 0} 个</span></div>
            <div className="flex justify-between gap-3">
              <span className="shrink-0 text-zinc-500">项目内产品</span>
              <span className="text-right text-zinc-200">
                {(() => {
                  const ps = editOpen ? links.filter((l) => l.project_id === editOpen.id).map(productLabel) : [];
                  return ps.length ? ps.join('、') : '—';
                })()}
              </span>
            </div>
          </div>
        </div>
        )}
      </Modal>

      <ConfirmModal open={delOpen !== null} title="删除项目" desc="删除后不可恢复。该项目内的设计稿会被删除，其专属素材与专属模板会转为「通用」。" onCancel={() => setDelOpen(null)} onConfirm={async () => {
        if (!delOpen) return;
        try { await api.deleteProject(delOpen.id); setDelOpen(null); void load(); } catch (e) { flash(e instanceof Error ? e.message : '删除失败'); setDelOpen(null); }
      }} />
    </Section>
  );
}

/**
 * 项目内产品：默认勾选该品牌内的全部产品，可手动取消某一个（2 级品牌：产品=类别；3 级品牌：产品=型号（按类别分组））
 */
function BrandProductsPick({
  brands, cats, models, brand, value, onChange,
}: {
  brands: Brand[];
  cats: Category[];
  models: Model[];
  brand: number;
  value: { category_id: number; model_id: number | null }[];
  onChange: (list: { category_id: number; model_id: number | null }[]) => void;
}) {
  const brandObj = brands.find((b) => b.id === brand);
  const level = brandObj?.product_level === 2 ? 2 : 3;
  const catList = cats.filter((c) => c.brand_id === brand);
  const groups = catList.map((c) => ({
    cat: c,
    items: level === 2
      ? [{ category_id: c.id, model_id: null as number | null, name: c.name }]
      : models.filter((m) => m.category_id === c.id).map((m) => ({ category_id: c.id, model_id: m.id as number | null, name: m.name })),
  })).filter((g) => g.items.length > 0);
  const all = groups.flatMap((g) => g.items.map((i) => ({ category_id: i.category_id, model_id: i.model_id })));
  const keyOf = (c: number, m: number | null) => `${c}-${m ?? 0}`;
  const selected = new Set(value.map((v) => keyOf(v.category_id, v.model_id)));

  const toggle = (c: number, m: number | null) => {
    const k = keyOf(c, m);
    onChange(selected.has(k) ? value.filter((v) => keyOf(v.category_id, v.model_id) !== k) : [...value, { category_id: c, model_id: m }]);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="label !mb-0">项目内产品（默认全选该品牌产品，可取消勾选）</span>
        <span className="flex gap-2 text-[11px]">
          <button type="button" className="text-indigo-300 hover:text-white" onClick={() => onChange(all)}>全选</button>
          <button type="button" className="text-zinc-400 hover:text-white" onClick={() => onChange([])}>全不选</button>
        </span>
      </div>
      <p className="mb-1.5 text-[11px] text-zinc-500">
        {brandObj ? `「${brandObj.name}」为 ${level} 级产品：${level === 2 ? '产品即类别' : '产品为型号（按类别分组）'}` : '请先选择品牌'}
      </p>
      <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-2">
        {groups.length === 0 && <div className="py-3 text-center text-xs text-zinc-600">该品牌下暂无可选产品</div>}
        {groups.map((g) => (
          <div key={g.cat.id}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">{g.cat.name}</span>
              {level === 3 && (
                <button type="button" className="text-[10px] text-zinc-500 hover:text-zinc-200"
                  onClick={() => {
                    const ids = g.items.map((i) => keyOf(i.category_id, i.model_id));
                    const allOn = ids.every((k) => selected.has(k));
                    const rest = value.filter((v) => !ids.includes(keyOf(v.category_id, v.model_id)));
                    onChange(allOn ? rest : [...rest, ...g.items.map((i) => ({ category_id: i.category_id, model_id: i.model_id }))]);
                  }}
                >{g.items.every((i) => selected.has(keyOf(i.category_id, i.model_id))) ? '取消本类别' : '全选本类别'}</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {g.items.map((i) => {
                const on = selected.has(keyOf(i.category_id, i.model_id));
                return (
                  <label key={keyOf(i.category_id, i.model_id)} className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition ${on ? 'border-emerald-500 bg-emerald-600/20 text-emerald-100' : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600'}`}>
                    <input type="checkbox" className="h-3 w-3 accent-emerald-500" checked={on} onChange={() => toggle(i.category_id, i.model_id)} />
                    {i.name}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 text-[11px] text-zinc-500">已选 {value.length} / {all.length} 个产品</div>
    </div>
  );
}

function ProductMultiPick({
  brands, cats, models, brand, value, onChange, defCat = 0,
}: {
  brands: Brand[];
  cats: Category[];
  models: Model[];
  brand: number;
  value: { category_id: number; model_id: number | null }[];
  onChange: (list: { category_id: number; model_id: number | null }[]) => void;
  defCat?: number;
}) {
  const brandObj = brands.find((b) => b.id === brand);
  const level = brandObj?.product_level === 2 ? 2 : 3;
  const catList = cats.filter((c) => !brand || c.brand_id === brand);
  const [cat, setCat] = useState(defCat || catList[0]?.id || 0);
  const modelList = models.filter((m) => m.category_id === cat);
  const [pick, setPick] = useState(0);

  useEffect(() => {
    setCat((cur) => (cur && catList.some((c) => c.id === cur) ? cur : catList[0]?.id ?? 0));
    setPick(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, cats.length]);

  // 切换品牌/类别时型号选择重置
  useEffect(() => { setPick(0); }, [cat]);

  const label = (it: { category_id: number; model_id: number | null }) => {
    const c = cats.find((x) => x.id === it.category_id);
    const m = it.model_id ? models.find((x) => x.id === it.model_id) : null;
    if (level === 2 || !m) return c?.name || `类别 ${it.category_id}`;
    return `${c?.name ? c.name + ' · ' : ''}${m.name}`;
  };

  const exists = (it: { category_id: number; model_id: number | null }) =>
    value.some((v) => v.category_id === it.category_id && (v.model_id ?? 0) === (it.model_id ?? 0));

  const canAdd = level === 2 ? !!cat && !exists({ category_id: cat, model_id: null }) : !!pick && !exists({ category_id: cat, model_id: pick });

  return (
    <div>
      <span className="label">项目内有哪些产品</span>
      <p className="mb-1.5 text-[11px] text-zinc-500">
        {level === 2
          ? `「${brandObj?.name || ''}」是 2 级产品：选到「类别」即可添加，不需要型号`
          : '3 级产品：类别 → 型号'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input !w-36" value={cat} onChange={(e) => setCat(Number(e.target.value))}>
          {catList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          {catList.length === 0 && <option value={0}>（该品牌暂无类别）</option>}
        </select>
        {level === 3 && (
          <select className="input !w-40" value={pick} onChange={(e) => setPick(Number(e.target.value))}>
            <option value={0}>选择型号</option>
            {modelList.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        <button
          type="button"
          className="btn-soft !px-3 !py-1.5 text-xs disabled:opacity-50"
          disabled={!canAdd}
          onClick={() => {
            if (!canAdd) return;
            onChange([...value, { category_id: cat, model_id: level === 2 ? null : pick }]);
          }}
        >
          添加
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {value.length === 0 && <span className="text-xs text-zinc-600">尚未关联产品</span>}
        {value.map((it) => (
          <span key={`${it.category_id}-${it.model_id ?? 0}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-600/20 px-2.5 py-1 text-xs text-emerald-200">
            {label(it)}
            <button
              type="button"
              className="text-emerald-300 hover:text-white"
              onClick={() => onChange(value.filter((v) => !(v.category_id === it.category_id && (v.model_id ?? 0) === (it.model_id ?? 0))))}
            >×</button>
          </span>
        ))}
      </div>
    </div>
  );
}

/** 项目专属素材 / 专属模板（在「修改项目」弹窗内管理；时间与项目内产品在弹窗表单里） */
function ProjectExtras({
  project, brands, cats, models, onChanged, flash,
}: {
  project: Project;
  brands: Brand[];
  cats: Category[];
  models: Model[];
  onChanged: () => void | Promise<void>;
  flash: (t: string) => void;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetTags, setAssetTags] = useState<AssetTag[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  // 大类：产品类 / 贴图类（大类之下不再分素材类型）
  const [assetKind, setAssetKind] = useState<AssetKind>('product');
  const [assetUpOpen, setAssetUpOpen] = useState(false);
  const [tplUpOpen, setTplUpOpen] = useState(false);
  const [tplEdit, setTplEdit] = useState<Template | null>(null);
  const [assetEdit, setAssetEdit] = useState<Asset | null>(null);
  const [types, setTypes] = useState<TemplateType[]>([]);
  const [delAsset, setDelAsset] = useState<Asset | null>(null);
  const [delTpl, setDelTpl] = useState<Template | null>(null);
  const T = useUiTexts();

  const load = useCallback(async () => {
    const [a, t, tt, at] = await Promise.all([
      api.listAssets({ project_id: project.id }),
      api.listTemplates({ project_id: project.id, scope: 'project' }),
      api.listTemplateTypes(),
      api.listAssetTags(),
    ]);
    setAssets(a.assets);
    setTemplates(t.references);
    setTypes(tt.types);
    setAssetTags(at.tags);
  }, [project.id]);
  useEffect(() => { void load(); }, [load]);

  /** 大类过滤：产品类 = 产品图；贴图类 = 其余素材 */
  const projAssets = assets.filter((a) => (assetKind === 'product' ? a.type === 'product' : a.type !== 'product'));

  return (
    <div className="space-y-4">
      {/* 专属素材 */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-zinc-300">专属素材（仅本项目可用）</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* 大类：产品类 / 贴图类（二选一），大类之下不再分素材类型 */}
            {(['product', 'sticker'] as AssetKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setAssetKind(k)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${assetKind === k ? 'bg-indigo-600 text-white shadow shadow-indigo-950/40' : 'border border-zinc-600 bg-zinc-800/60 text-zinc-400 hover:border-zinc-400 hover:text-zinc-200'}`}
              >{T(`asset.kind.${k}`)}</button>
            ))}
            <button className="btn-soft !px-2.5 !py-1 text-[11px]" onClick={() => setAssetUpOpen(true)}>上传专属素材</button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {projAssets.map((a) => (
            <div key={a.id} className="group relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
              <img src={apiUrl(a.url)} alt="" className="aspect-square w-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/65 opacity-0 transition group-hover:opacity-100">
                <button className="btn-soft !px-2 !py-1 text-[10px]" onClick={() => setAssetEdit(a)}>修改</button>
                <button className="btn-danger !px-2 !py-1 text-[10px]" onClick={() => setDelAsset(a)}>删除</button>
              </div>
              <div className="flex flex-wrap items-center gap-1 px-1.5 py-1">
                <span className="rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-400">{ASSET_TYPE_LABEL[a.type] || a.type}</span>
                {(a.tags || []).map((t) => <span key={t.id} className="rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-indigo-300">{t.name}</span>)}
              </div>
            </div>
          ))}
          {projAssets.length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed border-zinc-800 py-6 text-center text-[11px] text-zinc-600">
              本项目暂无{assetKind === 'product' ? '产品类素材' : '贴图类素材'}
            </div>
          )}
        </div>
      </div>

      {/* 专属模板 */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-300">专属模板（仅本项目可用）</span>
          <button className="btn-soft !px-2.5 !py-1 text-[11px]" onClick={() => setTplUpOpen(true)}>上传专属模板</button>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {templates.map((t) => (
            <div key={t.id} className="group relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
              <img src={apiUrl(t.url)} alt="" className="w-full" />
              <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/65 opacity-0 transition group-hover:opacity-100">
                <button className="btn-soft !px-2 !py-1 text-[10px]" onClick={() => setTplEdit(t)}>修改</button>
                <button className="btn-danger !px-2 !py-1 text-[10px]" onClick={() => setDelTpl(t)}>删除</button>
              </div>
              <div className="truncate px-1.5 py-1 text-[10px] text-zinc-400">{t.name}</div>
            </div>
          ))}
          {templates.length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed border-zinc-800 py-6 text-center text-[11px] text-zinc-600">本项目暂无专属模板</div>
          )}
        </div>
      </div>

      <AssetUploadModal
        open={assetUpOpen}
        onClose={() => setAssetUpOpen(false)}
        brands={brands} cats={cats} models={models}
        tags={assetTags}
        fixedProjectId={project.id}
        defaultKind={assetKind}
        onDone={async () => { setAssetUpOpen(false); await load(); void onChanged(); flash('专属素材已上传'); }}
      />
      <AssetEditModal
        asset={assetEdit}
        onClose={() => setAssetEdit(null)}
        brands={brands} cats={cats} models={models}
        tags={assetTags}
        onDone={async () => { setAssetEdit(null); await load(); void onChanged(); flash('素材已修改'); }}
      />
      <TemplateUploadModal
        open={tplUpOpen}
        onClose={() => setTplUpOpen(false)}
        types={types}
        brands={brands}
        fixedProjectId={project.id}
        fixedBrandId={project.brand_id}
        onDone={async () => { setTplUpOpen(false); await load(); void onChanged(); flash('专属模板已上传'); }}
      />
      <TemplateEditModal
        template={tplEdit}
        types={types}
        brands={brands}
        onClose={() => setTplEdit(null)}
        onDone={async () => { setTplEdit(null); await load(); void onChanged(); flash('模板已修改'); }}
      />
      <ConfirmModal open={delAsset !== null} title="删除素材" onCancel={() => setDelAsset(null)} onConfirm={async () => { if (delAsset) { await api.deleteAsset(delAsset.id); setDelAsset(null); await load(); void onChanged(); } }} />
      <ConfirmModal open={delTpl !== null} title="删除模板" onCancel={() => setDelTpl(null)} onConfirm={async () => { if (delTpl) { await api.deleteTemplate(delTpl.id); setDelTpl(null); await load(); void onChanged(); } }} />
    </div>
  );
}

/* ==================== 3. 用户 ==================== */
function UsersTab() {
  const T = useUiTexts();
  const user = useAuth((s) => s.user)!;
  const isSuper = user.role === 'super_admin';
  const isSenior = user.role === 'senior_manager';
  const isGlobalAdmin = isGlobalRole(user.role);
  const isPM = user.role === 'pm';
  const isHead = user.role === 'dept_head';
  // 能进用户管理页的角色：超管 / 高级管理者 / 项目经理 / 部门主管
  const canManageUsers = isSuper || isSenior || isPM || isHead;
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [delOpen, setDelOpen] = useState<User | null>(null);
  const [pwdUser, setPwdUser] = useState<User | null>(null);
  const [pwd, setPwd] = useState('');
  const [msg, setMsg] = useState('');
  // 按昵称搜索 + 上级行展开（默认隐藏下属）
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<number[]>([]);

  const emptyForm = { display_name: '', username: '', password: DEFAULT_PASSWORD, role: 'user' as Role, brand_id: 0, grants: [] as ProjectGrant[], brandGrants: [] as BrandGrant[], project_id: 0, leader_id: 0 };
  const [f, setF] = useState(emptyForm);
  const [ef, setEf] = useState({
    display_name: '', username: '', password: '', role: 'user' as Role, brand_id: 0,
    grants: [] as ProjectGrant[], brandGrants: [] as BrandGrant[], leader_id: 0,
    perms: {} as Record<string, string>, caps: {} as Record<string, string>, memberProject: 0,
  });

  const load = useCallback(async () => {
    const [u, b, c, p, r] = await Promise.all([api.listUsers(), api.listBrands(), api.listCategories(), api.listProjects(), api.listRoles()]);
    setUsers(u.users); setBrands(b.brands); setCats(c.categories); setProjects(p.projects); setRoles(r.roles);
  }, []);
  useEffect(() => { void load(); }, [load]);
  function flash(t: string) { setMsg(t); window.setTimeout(() => setMsg(''), 2500); }

  /**
   * 可创建的角色：
   * - 超管：全部 + 自定义角色；高级管理者：除「超管」外全部 + 自定义角色
   * - 项目经理：仅「项目成员」（自动归属到自己名下）
   * - 部门主管：仅「部门成员」（自动归属到自己名下）
   * - 其他角色：不能建号
   */
  const customRoles = roles.filter((r) => !r.builtin).map((r) => r.key) as Role[];
  const roleOptions: Role[] = isSuper
    ? [...ALL_ROLES, ...customRoles]
    : isSenior
      ? [...ALL_ROLES.filter((r) => r !== 'super_admin'), ...customRoles]
      : isPM
        ? (['kos'] as Role[])
        : isHead
          ? (['dept_member'] as Role[])
          : [];

  /** 可修改：自己 + 名下成员（超管 / 高级管理者不受限制） */
  const canEdit = (u: User) => {
    if (user.id === u.id) return true;
    if (isSuper) return true;
    if (isSenior) return u.role !== 'super_admin';
    if (isPM || isHead) return Number(u.leader_id) === user.id;
    return false;
  };
/** 默认拥有全部品牌与全部项目权限的角色（超管 / 高级管理者 / 部门主管） */
  const fullAccessRole = (r: Role) => isGlobalRole(r);

  /** 角色名称（自定义角色取后台配置的名称） */
  const roleName = (r: string) => ROLE_LABEL[r as Role] || roles.find((x) => x.key === r)?.name || r;
  /** 后台用户列表从上到下的层级顺序：超管 → 高级管理者 → 项目经理 → 部门主管 → 部门成员 → 项目成员 → 普通用户 */
  const ROLE_ORDER: Role[] = ['super_admin', 'senior_manager', 'pm', 'dept_head', 'dept_member', 'kos', 'user'];
  const orderOf = (r: string) => {
    const i = ROLE_ORDER.indexOf(r as Role);
    if (i >= 0) return i;
    const custom = roles.find((x) => x.key === r);
    return custom ? (Number(custom.level) === 2 ? 2.5 : 6.5) : 9;
  };
  /** 需要归属负责人的角色：项目成员 → 项目经理；部门成员 → 部门主管 */
  const needsLeader = (r: string) => r === 'kos' || r === 'dept_member';
  /** 可作为归属负责人的用户 */
  const leaderCandidates = (r: string) => users.filter((u) => u.role === (r === 'kos' ? 'pm' : 'dept_head'));
  /** 某负责人名下的成员（按 leader_id 归属） */
  const membersOf = (leader: User) => users.filter((u) => Number(u.leader_id) === leader.id);
  /** 是否为可展开的负责人行（项目经理 / 部门主管，且有下属） */
  const isLeaderRow = (u: User) => (u.role === 'pm' || u.role === 'dept_head') && membersOf(u).length > 0;
  /** 按昵称 / 用户名搜索，并按层级顺序排序 */
  const sortedUsers = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return users
      .filter((u) => !kw || (u.display_name || '').toLowerCase().includes(kw) || (u.username || '').toLowerCase().includes(kw))
      .slice()
      .sort((a, b) => {
        const d = orderOf(a.role) - orderOf(b.role);
        if (d !== 0) return d;
        return (a.display_name || a.username).localeCompare(b.display_name || b.username, 'zh-Hans-CN');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, q, roles]);
  /** 最外层用户：没有归属负责人的（有归属的成员只挂在负责人下面，不再单独一行） */
  const outerUsers = useMemo(() => {
    const ids = new Set(users.map((u) => u.id));
    return sortedUsers.filter((u) => !u.leader_id || !ids.has(Number(u.leader_id)));
  }, [sortedUsers, users]);

  // 分页：每页 20 行（展开成员 / 项目分组会占用行数，按可见行分页）
  const [page, setPage] = useState(1);
  /** 被手动折叠起来的「项目分组」（key = 负责人id-项目id） */
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  // 「选择品牌查询项目」：给项目经理分配项目时用（默认不显示项目）
  const [assignBrand, setAssignBrand] = useState(0);
  const PER_PAGE = 20;

  /**
   * 组织表格行：
   * - 项目经理（≥2 个项目）：名下先按项目折叠（项目组可再展开），成员挂在各自项目下
   * - 项目经理（1 个项目）/ 部门主管：成员直接挂在负责人下面
   * - 成员行默认隐藏（负责人行 ▾ 可展开）
   */
  const tableRows = useMemo(() => {
    type Row =
      | { type: 'user'; u: User; kids: number; hasKids: boolean }
      | { type: 'sub'; u: User }
      | { type: 'group'; key: string; label: string; count: number; pid: number; ownerId: number; open: boolean }
      | { type: 'sub2'; u: User; projectName: string };
    const rows: Row[] = [];
    for (const u of outerUsers) {
      const kids = (u.role === 'pm' || u.role === 'dept_head') ? membersOf(u) : [];
      const myProjects = u.role === 'pm' ? (u.projects || []) : [];
      const groupByProject = u.role === 'pm' && myProjects.length >= 2;
      rows.push({ type: 'user', u, kids: kids.length, hasKids: kids.length > 0 });
      const open = expanded.includes(u.id);
      if (!open) continue;
      if (groupByProject) {
        const used = new Set<number>();
        for (const p of myProjects) {
          const members = kids.filter((k) => (k.projects || []).some((x) => x.project_id === p.project_id));
          members.forEach((m) => used.add(m.id));
          // 项目组默认展开（负责人行展开后即可看到成员），点项目组可折叠
          const gOpen = !collapsedGroups.includes(`${u.id}-${p.project_id}`);
          rows.push({ type: 'group', key: `g-${u.id}-${p.project_id}`, label: p.project_name || `项目 ${p.project_id}`, count: members.length, pid: p.project_id, ownerId: u.id, open: gOpen });
          if (gOpen) for (const m of members) rows.push({ type: 'sub2', u: m, projectName: p.project_name || '' });
        }
        const rest = kids.filter((k) => !used.has(k.id));
        if (rest.length) {
          const gOpen = !collapsedGroups.includes(`${u.id}-0`);
          rows.push({ type: 'group', key: `g-${u.id}-0`, label: '未分配项目', count: rest.length, pid: 0, ownerId: u.id, open: gOpen });
          if (gOpen) for (const m of rest) rows.push({ type: 'sub2', u: m, projectName: '未分配项目' });
        }
      } else {
        for (const k of kids) rows.push({ type: 'sub', u: k });
      }
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outerUsers, users, expanded, collapsedGroups]);

  const pageCount = Math.max(1, Math.ceil(tableRows.length / PER_PAGE));
  const curPage = Math.min(page, pageCount);
  const pageRows = tableRows.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);
  useEffect(() => { setPage(1); }, [q, users.length]);

  // 项目经理 / 部门主管登录时：默认展开自己名下的成员；部门成员默认展开所在部门
  useEffect(() => {
    if (!users.length) return;
    if (isPM || isHead) setExpanded((x) => (x.includes(user.id) ? x : [...x, user.id]));
    if (user.role === 'dept_member') {
      const me = users.find((u) => u.id === user.id);
      const lead = Number(me?.leader_id) || 0;
      if (lead) setExpanded((x) => (x.includes(lead) ? x : [...x, lead]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, isPM, isHead, user.role, user.id]);

  /** 展开后的下级成员行（默认隐藏，缩进显示，只能查看） */
  function subRow(u: User, projectName?: string) {
    return (
      <tr key={`sub-${u.id}-${projectName || ''}`} className="border-b border-indigo-900/30 bg-indigo-950/30 align-middle last:border-0">
        <td className="truncate px-4 py-1 text-zinc-200">
          <span className="flex items-center gap-2 pl-8">
            <span className="w-5 shrink-0 text-xs text-indigo-400/70">└</span>
            <span className="truncate">{u.display_name || '—'}</span>
          </span>
        </td>
        <td className="truncate px-4 py-1 text-[12px] text-zinc-400">{u.username}</td>
        <td className="px-4 py-1">
          <Badge tone="zinc">{roleName(u.role)}</Badge>
        </td>
        <td className="px-4 py-1">
          <span className="flex flex-wrap items-center gap-1.5">
            {fullAccessRole(u.role) ? (
              <span className="text-xs text-zinc-500">全部项目</span>
            ) : (
              <>
                {((u.projects || []).length === 0) && <span className="text-xs text-zinc-600">—</span>}
                {(u.projects || []).map((p) => (
                  <span key={`sp${p.project_id}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-600/20 px-2 py-0.5 text-[10px] text-emerald-200">
                    {p.project_name || `项目 ${p.project_id}`}
                  </span>
                ))}
              </>
            )}
            <span className="rounded-full bg-indigo-600/20 px-2 py-0.5 text-[10px] text-indigo-200">归属：{u.leader_name || '—'}</span>
          </span>
        </td>
        <td className="px-4 py-1 text-right">
          {canEdit(u) ? (
            <button className="btn-soft !px-3 !py-1 text-[11px]" onClick={() => void openEdit(u)}>管理</button>
          ) : (
            <span className="text-[11px] text-zinc-600">无权修改</span>
          )}
        </td>
      </tr>
    );
  }

  async function openEdit(u: User) {
    setEf({
      display_name: u.display_name || '', username: u.username, password: '', role: u.role, brand_id: u.brand_id || 0,
      grants: u.projects?.map((p) => ({ ...p })) || [], brandGrants: u.brand_grants?.map((b) => ({ ...b })) || [],
      leader_id: Number(u.leader_id) || 0,
      perms: { ...(u.perms || {}) },
      caps: { ...(u.perm_caps || {}) },
      memberProject: (u.projects || [])[0]?.project_id || 0,
    });
    try {
      const p = await api.getUserPerms(u.id);
      setEf((s) => ({ ...s, perms: { ...p.perms }, caps: { ...p.caps } }));
    } catch { /* 忽略：无权限时用列表里的值 */ }
    if (!isPM && !isHead) {
      try {
        const g = await api.getPermissions(u.id);
        setEf((s) => ({ ...s, grants: g.grants, brandGrants: g.brand_grants }));
      } catch { /* 忽略 */ }
    }
    setEditUser(u);
  }

  /** 谁能给某个用户分配项目：超管 / 高级管理者（任意）；项目经理（自己名下成员） */
  const canManageProjectsFor = (u: User) => {
    if (fullAccessRole(u.role)) return false; // 超管/高级管理者/部门主管：默认全部项目
    if (u.role !== 'pm' && u.role !== 'kos') return false;
    if (isSuper || isSenior) return true;
    if (isPM) return Number(u.leader_id) === user.id || u.id === user.id;
    return false;
  };

  /** 「选择品牌查询项目」用：所选品牌下的项目 */
  const assignProjects = projects.filter((p) => p.brand_id === assignBrand);

  /** 项目分配（选择品牌查询项目 → 勾选项目）：给项目经理分配后与「项目」页同步 */
  function ProjectAssignPicker({
    value, onChange,
  }: {
    value: ProjectGrant[];
    onChange: (list: ProjectGrant[]) => void;
  }) {
    const list = projects.filter((p) => p.brand_id === assignBrand);
    const toggle = (p: Project) => {
      const on = value.some((g) => g.project_id === p.id);
      onChange(on
        ? value.filter((g) => g.project_id !== p.id)
        : [...value, { project_id: p.id, project_name: p.name, can_edit: true }]);
    };
    return (
      <div className="rounded-xl border border-emerald-800/40 bg-emerald-600/5 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-emerald-100">分配项目（项目经理）</span>
          <select
            className="input !w-40 !px-2 !py-1 text-xs"
            value={assignBrand}
            onChange={(e) => setAssignBrand(Number(e.target.value))}
          >
            <option value={0}>选择品牌查询项目</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <span className="text-[11px] text-zinc-500">默认不选中任何项目；选品牌后列出该品牌下所有项目，勾选即分配给该项目经理（项目页的项目经理会同步）</span>
        </div>
        {assignBrand === 0 ? (
          <div className="text-[11px] text-zinc-600">请先选择品牌查询项目</div>
        ) : list.length === 0 ? (
          <div className="text-[11px] text-zinc-600">该品牌下暂无项目</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {list.map((p) => {
              const on = value.some((g) => g.project_id === p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition ${on ? 'border-emerald-500 bg-emerald-600/25 text-emerald-100' : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600'}`}
                >{on ? '✓ ' : ''}{p.name}</button>
              );
            })}
          </div>
        )}
        {value.length > 0 && (
          <div className="mt-2 text-[11px] text-emerald-200">已选 {value.length} 个项目：{value.map((g) => g.project_name || g.project_id).join('、')}</div>
        )}
      </div>
    );
  }

  /** 模块权限中文名（勾选分配用） */
  const MODULES: { key: string; label: string }[] = [
    { key: 'products', label: '产品' },
    { key: 'projects', label: '项目' },
    { key: 'users', label: '用户' },
    { key: 'assets', label: '素材' },
    { key: 'templates', label: '模板' },
  ];
  /** 谁能给别人勾选模块权限：超管 / 高级管理者 / 项目经理与部门主管（限名下成员） */
  const canGrant = (u: User) => {
    if (user.id === u.id) return false;
    if (isSuper) return true;
    if (isSenior) return u.role !== 'super_admin';
    if (isPM || isHead) return Number(u.leader_id) === user.id;
    return false;
  };
  const showPermPicker = !!editUser && canGrant(editUser) && (isPM || isHead || isSuper || isSenior);

  /** 项目分组行（项目经理名下的项目，可折叠） */
  function groupRow(label: string, count: number, ownerId: number, pid: number, open: boolean) {
    const toggle = () => {
      const key = `${ownerId}-${pid}`;
      setCollapsedGroups((x) => (x.includes(key) ? x.filter((k) => k !== key) : [...x, key]));
    };
    return (
      <tr
        key={`grp-${ownerId}-${pid}`}
        className="cursor-pointer border-b border-zinc-800/60 bg-zinc-900/70 align-middle hover:bg-zinc-800/70"
        onClick={toggle}
        title={open ? '收起该项目下的成员' : '展开该项目下的成员'}
      >
        <td className="truncate px-4 py-1 text-[12px] text-amber-200">
          <span className="flex items-center gap-2 pl-8">
            <button
              className="grid h-5 w-5 shrink-0 place-items-center rounded border border-amber-700/60 text-[11px] text-amber-200 transition hover:border-amber-400 hover:text-white"
              onClick={(e) => { e.stopPropagation(); toggle(); }}
            >
              <span className={`inline-block transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}>▾</span>
            </button>
            📁 <span className="truncate">{label}</span>
            <span className="shrink-0 text-[10px] text-zinc-500">（{count} 名成员）</span>
          </span>
        </td>
        <td className="px-4 py-1" />
        <td className="px-4 py-1" />
        <td className="px-4 py-1" />
        <td className="px-4 py-1 text-right"><span className="text-[10px] text-zinc-600">项目分组</span></td>
      </tr>
    );
  }

  return (
    <Section
      title="用户"
      desc={T('admin.users.desc')}
      actions={msg ? <span className="text-xs text-amber-400">{msg}</span> : undefined}
    >
      {/* 搜索行：贴左（与表格首列左对齐）；右侧是「管理角色权限」「新建用户」 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input !w-64"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="按昵称 / 用户名搜索…"
        />
        <span className="text-[11px] text-zinc-500">共 {sortedUsers.length} 个用户</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isSuper && (
            <button className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-950/30 transition hover:bg-violet-500" onClick={() => setRolesOpen(true)}>管理角色权限</button>
          )}
          {canManageUsers && <button className="btn-primary" onClick={() => {
            // 默认角色：普通用户（若可创建），否则取第一个可创建角色
            const first = (roleOptions.includes('user' as Role) ? 'user' : roleOptions[0]) ?? 'user';
            setF({ ...emptyForm, role: first, brand_id: brands[0]?.id ?? 0, leader_id: (isPM || isHead) ? user.id : 0 });
            setAssignBrand(0);
            setCreateOpen(true);
          }}>新建用户</button>}
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-zinc-800">
        {/* 用固定列宽的 table 保证所有行（含平级/高级用户）列对齐 */}
        <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
          <colgroup>
            <col style={{ width: '24%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '30%' }} />
            <col style={{ width: '16%' }} />
          </colgroup>
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/80 text-left text-[11px] font-semibold text-zinc-400">
              {/* 「昵称」表头加一个与折叠按钮等宽的空位，保证与下面列里的昵称文字对齐 */}
              <th className="px-4 py-2 font-semibold">
                <span className="flex items-center gap-2"><span className="w-6 shrink-0" /><span>昵称</span></span>
              </th>
              <th className="px-4 py-2 font-semibold">用户名（手机号）</th>
              <th className="px-4 py-2 font-semibold">角色</th>
              <th className="px-4 py-2 font-semibold">管理项目</th>
              <th className="px-4 py-2 text-right font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              if (row.type === 'group') return groupRow(row.label, row.count, row.ownerId, row.pid, row.open);
              if (row.type === 'sub' || row.type === 'sub2') return subRow(row.u, row.type === 'sub2' ? row.projectName : undefined);
              const u = row.u;
              const kids = row.kids;
              const isOpen = expanded.includes(u.id);
              const toggleOpen = () => setExpanded((x) => (x.includes(u.id) ? x.filter((i) => i !== u.id) : [...x, u.id]));
              // 包含折叠的行（有成员可展开）用颜色区分；展开时颜色更明显
              const foldCls = kids
                ? (isOpen ? 'cursor-pointer bg-indigo-950/40 hover:bg-indigo-950/50' : 'cursor-pointer bg-zinc-800/60 hover:bg-zinc-800')
                : 'hover:bg-zinc-900/50';
              return (
              <tr
                key={u.id}
                className={`border-b border-zinc-800/70 align-middle last:border-0 ${foldCls}`}
                onClick={kids ? toggleOpen : undefined}
                title={kids ? (isOpen ? '点击收起下属' : `点击展开下属（${kids} 名）`) : undefined}
              >
                <td className="truncate px-4 py-1 text-zinc-100">
                  <span className="flex items-center gap-2">
                    {kids > 0 ? (
                      <button
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-zinc-600 text-[13px] text-zinc-200 transition hover:border-indigo-400 hover:bg-indigo-600/20 hover:text-white"
                        title={isOpen ? '收起下属' : `展开下属（${kids}）`}
                        data-expand={u.id}
                        onClick={(e) => { e.stopPropagation(); toggleOpen(); }}
                      >
                        {/* 下箭头：展开 ▾ / 收起 ▸ */}
                        <span className={`inline-block transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`}>▾</span>
                      </button>
                    ) : (
                      <span className="w-6 shrink-0" />
                    )}
                    <span className="truncate">{u.display_name || '—'}</span>
                    {kids > 0 && <span className="shrink-0 text-[10px] text-zinc-400">（{kids} 名成员）</span>}
                  </span>
                </td>
                <td className="truncate px-4 py-1 text-zinc-300">{u.username}</td>
                <td className="px-4 py-1">
                  <Badge tone={u.role === 'super_admin' ? 'amber' : isGlobalRole(u.role) ? 'indigo' : u.role === 'pm' ? 'emerald' : 'zinc'}>{roleName(u.role)}</Badge>
                </td>
                <td className="px-4 py-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {fullAccessRole(u.role) ? (
                      <span className="text-xs text-zinc-500">全部项目</span>
                    ) : (
                      <>
                        {((u.projects || []).length === 0) && <span className="text-xs text-zinc-600">—</span>}
                        {(u.projects || []).map((p) => (
                          <span key={p.project_id} className="inline-flex items-center gap-1 rounded-full bg-emerald-600/20 px-2 py-0.5 text-[10px] text-emerald-200">
                            {p.project_name || `项目 ${p.project_id}`}
                          </span>
                        ))}
                      </>
                    )}
                  </span>
                </td>
                <td className="px-4 py-1 text-right">
                  {canEdit(u) ? (
                    <button
                      className="btn-soft !px-3 !py-1 text-[11px]"
                      onClick={(e) => { e.stopPropagation(); void openEdit(u); }}
                    >管理</button>
                  ) : (
                    <span className="text-[11px] text-zinc-600">只能管理自己名下的成员</span>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {users.length === 0 && <div className="p-8 text-center text-sm text-zinc-600">暂无用户</div>}
      </div>

      {/* 分页：每页 20 行 */}
      {pageCount > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-zinc-500">共 {tableRows.length} 行 · 第 {curPage}/{pageCount} 页（每页 20 行）</span>
          <div className="flex items-center gap-1.5">
            <button className="btn-soft !px-2.5 !py-1 text-xs disabled:opacity-40" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>上一页</button>
            {Array.from({ length: pageCount }).slice(0, 12).map((_, i) => (
              <button key={i} onClick={() => setPage(i + 1)} className={`h-7 min-w-7 rounded px-2 text-xs transition ${curPage === i + 1 ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>{i + 1}</button>
            ))}
            {pageCount > 12 && <span className="text-xs text-zinc-500">…共 {pageCount} 页</span>}
            <button className="btn-soft !px-2.5 !py-1 text-xs disabled:opacity-40" disabled={curPage >= pageCount} onClick={() => setPage(curPage + 1)}>下一页</button>
          </div>
        </div>
      )}

      {/* 新建用户 */}
      <Modal
        open={createOpen}
        title="新建用户"
        width="xl"
        onClose={() => setCreateOpen(false)}
        footer={<ModalFooter okText="创建" onCancel={() => setCreateOpen(false)} onOk={async () => {
          if (!f.username.trim()) return flash('用户名不能为空');
          if (!isPM && !isHead && f.role === 'super_admin' && !f.password) return flash('超管账户必须单独设置密码');
          if (needsLeader(f.role) && !(isPM || isHead) && !f.leader_id) return flash(`请选择该${f.role === 'kos' ? '项目成员' : '部门成员'}归属的${f.role === 'kos' ? '项目经理' : '部门主管'}`);
          try {
            const created = await api.createUser({
              username: f.username.trim(),
              password: f.password,
              display_name: f.display_name.trim() || f.username.trim(),
              role: f.role,
              leader_id: needsLeader(f.role) ? ((isPM || isHead) ? user.id : f.leader_id) : null,
              brand_id: undefined,
              project_id: (isPM || isHead) ? f.project_id : undefined,
            });
            // 新建项目经理：把勾选的项目分配给他（与「项目」页同步）
            if (f.role === 'pm' && created?.user?.id && f.grants.length) {
              await api.putUserProjects(created.user.id, f.grants.map((g) => g.project_id));
            }
            setCreateOpen(false);
            void load();
            flash('用户已创建');
          } catch (e) { flash(e instanceof Error ? e.message : '创建失败'); }
        }} />}
      >
        <div className="grid gap-3">
          <label className="label">昵称<input className="input mt-1" value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} placeholder="如：张三" /></label>
          <label className="label">用户名（或手机号）<input className="input mt-1" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder="登录账号，如：13800000000" /></label>
          <label className="label">密码
            <input className="input mt-1" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder={f.role === 'super_admin' ? '超管必须单独设置密码' : `默认 ${DEFAULT_PASSWORD}`} />
            <span className="mt-1 block text-[11px] text-zinc-500">{f.role === 'super_admin' ? '超管账户不适用默认密码，请手动设置。' : `留空则使用默认密码 ${DEFAULT_PASSWORD}（用户可自行修改）`}</span>
          </label>
          {canManageUsers && (
            <label className="label">角色权限
              <select
                className="input mt-1"
                value={f.role}
                onChange={(e) => {
                  const r = e.target.value as Role;
                  // 除超管外，新用户默认密码 @123456
                  setF((s) => ({ ...s, role: r, password: r === 'super_admin' ? '' : (s.password || DEFAULT_PASSWORD), leader_id: needsLeader(r) ? s.leader_id : 0 }));
                }}
              >
                {roleOptions.map((r) => <option key={r} value={r}>{roleName(r)}</option>)}
              </select>
              {roleOptions.length === 1 && <span className="mt-1 block text-[11px] text-zinc-500">你只能创建「{roleName(roleOptions[0])}」，并自动归属到你自己名下。</span>}
            </label>
          )}
          {/* 项目成员 / 部门成员：必须归属到一位项目经理 / 部门主管名下 */}
          {needsLeader(f.role) && (
            isPM || isHead ? (
              <div className="rounded-xl border border-indigo-600/40 bg-indigo-500/10 p-3 text-xs text-indigo-200">
                新建的{roleName(f.role)}将自动归属到你的名下（{user.display_name || user.username}）。
              </div>
            ) : (
              <label className="label">归属{ f.role === 'kos' ? '项目经理' : '部门主管'}（必选）
                <select className="input mt-1" value={f.leader_id} onChange={(e) => setF({ ...f, leader_id: Number(e.target.value) })}>
                  <option value={0}>请选择{ f.role === 'kos' ? '项目经理' : '部门主管' }</option>
                  {leaderCandidates(f.role).map((l) => <option key={l.id} value={l.id}>{l.display_name || l.username}</option>)}
                </select>
                {leaderCandidates(f.role).length === 0 && <span className="mt-1 block text-[11px] text-amber-300">还没有「{ f.role === 'kos' ? '项目经理' : '部门主管' }」角色的用户，请先创建。</span>}
                <span className="mt-1 block text-[11px] text-zinc-500">该成员只显示在所选负责人的下方，不会出现在用户列表最外层。</span>
              </label>
            )
          )}
          {/* 超管 / 高级管理者 / 部门主管：默认拥有全部品牌与全部项目，无需选择所属品牌 */}
          {fullAccessRole(f.role) && (
            <div className="rounded-xl border border-amber-600/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              {roleName(f.role)}默认拥有全部品牌与全部项目，无需选择所属品牌，也无需单独分配项目。
            </div>
          )}
          {/* 项目经理：不需要所属品牌；用「选择品牌查询项目」把项目分配给他（与项目页同步） */}
          {f.role === 'pm' && (
            <ProjectAssignPicker value={f.grants} onChange={(grants) => setF({ ...f, grants })} />
          )}
          {f.role === 'dept_member' && (
            <div className="rounded-xl border border-amber-600/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              部门成员默认拥有全部品牌与全部项目（只有查看权限），无需分配品牌或项目；也不与项目挂钩。
            </div>
          )}
          {f.role === 'kos' && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400">
              项目成员默认没有后台任何模块权限；创建后可在该行「管理」里勾选分配模块权限、指定归属项目。
            </div>
          )}
        </div>
      </Modal>

      {/* 管理用户：把原来的「重置密码 / 修改 / 删除」都收进这个弹框（删除在左下角） */}
      <Modal
        open={editUser !== null}
        width="lg"
        title={`管理用户：${editUser?.display_name || editUser?.username || ''}`}
        onClose={() => setEditUser(null)}
        footer={
          <>
            {/* 任何用户都不能删除自己；删除前二次确认 */}
            {editUser && editUser.id !== user.id ? (
              <button
                className="mr-auto rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
                onClick={() => setDelOpen(editUser)}
              >删除该用户</button>
            ) : (
              <span className="mr-auto text-[11px] text-zinc-500">不能删除自己</span>
            )}
            <ModalFooter onCancel={() => setEditUser(null)} onOk={async () => {
          if (!editUser) return;
          try {
            const body: Record<string, unknown> = { display_name: ef.display_name };
            if (ef.username.trim()) body.username = ef.username.trim();
            if (ef.password) body.password = ef.password;
            if (canManageUsers) body.role = ef.role;
            if (isSuper || isSenior) {
              body.brand_id = ef.brand_id || null;
              if (needsLeader(ef.role)) body.leader_id = ef.leader_id || null;
            }
            await api.updateUser(editUser.id, body);
            // 模块权限（勾选分配，服务端按角色上限截断）
            if (showPermPicker) await api.putUserPerms(editUser.id, ef.perms);
            // 项目经理：分配的项目（写入项目成员 + 同步项目页的项目经理）
            if (ef.role === 'pm' && (isSuper || isSenior)) {
              await api.putUserProjects(editUser.id, ef.grants.map((g) => g.project_id));
            }
            // 项目成员的归属项目由超管在「项目」页统一维护，项目经理不再在此指定
            if (isSuper || isSenior) {
              await api.putPermissions(editUser.id, {
                project_grants: ef.grants.map((g) => ({ project_id: g.project_id, can_edit: g.can_edit })),
                brand_grants: ef.brandGrants.map((b) => ({ brand_id: b.brand_id, can_edit: b.can_edit })),
              });
            }
            setEditUser(null);
            void load();
            flash('已保存');
          } catch (e) { flash(e instanceof Error ? e.message : '保存失败'); }
        }} />
          </>
        }
      >
        <div className="grid gap-3">
          <label className="label">昵称<input className="input mt-1" value={ef.display_name} onChange={(e) => setEf({ ...ef, display_name: e.target.value })} /></label>
          <label className="label">用户名（账户）<input className="input mt-1" value={ef.username} onChange={(e) => setEf({ ...ef, username: e.target.value })} /></label>
          <label className="label">重置密码（留空则不改密码）<input className="input mt-1" value={ef.password} onChange={(e) => setEf({ ...ef, password: e.target.value })} placeholder="至少 6 位" /></label>
          {canManageUsers && (
            <label className="label">角色
              <select
                className="input mt-1"
                value={ef.role}
                disabled={!!editUser && editUser.id === user.id && (isPM || isHead)}
                onChange={(e) => setEf({ ...ef, role: e.target.value as Role })}
              >
                {[...new Set([ef.role, ...roleOptions])].map((r) => <option key={r} value={r}>{roleName(r)}</option>)}
              </select>
              {!!editUser && editUser.id === user.id && (isPM || isHead) && (
                <span className="mt-1 block text-[11px] text-zinc-500">项目经理 / 部门主管不能修改自己的角色。</span>
              )}
            </label>
          )}
          {/* 归属负责人：超管 / 高级管理者可调整 */}
          {(isSuper || isSenior) && needsLeader(ef.role) && (
            <label className="label">归属{ ef.role === 'kos' ? '项目经理' : '部门主管'}
              <select className="input mt-1" value={ef.leader_id} onChange={(e) => setEf({ ...ef, leader_id: Number(e.target.value) })}>
                <option value={0}>未指定</option>
                {leaderCandidates(ef.role).map((l) => <option key={l.id} value={l.id}>{l.display_name || l.username}</option>)}
              </select>
            </label>
          )}
          {/* 项目经理：用「选择品牌查询项目」分配项目（保存后与「项目」页的项目经理同步） */}
          {editUser && ef.role === 'pm' && (isSuper || isSenior) && (
            <ProjectAssignPicker value={ef.grants} onChange={(grants) => setEf({ ...ef, grants })} />
          )}
          {fullAccessRole(ef.role) && (
            <div className="rounded-xl border border-amber-600/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              {roleName(ef.role)}默认拥有全部品牌与全部项目，无需分配品牌或项目。
            </div>
          )}

          {/* 模块权限：项目经理 / 部门主管给名下成员勾选分配（上限 = 该角色权限） */}
          {editUser && showPermPicker && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="mb-2 text-xs font-semibold text-zinc-200">
                模块权限（最多与「{roleName(ef.role)}」角色权限一致）
              </div>
              <div className="grid gap-2 md:grid-cols-5">
                {MODULES.map((m) => {
                  const cap = ef.caps[m.key] || 'none';
                  const cur = ef.perms[m.key] || 'none';
                  const capRank = cap === 'edit' ? 2 : cap === 'view' ? 1 : 0;
                  return (
                    <div key={m.key} className={`rounded-lg border border-zinc-800 bg-zinc-900/60 p-2 ${capRank === 0 ? 'opacity-40' : ''}`}>
                      <div className="mb-1.5 text-[11px] text-zinc-300">{m.label}<span className="ml-1 text-[10px] text-zinc-500">上限：{cap === 'edit' ? '修改' : cap === 'view' ? '查看' : '无'}</span></div>
                      <div className="flex flex-wrap gap-1.5">
                        <label className="inline-flex items-center gap-1 text-[11px] text-zinc-300">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-indigo-500"
                            disabled={capRank < 1}
                            checked={cur === 'view' || cur === 'edit'}
                            onChange={() => setEf((s) => ({ ...s, perms: { ...s.perms, [m.key]: (s.perms[m.key] === 'view' || s.perms[m.key] === 'edit') ? 'none' : 'view' } }))}
                          />
                          查看
                        </label>
                        <label className="inline-flex items-center gap-1 text-[11px] text-emerald-200">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-emerald-500"
                            disabled={capRank < 2}
                            checked={cur === 'edit'}
                            onChange={() => setEf((s) => ({ ...s, perms: { ...s.perms, [m.key]: s.perms[m.key] === 'edit' ? 'none' : 'edit' } }))}
                          />
                          修改
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 项目成员的归属项目不在本弹框维护：成员只能查看自己项目的素材与通用素材 */}
        </div>
      </Modal>

      {/* 重置密码 */}
      <Modal
        open={pwdUser !== null}
        title={`重置密码：${pwdUser?.display_name || pwdUser?.username || ''}`}
        onClose={() => setPwdUser(null)}
        footer={<ModalFooter okText="重置" onCancel={() => setPwdUser(null)} onOk={async () => {
          if (!pwdUser) return;
          if (pwd.length < 6) return flash('密码至少 6 位');
          try {
            await api.updateUser(pwdUser.id, { password: pwd });
            setPwdUser(null);
        flash('密码已重置');
          } catch (e) { flash(e instanceof Error ? e.message : '重置失败'); }
        }} />}
      >
        <label className="label">新密码<input className="input mt-1" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="至少 6 位" /></label>
      </Modal>

      <ConfirmModal open={delOpen !== null} title="删除用户" desc="删除后该账号无法登录，其上传的素材与模板会保留。" onCancel={() => setDelOpen(null)} onConfirm={async () => { if (delOpen) { await api.deleteUser(delOpen.id); setDelOpen(null); setEditUser(null); void load(); } }} />

      {/* 管理角色权限（仅超管） */}
      {isSuper && (
        <RolesManager
          open={rolesOpen}
          roles={roles}
          onClose={() => setRolesOpen(false)}
          onChanged={load}
        />
      )}
    </Section>
  );
}

/** 角色权限管理：勾选形式给每个角色配置 查看 / 修改；也可新建角色（仅超管可用） */
const ROLE_MODULES: { key: string; label: string }[] = [
  { key: 'products', label: '产品（品牌/类别/型号）' },
  { key: 'projects', label: '项目' },
  { key: 'users', label: '用户' },
  { key: 'assets', label: '素材' },
  { key: 'templates', label: '模板' },
];

function RolesManager({
  open, roles, onClose, onChanged,
}: {
  open: boolean;
  roles: RoleDef[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<number, Record<string, string>>>({});
  const [newName, setNewName] = useState('');
  const [newLevel, setNewLevel] = useState(3);
  const [newPerms, setNewPerms] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const d: Record<number, Record<string, string>> = {};
    for (const r of roles) {
      d[r.id] = Object.fromEntries(ROLE_MODULES.map((m) => [m.key, r.perms?.[m.key] || 'none']));
    }
    setDraft(d);
    setNewName('');
    setNewLevel(3);
    setNewPerms(Object.fromEntries(ROLE_MODULES.map((m) => [m.key, 'none'])));
    setMsg('');
  }, [open, roles]);

  function flash(t: string) { setMsg(t); window.setTimeout(() => setMsg(''), 2600); }

  /** 勾选：查看 / 修改（互斥，勾「修改」自动含查看） */
  function setPerm(roleId: number, mod: string, value: string) {
    setDraft((d) => {
      const cur = { ...(d[roleId] || {}) };
      cur[mod] = cur[mod] === value ? 'none' : value;
      // 「修改」包含「查看」：取消查看时同时取消修改
      if (mod && cur[mod] === 'none' && value === 'view') cur[mod] = 'none';
      return { ...d, [roleId]: cur };
    });
  }

  return (
    <Modal
      open={open}
      width="xl"
      title="管理角色权限"
      onClose={onClose}
      footer={<button className="btn-soft" onClick={onClose}>关闭</button>}
    >
      <div className="grid gap-5">
        <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[11px] text-zinc-500">
          勾选「查看」表示该角色可以看到对应模块；勾选「修改」表示可以增删改（含查看）。内置角色可以调整权限但不能改名 / 删除。
        </p>

        {msg && <div className="text-xs text-amber-400">{msg}</div>}

        <div className="space-y-2.5">
          {roles.map((r) => (
            <div key={r.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-zinc-100">{r.name}</span>
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">{r.builtin ? '内置角色' : '自定义角色'}</span>
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">{r.level === 1 ? '1 级（最高）' : r.level === 2 ? '2 级（管理者）' : '3 级（普通）'}</span>
                <span className="ml-auto flex items-center gap-2">
                  <button
                    className="rounded-lg bg-indigo-600 px-3 py-1 text-[11px] font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api.updateRole(r.id, { perms: draft[r.id] || {} });
                        await onChanged();
                        flash(`「${r.name}」权限已保存`);
                      } catch (e) { flash(e instanceof Error ? e.message : '保存失败'); }
                      finally { setBusy(false); }
                    }}
                  >保存权限</button>
                  {!r.builtin && (
                    <button
                      className="rounded-lg bg-red-600 px-3 py-1 text-[11px] font-medium text-white transition hover:bg-red-500 disabled:opacity-40"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api.deleteRole(r.id);
                          await onChanged();
                          flash('角色已删除');
                        } catch (e) { flash(e instanceof Error ? e.message : '删除失败'); }
                        finally { setBusy(false); }
                      }}
                    >删除角色</button>
                  )}
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-5">
                {ROLE_MODULES.map((m) => {
                  const cur = (draft[r.id] || {})[m.key] || 'none';
                  return (
                    <div key={m.key} className="rounded-xl border border-zinc-800 bg-zinc-950 p-2">
                      <div className="mb-1.5 truncate text-[11px] text-zinc-300" title={m.label}>{m.label}</div>
                      <div className="flex flex-wrap gap-1.5">
                        <label className="inline-flex items-center gap-1 text-[11px] text-zinc-300">
                          <input type="checkbox" className="h-3.5 w-3.5 accent-indigo-500" checked={cur === 'view' || cur === 'edit'} onChange={() => setPerm(r.id, m.key, 'view')} />
                          查看
                        </label>
                        <label className="inline-flex items-center gap-1 text-[11px] text-emerald-200">
                          <input type="checkbox" className="h-3.5 w-3.5 accent-emerald-500" checked={cur === 'edit'} onChange={() => setPerm(r.id, m.key, 'edit')} />
                          修改
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* 新建角色 */}
        <div className="rounded-2xl border border-violet-700/50 bg-violet-600/10 p-3">
          <div className="mb-2 text-sm font-semibold text-violet-100">新建角色</div>
          <div className="grid gap-3 md:grid-cols-[1fr_160px]">
            <label className="label">角色名称<input className="input mt-1" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="如：运营 / 设计助理" /></label>
            <label className="label">层级
              <select className="input mt-1" value={newLevel} onChange={(e) => setNewLevel(Number(e.target.value))}>
                <option value={2}>2 级（管理者）</option>
                <option value={3}>3 级（普通）</option>
              </select>
            </label>
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-5">
            {ROLE_MODULES.map((m) => {
              const cur = newPerms[m.key] || 'none';
              return (
                <div key={m.key} className="rounded-xl border border-zinc-800 bg-zinc-950 p-2">
                  <div className="mb-1.5 truncate text-[11px] text-zinc-300" title={m.label}>{m.label}</div>
                  <div className="flex flex-wrap gap-1.5">
                    <label className="inline-flex items-center gap-1 text-[11px] text-zinc-300">
                      <input type="checkbox" className="h-3.5 w-3.5 accent-indigo-500" checked={cur === 'view' || cur === 'edit'} onChange={() => setNewPerms((p) => ({ ...p, [m.key]: p[m.key] === 'view' ? 'none' : 'view' }))} />
                      查看
                    </label>
                    <label className="inline-flex items-center gap-1 text-[11px] text-emerald-200">
                      <input type="checkbox" className="h-3.5 w-3.5 accent-emerald-500" checked={cur === 'edit'} onChange={() => setNewPerms((p) => ({ ...p, [m.key]: p[m.key] === 'edit' ? 'none' : 'edit' }))} />
                      修改
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
          <button
            className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-40"
            disabled={busy || !newName.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await api.createRole({ name: newName.trim(), level: newLevel, perms: newPerms });
                await onChanged();
                setNewName('');
                setNewPerms(Object.fromEntries(ROLE_MODULES.map((m) => [m.key, 'none'])));
                flash('角色已创建');
              } catch (e) { flash(e instanceof Error ? e.message : '创建失败'); }
              finally { setBusy(false); }
            }}
          >新建角色</button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * 权限分配：
 * - 先选品牌（或「全部品牌」）→ 列出该品牌下的项目 → 勾选项目并设置「查看 / 修改」
 * - 也支持「整个品牌」授权（该品牌下全部项目，含以后新增）
 * - 可一键授予全部品牌下的所有项目（适合普通管理员）
 */
function ProjectPermPicker({
  brands, cats, projects, value, brandValue, onChange,
}: {
  brands: Brand[];
  cats: Category[];
  projects: Project[];
  value: ProjectGrant[];
  brandValue: BrandGrant[];
  onChange: (projectGrants: ProjectGrant[], brandGrants: BrandGrant[]) => void;
}) {
  const [brand, setBrand] = useState(0);
  const [cat, setCat] = useState(0);

  const catList = cats.filter((c) => !brand || c.brand_id === brand);
  const projList = projects.filter((p) => (!brand || p.brand_id === brand) && (!cat || p.category_id === cat));
  const grantedIds = new Set(value.map((g) => g.project_id));
  const brandGrant = brand ? brandValue.find((b) => b.brand_id === brand) : undefined;

  function setProject(pid: number, on: boolean, canEdit = false) {
    if (on) {
      if (grantedIds.has(pid)) return;
      const p = projects.find((x) => x.id === pid);
      onChange([...value, { project_id: pid, project_name: p?.name || '', can_edit: canEdit }], brandValue);
    } else {
      onChange(value.filter((g) => g.project_id !== pid), brandValue);
    }
  }
  function setProjectEdit(pid: number, canEdit: boolean) {
    onChange(value.map((g) => (g.project_id === pid ? { ...g, can_edit: canEdit } : g)), brandValue);
  }
  function setBrandPerm(bid: number, canEdit: boolean | null) {
    if (canEdit === null) onChange(value, brandValue.filter((b) => b.brand_id !== bid));
    else {
      const b = brands.find((x) => x.id === bid);
      const rest = brandValue.filter((x) => x.brand_id !== bid);
      onChange(value, [...rest, { brand_id: bid, brand_name: b?.name || '', can_edit: canEdit }]);
    }
  }

  const totalGrants = value.length + brandValue.length;

  return (
    <div>
      <span className="label">权限分配（按品牌查询品牌下的项目，再勾选项目权限）</span>

        {/* 筛选 + 批量操作 */}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <select className="input !w-32" value={brand} onChange={(e) => { setBrand(Number(e.target.value)); setCat(0); }}>
          <option value={0}>全部品牌</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="input !w-32" value={cat} onChange={(e) => setCat(Number(e.target.value))}>
          <option value={0}>全部产品</option>
          {catList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button
          type="button"
          className="btn-soft !px-2.5 !py-1.5 text-xs"
          onClick={() => {
            // 勾选当前筛选下的所有项目（查看权限）
            const add = projList.filter((p) => !grantedIds.has(p.id)).map((p) => ({ project_id: p.id, project_name: p.name, can_edit: false }));
            onChange([...value, ...add], brandValue);
          }}
        >
          勾选当前筛选全部
        </button>
        <button
          type="button"
          className="btn-soft !px-2.5 !py-1.5 text-xs"
          onClick={() => onChange([], brandValue)}
        >
          清空已勾选
        </button>
        <button
          type="button"
          className="btn-primary !px-2.5 !py-1.5 text-xs"
          onClick={() => {
            // 一键授予全部品牌下的所有项目（修改权限）
            onChange(projects.map((p) => ({ project_id: p.id, project_name: p.name, can_edit: true })), brandValue);
          }}
        >
          一键授予全部品牌项目
        </button>
      </div>

      {/* 整个品牌授权 */}
      {brand !== 0 && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-600/40 bg-amber-500/10 px-2.5 py-2">
          <span className="text-xs text-amber-200">
              整个品牌授权：{brands.find((b) => b.id === brand)?.name} 下的全部项目（含以后新增）
            </span>
          <span className="flex items-center gap-1.5">
            <button type="button" onClick={() => setBrandPerm(brand, false)}
              className={`rounded px-2 py-0.5 text-[11px] transition ${brandGrant && !brandGrant.can_edit ? 'bg-zinc-700 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}>查看</button>
            <button type="button" onClick={() => setBrandPerm(brand, true)}
              className={`rounded px-2 py-0.5 text-[11px] transition ${brandGrant?.can_edit ? 'bg-emerald-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}>修改</button>
            {brandGrant && <button type="button" className="text-red-400 hover:text-red-300" onClick={() => setBrandPerm(brand, null)}>×</button>}
          </span>
        </div>
      )}

        {/* 项目勾选列表 */}
      <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-2">
        {projList.length === 0 && <div className="py-4 text-center text-xs text-zinc-600">该品牌下暂无项目</div>}
        {projList.map((p) => {
          const g = value.find((x) => x.project_id === p.id);
          const checked = !!g;
          return (
            <div key={p.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 ${checked ? 'border-indigo-500/60 bg-indigo-600/10' : 'border-zinc-800'}`}>
              <label className="flex min-w-0 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-indigo-500"
                  checked={checked}
                  onChange={(e) => setProject(p.id, e.target.checked, false)}
                />
                <span className="min-w-0 truncate text-xs text-zinc-200">
                  {p.brand_name && <span className="text-zinc-500">{p.brand_name} · </span>}
                  {p.category_name && <span className="text-zinc-500">{p.category_name} · </span>}
                  {p.name}
                </span>
              </label>
              {checked && (
                <span className="flex shrink-0 items-center gap-1.5">
                  <button type="button" onClick={() => setProjectEdit(p.id, false)}
                    className={`rounded px-2 py-0.5 text-[11px] transition ${!g!.can_edit ? 'bg-zinc-700 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}>查看</button>
                  <button type="button" onClick={() => setProjectEdit(p.id, true)}
                    className={`rounded px-2 py-0.5 text-[11px] transition ${g!.can_edit ? 'bg-emerald-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}>修改</button>
                </span>
              )}
            </div>
          );
        })}
      </div>

        {/* 已授权汇总 */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {totalGrants === 0 && <span className="text-xs text-zinc-600">尚未分配任何权限</span>}
        {brandValue.map((g) => (
          <span key={`b${g.brand_id}`} className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-1 text-xs text-amber-200">
            {g.brand_name || `品牌 ${g.brand_id}`}（全部项目）· {g.can_edit ? '修改' : '查看'}
            <button type="button" className="text-amber-300 hover:text-white" onClick={() => setBrandPerm(g.brand_id, null)}>×</button>
          </span>
        ))}
        {value.map((g) => (
          <span key={`p${g.project_id}`} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${g.can_edit ? 'bg-emerald-600/20 text-emerald-200' : 'bg-zinc-800 text-zinc-300'}`}>
            {g.project_name || `项目 ${g.project_id}`} · {g.can_edit ? '修改' : '查看'}
            <button type="button" className="hover:text-white" onClick={() => setProject(g.project_id, false)}>×</button>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ==================== 4. 素材 ==================== */
const ASSET_TYPE_LABEL: Record<string, string> = { scene: '底图', product: '产品图', sticker: '贴纸' };
const assetTypeName = (code: string) => ASSET_TYPE_LABEL[code] || code;

/** 2 级品牌不需要型号 */
const matchLevelHint = (level: number) => (level === 2 ? '' : ' → 型号');

/**
 * 回收站（仅超管）：素材 / 模板删除后进回收站，36 小时后连文件一起自动清理。
 * 可单个恢复或彻底删除。
 */
function TrashModal({ open, onClose, flash }: { open: boolean; onClose: () => void; flash: (t: string) => void }) {
  const [data, setData] = useState<{ keep_hours: number; assets: TrashItem[]; templates: TrashItem[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setData(await api.listTrash()); } catch { setData(null); }
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const group = (label: string, items: TrashItem[]) => (
    <div>
      <div className="mb-2 text-sm font-semibold text-zinc-200">{label}（{items.length}）</div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 p-3 text-center text-xs text-zinc-600">回收站为空</div>
      ) : (
        <div className="grid grid-cols-4 gap-2 md:grid-cols-6">
          {items.map((it) => (
            <div key={`${it.kind}-${it.id}`} className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
              <img src={apiUrl(it.url)} alt="" className="aspect-square w-full object-cover" />
              <div className="px-1.5 py-1 text-[10px] text-zinc-400">
                <div className="truncate">{it.project_name ? `${it.project_name} 专属` : '通用'}</div>
                <div className="truncate text-zinc-500">{it.deleted_at}</div>
              </div>
              <div className="flex gap-1 px-1.5 pb-1.5">
                <button className="btn-soft !px-2 !py-0.5 text-[10px]" onClick={async () => {
                  setBusy(true);
                  try { await api.restoreTrash(it.kind, it.id); flash('已恢复'); await load(); }
                  catch (e) { flash(e instanceof Error ? e.message : '恢复失败'); }
                  finally { setBusy(false); }
                }}>恢复</button>
                <button className="btn-danger !px-2 !py-0.5 text-[10px]" onClick={async () => {
                  setBusy(true);
                  try { await api.purgeTrash(it.kind, it.id); flash('已彻底删除'); await load(); }
                  catch (e) { flash(e instanceof Error ? e.message : '删除失败'); }
                  finally { setBusy(false); }
                }}>彻底删除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Modal open={open} title="回收站" width="xl" onClose={onClose} footer={<button className="btn-soft" onClick={onClose}>关闭</button>}>
      <div className="grid gap-5">
        <p className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-[11px] text-zinc-400">
          删除的素材 / 模板会先放到这里，{data?.keep_hours ?? 36} 小时后连同文件一起自动清理；只有超管可以查看、恢复或彻底删除。
        </p>
        {group('已删除素材', data?.assets || [])}
        {group('已删除模板', data?.templates || [])}
        {busy && <div className="text-[11px] text-zinc-500">处理中…</div>}
      </div>
    </Modal>
  );
}

/** 素材标签管理（可增删改）：产品类标签 / 贴图类标签 分开管理（标题随大类改名同步） */
function AssetTagsManager({ tags, onChanged, flash }: { tags: AssetTag[]; onChanged: () => void | Promise<void>; flash: (t: string) => void }) {
  const T = useUiTexts();
  const [names, setNames] = useState<Record<string, string>>({ product: '', sticker: '' });
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editKind, setEditKind] = useState<'product' | 'sticker'>('product');

  const cols: { kind: 'product' | 'sticker'; label: string; hint: string }[] = [
    { kind: 'product', label: `${T('asset.kind.product')}标签`, hint: '如：外观 / 内饰 / 产品png（可新建）' },
    { kind: 'sticker', label: `${T('asset.kind.sticker')}标签`, hint: '如：箭头 / 表情（可新建）' },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {cols.map((c) => {
        const list = tags.filter((t) => (t.kind || '') === c.kind);
        return (
          <div key={c.kind} className="grid content-start gap-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <div className="mb-2 text-xs font-semibold text-zinc-200">{c.label}</div>
              <div className="flex flex-wrap items-end gap-2">
                <input
                  className="input !w-44"
                  value={names[c.kind]}
                  onChange={(e) => setNames((n) => ({ ...n, [c.kind]: e.target.value }))}
                  placeholder={c.hint}
                />
                <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={async () => {
                  const v = (names[c.kind] || '').trim();
                  if (!v) return flash('标签名不能为空');
                  try {
                    await api.createAssetTag(v, c.kind);
                    setNames((n) => ({ ...n, [c.kind]: '' }));
                    await onChanged();
                    flash('标签已新建');
                  } catch (e) { flash(e instanceof Error ? e.message : '新建失败'); }
                }}>新建</button>
              </div>
            </div>
            <div className="space-y-1.5">
              {list.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                  {editId === t.id ? (
                    <>
                      <input className="input !w-44" value={editName} onChange={(e) => setEditName(e.target.value)} />
                      <span className="flex items-center gap-1.5">
                        <button className="btn-primary !px-2.5 !py-1 text-[11px]" onClick={async () => {
                          try { await api.updateAssetTag(t.id, editName.trim(), editKind); setEditId(null); await onChanged(); flash('标签已修改'); }
                          catch (e) { flash(e instanceof Error ? e.message : '修改失败'); }
                        }}>保存</button>
                        <button className="btn-soft !px-2.5 !py-1 text-[11px]" onClick={() => setEditId(null)}>取消</button>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="flex items-center gap-2 text-sm text-zinc-200">
                        {t.name}
                        <span className="text-[11px] text-zinc-500">{t.asset_count ?? 0} 个素材</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <button className="btn-soft !px-2.5 !py-1 text-[11px]" onClick={() => { setEditId(t.id); setEditName(t.name); setEditKind(c.kind); }}>修改</button>
                        <button className="btn-danger !px-2.5 !py-1 text-[11px]" onClick={async () => {
                          try { await api.deleteAssetTag(t.id); await onChanged(); flash('标签已删除'); }
                          catch (e) { flash(e instanceof Error ? e.message : '删除失败'); }
                        }}>删除</button>
                      </span>
                    </>
                  )}
                </div>
              ))}
              {list.length === 0 && <Empty text={`暂无${c.label}`} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AssetsTab({ canEdit = true }: { canEdit?: boolean }) {
  const T = useUiTexts();
  const user = useAuth((s) => s.user);
  const isSuper = user?.role === 'super_admin';
  const [assets, setAssets] = useState<Asset[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [productTags, setProductTags] = useState<AssetTag[]>([]);
  const [stickerTags, setStickerTags] = useState<AssetTag[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  // 大类：产品类（品牌-产品-型号-标签） / 贴图类（标签），只能二选一，默认产品类
  const [kind, setKind] = useState<AssetKind>('product');
  const [tagId, setTagId] = useState(0);
  const [projectId, setProjectId] = useState(0);
  const [trashOpen, setTrashOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  // 大类名称（可改，前端同步）
  const [kindNames, setKindNames] = useState<{ product: string; sticker: string }>({
    product: T('asset.kind.product'), sticker: T('asset.kind.sticker'),
  });
  const [filter, setFilter] = useState({ brand: 0, cat: 0, model: 0 });
  const [upOpen, setUpOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [delAsset, setDelAsset] = useState<Asset | null>(null);
  const [msg, setMsg] = useState('');
  // 分页（一页 8×5 = 40）、批量选择
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<number[]>([]);
  const [batchEdit, setBatchEdit] = useState(false);
  const [batchDel, setBatchDel] = useState(false);
  const PER_PAGE = 40;

  const load = useCallback(async () => {
    // 部门主管 / 部门成员可浏览全部品牌与项目（只读）
    const browseAll = canBrowseAllProjects(user?.role);
    const [a, b, c, m, tp, ts, pj] = await Promise.all([
      api.listAssets(), api.listBrands(browseAll), api.listCategories(undefined, browseAll), api.listModels({ all: browseAll }),
      api.listAssetTags('product'), api.listAssetTags('sticker'), api.listProjects(undefined, undefined, undefined, browseAll),
    ]);
    setAssets(a.assets); setBrands(b.brands); setCats(c.categories); setModels(m.models);
    setProductTags(tp.tags); setStickerTags(ts.tags); setProjects(pj.projects);
  }, [user?.role]);
  useEffect(() => { void load(); }, [load]);
  function flash(t: string) { setMsg(t); window.setTimeout(() => setMsg(''), 2500); }

  const filtered = useMemo(() => {
    // 产品类 = 产品图；贴图类 = 其余素材（大类之下不再分素材类型）
    let list = kind === 'product' ? assets.filter((a) => a.type === 'product') : assets.filter((a) => a.type !== 'product');
    if (kind === 'product') {
      if (filter.brand) list = list.filter((a) => a.brand_id === filter.brand);
      if (filter.cat) list = list.filter((a) => a.category_id === filter.cat);
      if (filter.model) list = list.filter((a) => a.model_id === filter.model);
    }
    if (tagId) list = list.filter((a) => (a.tags || []).some((t) => t.id === tagId));
    // 右侧「XXX项目专属」勾选框：只看该项目专属素材
    if (kind === 'product' && projectId) list = list.filter((a) => a.project_id === projectId);
    return list;
  }, [assets, kind, filter, tagId, projectId]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const curPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);
  useEffect(() => { setPage(1); }, [kind, tagId, projectId, filter.brand, filter.cat, filter.model]);
  useEffect(() => { setTagId(0); }, [kind]);

  const allPicked = pageItems.length > 0 && pageItems.every((a) => picked.includes(a.id));
  const togglePick = (id: number) => setPicked((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]));
  const toggleAll = () => setPicked(allPicked ? picked.filter((id) => !pageItems.some((a) => a.id === id)) : [...new Set([...picked, ...pageItems.map((a) => a.id)])]);

  return (
<Section
      title="素材"
      desc={`先选大类（${T('asset.kind.product')} / ${T('asset.kind.sticker')}，只能二选一）：${T('asset.kind.product')}按 品牌 → 产品 → 型号 → 标签 筛选，${T('asset.kind.sticker')}按 标签 筛选。点击素材即可修改。`}
      actions={<>
        {msg && <span className="text-xs text-amber-400">{msg}</span>}
        {canEdit && (
          <>
            {isSuper && <button className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-600" onClick={() => setTrashOpen(true)}>回收站</button>}
            <button className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-amber-950/30 transition hover:bg-amber-500" onClick={() => setTagsOpen(true)}>管理素材标签</button>
            <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-950/30 transition hover:bg-indigo-500" onClick={() => setUpOpen(true)}>上传素材</button>
          </>
        )}
      </>}
    >
      {/* 大类筛选：产品类（品牌 → 产品 → 型号 → 标签 + 右侧项目专属勾选） / 贴图类（标签） */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <AssetKindBar
          kind={kind} onKindChange={(k) => { setKind(k); setProjectId(0); }}
          brands={brands} cats={cats} models={models}
          productTags={productTags} stickerTags={stickerTags}
          brand={filter.brand} cat={filter.cat} model={filter.model} tagId={tagId}
          onBrand={(v) => setFilter({ brand: v, cat: 0, model: 0 })}
          onCat={(v) => setFilter({ ...filter, cat: v, model: 0 })}
          onModel={(v) => setFilter({ ...filter, model: v })}
          onTag={setTagId}
          projects={projects}
          projectId={projectId}
          onProject={setProjectId}
          compact
        />
        <span className="text-[11px] text-zinc-500">共 {filtered.length} 个 · 第 {curPage}/{pageCount} 页</span>
      </div>

      {/* 素材网格：3:4 统一尺寸 */}
      <div className="grid grid-cols-4 gap-3 md:grid-cols-6 lg:grid-cols-8">
        {pageItems.map((a) => {
          const on = picked.includes(a.id);
          return (
            <div
              key={a.id}
              className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-zinc-900 transition ${on ? 'border-indigo-500 ring-2 ring-indigo-500/40' : 'border-zinc-800 hover:border-zinc-600'}`}
              onClick={() => setEditAsset(a)}
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden bg-zinc-950">
                <img src={apiUrl(a.url)} alt="" className="h-full w-full object-cover" />
                <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-zinc-300">
                  {a.project_id ? `专属 · ${a.project_name || ''}` : '通用'}
                </span>
                {(a.product_name || a.model_name || a.category_name) && (
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-emerald-600/85 px-1.5 py-0.5 text-[10px] text-white">
                    {a.product_name || a.model_name || a.category_name}
                  </span>
                )}
                {canEdit && (
                  <label
                    className="absolute bottom-1.5 left-1.5 grid h-5 w-5 cursor-pointer place-items-center rounded-none bg-black/70"
                    onClick={(e) => e.stopPropagation()}
                    title="选择该素材"
                  >
                    <input type="checkbox" className="h-3.5 w-3.5 accent-indigo-500" checked={on} onChange={() => togglePick(a.id)} />
                  </label>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1 p-1.5">
                <span className="rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-400">{T(`asset.kind.${a.type === 'product' ? 'product' : 'sticker'}`)}</span>
                {(a.tags || []).map((t) => <span key={t.id} className="rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-indigo-300">{t.name}</span>)}
              </div>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && <Empty text="当前筛选下暂无素材" />}

      {/* 分页 + 批量操作 */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <label className="flex items-center gap-1.5 text-xs text-zinc-300">
              <input type="checkbox" className="h-4 w-4 accent-indigo-500" checked={allPicked} onChange={toggleAll} />
              全选（本页 {pageItems.length} 个{allPicked ? ' · 可单独取消' : ''}）
            </label>
          )}
          {canEdit && (
            <>
              <span className="text-[11px] text-zinc-500">已选 {picked.length} 个</span>
              <button className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-500 disabled:opacity-40" disabled={!picked.length} onClick={() => setBatchEdit(true)}>批量修改</button>
              <button className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-500 disabled:opacity-40" disabled={!picked.length} onClick={() => setBatchDel(true)}>批量删除</button>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button className="btn-soft !px-2.5 !py-1 text-xs disabled:opacity-40" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>上一页</button>
          {Array.from({ length: pageCount }).slice(0, 12).map((_, i) => (
            <button key={i} onClick={() => setPage(i + 1)} className={`h-7 min-w-7 rounded px-2 text-xs transition ${curPage === i + 1 ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>{i + 1}</button>
          ))}
          {pageCount > 12 && <span className="text-xs text-zinc-500">…共 {pageCount} 页</span>}
          <button className="btn-soft !px-2.5 !py-1 text-xs disabled:opacity-40" disabled={curPage >= pageCount} onClick={() => setPage(curPage + 1)}>下一页</button>
        </div>
      </div>

      <TrashModal open={trashOpen} onClose={() => setTrashOpen(false)} flash={flash} />

      <Modal open={tagsOpen} title="管理素材标签" width="xl" onClose={() => setTagsOpen(false)} footer={<button className="btn-soft" onClick={() => setTagsOpen(false)}>关闭</button>}>
        <div className="grid gap-5">
          {/* 大类名称（前端画布同步）：修改后前后端都用新名字 */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
            <div className="mb-2 text-sm font-semibold text-zinc-200">大类名称（前端画布同步）</div>
            <div className="flex flex-wrap items-end gap-3">
              {(['product', 'sticker'] as AssetKind[]).map((k) => (
                <label key={k} className="label !mb-0">
                  <input
                    className="input mt-1 !w-40"
                    value={kindNames[k]}
                    disabled={!isSuper}
                    onChange={(e) => setKindNames((s) => ({ ...s, [k]: e.target.value }))}
                    placeholder={ASSET_KIND_LABEL[k]}
                  />
                </label>
              ))}
              <button
                className="btn-primary !px-3 !py-1.5 text-xs disabled:opacity-40"
                disabled={!isSuper}
                onClick={async () => {
                  try {
                    await api.saveUiTexts({
                      'asset.kind.product': (kindNames.product || '').trim() || ASSET_KIND_LABEL.product,
                      'asset.kind.sticker': (kindNames.sticker || '').trim() || ASSET_KIND_LABEL.sticker,
                    });
                    await loadUiTexts();
                    flash('大类名称已保存（前端同步）');
                  } catch (e) { flash(e instanceof Error ? e.message : '保存失败'); }
                }}
              >保存名称</button>
              {!isSuper && <span className="text-[11px] text-zinc-500">仅超管可修改大类名称。</span>}
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-zinc-200">素材标签（{T('asset.kind.product')} / {T('asset.kind.sticker')}，可增删改）</div>            <AssetTagsManager tags={[...productTags, ...stickerTags]} onChanged={load} flash={flash} />
          </div>
        </div>
      </Modal>

      <AssetUploadModal
        open={upOpen}
        onClose={() => setUpOpen(false)}
        brands={brands} cats={cats} models={models}
        tags={[...productTags, ...stickerTags]}
        defaultKind={kind}
        onDone={async () => { setUpOpen(false); await load(); flash('素材已上传'); }}
      />
      <AssetEditModal
        asset={editAsset}
        onClose={() => setEditAsset(null)}
        brands={brands} cats={cats} models={models}
        tags={[...productTags, ...stickerTags]}
        readOnly={!canEdit}
        onDeleted={async () => { setEditAsset(null); await load(); flash('素材已删除'); }}
        onDone={async () => { setEditAsset(null); await load(); flash('素材已修改'); }}
      />
      {/* 批量修改：统一设置大类 / 标签 / 归属 / 通用或项目专属 */}
      <BatchAssetModal
        open={batchEdit}
        ids={picked}
        brands={brands} cats={cats} models={models} tags={[...productTags, ...stickerTags]} projects={projects}
        onClose={() => setBatchEdit(false)}
        onDone={async () => { setBatchEdit(false); setPicked([]); await load(); flash('已批量修改素材'); }}
      />
      <ConfirmModal
        open={batchDel}
        title="批量删除素材"
        desc={`将删除已选中的 ${picked.length} 个素材，删除后不可恢复。`}
        onCancel={() => setBatchDel(false)}
        onConfirm={async () => {
          for (const id of picked) await api.deleteAsset(id).catch(() => {});
          setBatchDel(false); setPicked([]); await load(); flash('已批量删除素材');
        }}
      />
      <ConfirmModal open={delAsset !== null} title="删除素材" onCancel={() => setDelAsset(null)} onConfirm={async () => { if (delAsset) { await api.deleteAsset(delAsset.id); setDelAsset(null); void load(); } }} />
    </Section>
  );
}

/** 批量修改素材：大类 / 标签 / 归属（品牌-类别-型号）/ 通用或项目专属 */
function BatchAssetModal({
  open, ids, brands, cats, models, tags, projects = [], onClose, onDone,
}: {
  open: boolean;
  ids: number[];
  brands: Brand[];
  cats: Category[];
  models: Model[];
  tags: AssetTag[];
  projects?: Project[];
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [type, setType] = useState<AssetKind>('product');
  const [tagIds, setTagIds] = useState<number[]>([]);
  const T = useUiTexts();
  const [brand, setBrand] = useState(0);
  const [cat, setCat] = useState(0);
  const [model, setModel] = useState(0);
  const [projectId, setProjectId] = useState(0);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setType('product'); setTagIds([]); setBrand(0); setCat(0); setModel(0); setProjectId(0); setErr('');
  }, [open]);

  // 标签只列当前大类的标签
  const batchKindTags = tags.filter((t) => (type === 'sticker' ? (t.kind || 'sticker') === 'sticker' : (t.kind || 'product') !== 'sticker'));

  const catList = cats.filter((c) => !brand || c.brand_id === brand);
  const modelList = models.filter((m) => !cat || m.category_id === cat);
  const brandLevel = brands.find((b) => b.id === brand)?.product_level === 2 ? 2 : 3;

  return (
    <Modal
      open={open}
      width="lg"
      title={`批量修改素材（已选 ${ids.length} 个）`}
      onClose={onClose}
      footer={<ModalFooter onCancel={onClose} onOk={async () => {
        try {
          for (const id of ids) {
            const body: Record<string, unknown> = {};
            body.type = type;
            if (tagIds.length) body.tag_ids = tagIds;
            if (type === 'product' && brand) {
              body.category_id = cat || null;
              if (brandLevel === 3 && model) body.model_id = model;
            }
            // 产品类：可设置成「通用素材」或某个「项目专属素材」
            if (type === 'product') body.project_id = projectId || null;
            await api.updateAsset(id, body as never);
          }
          await onDone();
        } catch (e) { setErr(e instanceof Error ? e.message : '批量修改失败'); }
      }} />}
    >
      <div className="grid gap-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-400">
          大类一定会被改成所选的那一类；标签 / 归属 / 项目不选则保持原样。
        </div>
        <div>
          <span className="text-xs text-zinc-400">素材大类：</span>
          <span className="ml-1.5 inline-flex flex-wrap gap-1.5">
            {(['product', 'sticker'] as AssetKind[]).map((k) => (
              <button key={k} type="button" onClick={() => { setType(k); setTagIds([]); }} className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${type === k ? 'bg-indigo-600 text-white' : 'border border-zinc-600 bg-zinc-800/60 text-zinc-400 hover:border-zinc-400 hover:text-zinc-200'}`}>
                {T(`asset.kind.${k}`)}
              </button>
            ))}
          </span>
          <span className="ml-2 text-[11px] text-zinc-500">产品类 = 产品图；贴图类 = 贴纸</span>
        </div>
        <div>
          <span className="text-xs text-zinc-400">素材标签：</span>
          <span className="ml-1.5 inline-flex flex-wrap gap-1.5">
            {batchKindTags.map((t) => (
              <button key={t.id} type="button" onClick={() => setTagIds((x) => (x.includes(t.id) ? x.filter((i) => i !== t.id) : [...x, t.id]))} className={`rounded px-2.5 py-1 text-xs transition ${tagIds.includes(t.id) ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>{t.name}</button>
            ))}
            {batchKindTags.length === 0 && <span className="text-xs text-zinc-600">暂无可选标签</span>}
          </span>
        </div>
        {type === 'product' && (
        <div>
          <span className="label">归属（品牌 → 类别{matchLevelHint(brandLevel)}）</span>
          <p className="mb-1.5 text-[11px] text-zinc-500">不选品牌则保持原归属</p>
          <div className={brandLevel === 2 ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-3 gap-2'}>
            <select className="input" value={brand} onChange={(e) => { const b = Number(e.target.value); setBrand(b); setCat(cats.find((c) => c.brand_id === b)?.id ?? 0); setModel(0); }}>
              <option value={0}>不修改归属</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select className="input" value={cat} onChange={(e) => { setCat(Number(e.target.value)); setModel(0); }} disabled={!brand}>
              <option value={0}>选择类别</option>
              {catList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {brandLevel === 3 && (
              <select className="input" value={model} onChange={(e) => setModel(Number(e.target.value))} disabled={!cat}>
                <option value={0}>选择型号</option>
                {modelList.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
          </div>
          {/* 通用素材 / 项目专属素材：先选品牌，再选该项目所属项目 */}
          <div className="mt-2">
            <span className="label">通用素材 / 项目专属素材</span>
            <select className="input mt-1" value={projectId} onChange={(e) => setProjectId(Number(e.target.value))} disabled={!brand}>
              <option value={0}>{brand ? '通用素材（品牌级）' : '先选品牌，再选择项目'}</option>
              {projects.filter((p) => p.brand_id === brand).map((p) => (
                <option key={p.id} value={p.id}>项目专属素材 · {p.name}</option>
              ))}
            </select>
          </div>
        </div>
        )}
        {err && <div className="text-xs text-red-400">{err}</div>}
      </div>
    </Modal>
  );
}

function AssetUploadModal({
  open, onClose, brands, cats, models, tags, onDone, fixedProjectId, defaultKind = 'product',
}: {
  open: boolean;
  onClose: () => void;
  brands: Brand[];
  cats: Category[];
  models: Model[];
  tags: AssetTag[];
  onDone: () => void | Promise<void>;
  fixedProjectId?: number;
  /** 打开时默认的大类：产品类 / 贴图类 */
  defaultKind?: AssetKind;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [kind, setKind] = useState<AssetKind>(defaultKind);
  const [brand, setBrand] = useState(0);
  const [cat, setCat] = useState(0);
  const [model, setModel] = useState(0);
  const [projectId, setProjectId] = useState(fixedProjectId || 0);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const T = useUiTexts();

  useEffect(() => {
    if (!open) return;
    api.listProjects().then((r) => setProjects(r.projects)).catch(() => {});
    setProjectId(fixedProjectId || 0);
    // 默认填充：默认品牌 → 默认类别 → 默认型号（2 级品牌只需品牌+类别）
    const b = brands[0]?.id ?? 0;
    const catList0 = cats.filter((c) => c.brand_id === b);
    const c = (catList0.find((x) => x.name === '默认类别') || catList0[0])?.id ?? 0;
    const m = (models.find((x) => x.category_id === c && x.name === '默认型号') || models.find((x) => x.category_id === c))?.id ?? 0;
    setBrand(b);
    setCat(c);
    setModel(m);
    setFiles([]); setTagIds([]); setErr(''); setKind(defaultKind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fixedProjectId, defaultKind]);

  const catList = cats.filter((c) => !brand || c.brand_id === brand);
  const modelList = models.filter((m) => !cat || m.category_id === cat);
  const brandLevel = brands.find((b) => b.id === brand)?.product_level === 2 ? 2 : 3;
  /** 按大类过滤标签：贴图类=贴图类标签（含未分类旧标签）；产品类=其余 */
  const kindTags = tags.filter((t) => (kind === 'sticker' ? (t.kind || 'sticker') === 'sticker' : (t.kind || 'product') !== 'sticker'));

  async function submit() {
    if (!files.length) { setErr('请先选择一张或多张图片'); return; }
    try {
      for (const f of files) {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('type', kind === 'product' ? 'product' : 'sticker');
        fd.append('tag_ids', JSON.stringify(tagIds));
        if (brand) fd.append('brand_id', String(brand));
        if (cat) fd.append('category_id', String(cat));
        if (brandLevel === 3 && model) fd.append('model_id', String(model));
        if (projectId) fd.append('project_id', String(projectId));
        await api.uploadAsset(fd);
      }
      await onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : '上传失败'); }
  }

  return (
    <Modal
      open={open}
      width="xl"
      title="上传素材"
      onClose={onClose}
      footer={<ModalFooter okText="确定上传" onCancel={onClose} onOk={submit} />}
    >
      <div className="grid gap-4">
        {/* 先选大类：产品类 / 贴图类（二选一） */}
        <div>
          <span className="text-xs text-zinc-400">素材大类：</span>
          <span className="ml-1.5 inline-flex flex-wrap gap-1.5">
            {(['product', 'sticker'] as AssetKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${kind === k ? 'bg-indigo-600 text-white' : 'border border-zinc-600 bg-zinc-800/60 text-zinc-400 hover:border-zinc-400 hover:text-zinc-200'}`}
              >{T(`asset.kind.${k}`)}</button>
            ))}
          </span>
          <span className="ml-2 text-[11px] text-zinc-500">{kind === 'product' ? '带品牌 / 产品 / 型号归属' : '只有标签（大类之下不再分素材类型）'}</span>
        </div>
        {/* ② 再选素材标签（按大类只显示本类标签） */}
        <div>
          <span className="text-xs text-zinc-400">② 素材标签：</span>
          <span className="ml-1.5 inline-flex flex-wrap gap-1.5">
            {kindTags.length === 0 && <span className="text-xs text-zinc-600">暂无{T(`asset.kind.${kind}`)}标签（可在「管理素材标签」里新建）</span>}
            {kindTags.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTagIds((x) => (x.includes(t.id) ? x.filter((i) => i !== t.id) : [...x, t.id]))}
                className={`rounded px-2.5 py-1 text-xs font-medium transition ${tagIds.includes(t.id) ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
              >
                {t.name}
              </button>
            ))}
          </span>
        </div>
        {kind === 'product' && (
        <div>
          <span className="label">归属型号</span>
          <p className="mb-1.5 text-[11px] text-zinc-500">
            {brandLevel === 2
              ? '该品牌为 2 级产品：选择 品牌 → 产品（类别），没有型号'
              : `该品牌为 3 级产品：选择 品牌 → 类别${matchLevelHint(brandLevel)}`}
          </p>
          <div className={brandLevel === 2 ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-3 gap-2'}>
            <select className="input" value={brand} onChange={(e) => {
              const b = Number(e.target.value);
              setBrand(b);
              const cl = cats.filter((c) => c.brand_id === b);
              const c = (cl.find((x) => x.name === '默认类别') || cl[0])?.id ?? 0;
              setCat(c);
              setModel((models.find((x) => x.category_id === c && x.name === '默认型号') || models.find((x) => x.category_id === c))?.id ?? 0);
            }}>
              <option value={0}>选择品牌</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select className="input" value={cat} onChange={(e) => {
              const c = Number(e.target.value);
              setCat(c);
              setModel((models.find((x) => x.category_id === c && x.name === '默认型号') || models.find((x) => x.category_id === c))?.id ?? 0);
            }}>
              <option value={0}>{brandLevel === 2 ? '选择产品（类别）' : '选择类别'}</option>
              {catList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {brandLevel === 3 && (
              <select className="input" value={model} onChange={(e) => setModel(Number(e.target.value))}>
                <option value={0}>选择型号</option>
                {modelList.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
          </div>
          {/* 通用素材 / 项目专属素材：先选品牌（上面的归属），再选该品牌下的项目 */}
          {!fixedProjectId && (
            <div className="mt-2">
              <span className="label">通用素材 / 项目专属素材</span>
              <select className="input mt-1" value={projectId} onChange={(e) => setProjectId(Number(e.target.value))} disabled={!brand}>
                <option value={0}>{brand ? '通用素材（品牌级）' : '先选品牌，再选择项目'}</option>
                {projects.filter((p) => p.brand_id === brand).map((p) => (
                  <option key={p.id} value={p.id}>项目专属素材 · {p.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        )}
        <div>
          <span className="label">图片（可选择 1 张或多张）</span>
          <button className="btn-soft w-full" onClick={() => fileRef.current?.click()}>
            {files.length ? `已选择 ${files.length} 张，点击可重新选择` : '选择图片（可多选）'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
          {files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {files.map((f, i) => <span key={`${f.name}-${i}`} className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300">{f.name}</span>)}
            </div>
          )}
        </div>
        {err && <div className="text-xs text-red-400">{err}</div>}
      </div>
    </Modal>
  );
}

function AssetEditModal({
  asset, onClose, brands, cats, models, tags, onDone, onDeleted, readOnly = false,
}: {
  asset: Asset | null;
  onClose: () => void;
  brands: Brand[];
  cats: Category[];
  models: Model[];
  tags: AssetTag[];
  onDone: () => void | Promise<void>;
  /** 删除成功后回调（弹窗左下角的删除按钮） */
  onDeleted?: () => void | Promise<void>;
  /** 只读（部门成员等只有查看权限的角色） */
  readOnly?: boolean;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [kind, setKind] = useState<AssetKind>('product');
  const [form, setForm] = useState({ tagIds: [] as number[], type: 'scene' as AssetType, brand: 0, cat: 0, model: 0, projectId: 0 });
  const [err, setErr] = useState('');
  const T = useUiTexts();

  useEffect(() => {
    if (!asset) return;
    api.listProjects().then((r) => setProjects(r.projects)).catch(() => {});
    const m = asset.model_id ? models.find((x) => x.id === asset.model_id) : undefined;
    const cat = m?.category_id || asset.category_id || 0;
    const brand = m?.brand_id || asset.brand_id || 0;
    setKind(asset.type === 'product' ? 'product' : 'sticker');
    setForm({
      tagIds: (asset.tags || []).map((t) => t.id),
      type: asset.type,
      brand,
      cat,
      model: asset.model_id || 0,
      projectId: asset.project_id || 0,
    });
    setErr('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset]);

  if (!asset) return null;
  const catList = cats.filter((c) => !form.brand || c.brand_id === form.brand);
  const modelList = models.filter((m) => !form.cat || m.category_id === form.cat);
  const brandLevel = brands.find((b) => b.id === form.brand)?.product_level === 2 ? 2 : 3;
  /** 按大类过滤标签：贴图类=贴图类标签（含未分类旧标签）；产品类=其余 */
  const editKindTags = tags.filter((t) => (kind === 'sticker' ? (t.kind || 'sticker') === 'sticker' : (t.kind || 'product') !== 'sticker'));
  // 预览右上角展示归属：3 级品牌=型号名，2 级品牌=类别名
  const curProductName = brandLevel === 2
    ? (cats.find((c) => c.id === form.cat)?.name || '')
    : (models.find((m) => m.id === form.model)?.name || '');

  return (
    <Modal
      open={asset !== null}
      width="xl"
      title={readOnly ? '查看素材' : '修改素材'}
      onClose={onClose}
      footer={readOnly ? (
        <button className="btn-soft" onClick={onClose}>关闭</button>
      ) : (
        <>
          <button
            className="mr-auto rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
            onClick={async () => {
              try {
                await api.deleteAsset(asset.id);
                if (onDeleted) await onDeleted();
                else onClose();
              } catch (e) { setErr(e instanceof Error ? e.message : '删除失败'); }
            }}
          >
            删除该素材
          </button>
          <ModalFooter onCancel={onClose} onOk={async () => {
        try {
          await api.updateAsset(asset.id, {
            tag_ids: form.tagIds,
            // 大类：产品类 → 产品图；贴图类 → 贴纸（原本就是底图的保持底图不变）
            type: kind === 'product' ? 'product' : (asset.type === 'product' ? 'sticker' : asset.type),
            category_id: form.cat || null,
            model_id: brandLevel === 3 ? (form.model || null) : null,
            project_id: form.projectId || null,
          });
          await onDone();
        } catch (e) { setErr(e instanceof Error ? e.message : '保存失败'); }
      }} />
        </>
      )}
    >
      <div className="grid gap-4">
        {/* 左侧：素材预览大图（右下角显示归属） + 右侧：按钮与选框 */}
        <div className="grid gap-4 md:grid-cols-[minmax(280px,42%)_1fr]">
          <div className="relative self-start overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
            <img src={apiUrl(asset.url)} alt="" className="max-h-[62vh] w-full object-contain" />
            {asset.project_id && (
              <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[11px] text-zinc-200">专属 · {asset.project_name || ''}</span>
            )}
            {(curProductName || asset.product_name || asset.model_name || asset.category_name) && (
              <span className="absolute bottom-2 right-2 rounded bg-emerald-600/85 px-2 py-0.5 text-[11px] text-white">
                {curProductName || asset.product_name || asset.model_name || asset.category_name}
              </span>
            )}
          </div>
          <div className="grid content-start gap-3">
            {/* 先选大类：产品类 / 贴图类 */}
            <div>
              <span className="text-xs text-zinc-400">素材大类：</span>
              <span className="ml-1.5 inline-flex flex-wrap gap-1.5">
                {(['product', 'sticker'] as AssetKind[]).map((k) => (
                  <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${kind === k ? 'bg-indigo-600 text-white' : 'border border-zinc-600 bg-zinc-800/60 text-zinc-400 hover:border-zinc-400 hover:text-zinc-200'}`}>
                    {T(`asset.kind.${k}`)}
                  </button>
                ))}
              </span>
            </div>
            {/* 再选素材标签（按大类只显示本类标签） */}
            <div>
              <span className="text-xs text-zinc-400">素材标签：</span>
              <span className="ml-1.5 inline-flex flex-wrap gap-1.5">
                {editKindTags.length === 0 && <span className="text-xs text-zinc-600">暂无{T(`asset.kind.${kind}`)}标签（可在「管理素材标签」里新建）</span>}
                {editKindTags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setForm({ ...form, tagIds: form.tagIds.includes(t.id) ? form.tagIds.filter((i) => i !== t.id) : [...form.tagIds, t.id] })}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition ${form.tagIds.includes(t.id) ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                  >
                    {t.name}
                  </button>
                ))}
              </span>
            </div>
            {/* 归属：产品类才需要（按品牌是 2 级 / 3 级切换下拉） */}
            {kind === 'product' && (
            <div>
              <span className="label">归属型号</span>
              <p className="mb-1.5 text-[11px] text-zinc-500">
                {brandLevel === 2 ? '该品牌为 2 级产品：选择品牌 → 产品（类别），没有型号' : `选择品牌 → 类别${matchLevelHint(brandLevel)}`}
              </p>
              <div className="grid gap-2">
                <select className="input" value={form.brand} onChange={(e) => {
                  const b = Number(e.target.value);
                  const c = cats.find((x) => x.brand_id === b)?.id ?? 0;
                  setForm({ ...form, brand: b, cat: c, model: 0 });
                }}>
                  <option value={0}>选择品牌</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}（{b.product_level === 2 ? '2级' : '3级'}）</option>)}
                </select>
                <select className="input" value={form.cat} onChange={(e) => setForm({ ...form, cat: Number(e.target.value), model: 0 })}>
                  <option value={0}>{brandLevel === 2 ? '选择产品（类别）' : '选择类别'}</option>
                  {catList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {brandLevel === 3 && (
                  <select className="input" value={form.model} onChange={(e) => setForm({ ...form, model: Number(e.target.value) })}>
                    <option value={0}>选择型号</option>
                    {modelList.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}
              </div>
            </div>
            )}
            {/* 通用 / 项目专属：只有产品类需要（贴图类不显示这个选项） */}
            {kind === 'product' && (
            <div>
              <span className="label">通用素材 / 项目专属素材</span>
              <select
                className="input mt-1"
                value={form.projectId}
                disabled={kind === 'product' && !form.brand}
                onChange={(e) => setForm({ ...form, projectId: Number(e.target.value) })}
              >
                <option value={0}>{kind === 'product' && !form.brand ? '先选品牌，再选择项目' : '通用素材（品牌级）'}</option>
                {projects
                  .filter((p) => (form.brand ? p.brand_id === form.brand : true))
                  .map((p) => <option key={p.id} value={p.id}>项目专属素材 · {p.name}</option>)}
              </select>
            </div>
            )}
          </div>
        </div>
        {err && <div className="text-xs text-red-400">{err}</div>}
      </div>
    </Modal>
  );
}

/* ==================== 5. 模板 ==================== */
function TemplatesTab({ canEdit = true, canBrowse = true }: { canEdit?: boolean; canBrowse?: boolean }) {
  const T = useUiTexts();
  const user = useAuth((s) => s.user);
  const isSuperTpl = user?.role === 'super_admin';
  const isMobileLayout = useIsMobileLayout();
  const [trashOpen, setTrashOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [types, setTypes] = useState<TemplateType[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [typeId, setTypeId] = useState(0);
    // 专属模板的 3 个下拉：品牌 → 产品 → 项目
  const [pick, setPick] = useState({ brand: 0, cat: 0, proj: 0 });
  const [upOpen, setUpOpen] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [editTpl, setEditTpl] = useState<Template | null>(null);
  const [delTpl, setDelTpl] = useState<Template | null>(null);
  const [msg, setMsg] = useState('');
  // 分页（一页 5×5 = 25）+ 批量选择
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<number[]>([]);
  const [batchDel, setBatchDel] = useState(false);
  const PER_PAGE = 25;

  const load = useCallback(async () => {
    // 部门成员可浏览全部品牌 / 项目 / 模板
    const browseAll = canBrowseAllProjects(user?.role);
    const [t, tt, b, c, p] = await Promise.all([
      api.listTemplates(),
      api.listTemplateTypes(),
      api.listBrands(browseAll),
      api.listCategories(undefined, browseAll),
      api.listProjects(undefined, undefined, undefined, browseAll),
    ]);
    setTemplates(t.references); setTypes(tt.types); setBrands(b.brands); setCats(c.categories); setProjects(p.projects);
  }, [user?.role]);
  useEffect(() => { void load(); }, [load]);
  function flash(t: string) { setMsg(t); window.setTimeout(() => setMsg(''), 2500); }

  const byTag = (t: Template) => !typeId || t.template_type_id === typeId;

  /** 通用模板 */
  const generic = templates.filter((t) => t.project_id == null && byTag(t));
/** 专属模板：按 品牌 → 产品 → 项目 三个下拉筛选 */
  const exclusive = templates.filter((t) => {
    if (t.project_id == null || !byTag(t)) return false;
    const proj = projects.find((p) => p.id === t.project_id);
    if (pick.proj) return t.project_id === pick.proj;
    if (pick.cat) return proj?.category_id === pick.cat;
    if (pick.brand) return proj?.brand_id === pick.brand;
    return true;
  });

  const catOptions = cats.filter((c) => !pick.brand || c.brand_id === pick.brand);
  const projOptions = projects.filter((p) => (!pick.brand || p.brand_id === pick.brand) && (!pick.cat || p.category_id === pick.cat));

  // 分页：一页 5×5 = 25
  const allFiltered = useMemo(() => [...generic, ...exclusive], [generic, exclusive]);
  const pageCount = Math.max(1, Math.ceil(allFiltered.length / PER_PAGE));
  const curPage = Math.min(page, pageCount);
  const pageItems = allFiltered.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);
  const allPicked = pageItems.length > 0 && pageItems.every((t) => picked.includes(t.id));
  const toggleAll = () =>
    setPicked(allPicked ? picked.filter((id) => !pageItems.some((t) => t.id === id)) : [...new Set([...picked, ...pageItems.map((t) => t.id)])]);
  useEffect(() => { setPage(1); }, [typeId, pick.brand, pick.cat, pick.proj]);

  const card = (t: Template) => {
    const on = picked.includes(t.id);
    return (
    <div key={t.id} className={`overflow-hidden rounded-xl border bg-zinc-900 transition ${on ? 'border-indigo-500 ring-2 ring-indigo-500/40' : 'border-zinc-800'}`}>
      <div className="group relative cursor-pointer" onClick={() => setEditTpl(t)}>
        {/* 模板底图：统一 3:4 预览框 */}
        <div className="aspect-[3/4] w-full overflow-hidden bg-zinc-950">
          <img src={apiUrl(t.url)} alt={t.name || ''} className="h-full w-full object-cover" />
        </div>
        <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-zinc-200">{t.template_type_name || (t.kind === 'B' ? '产品+背景+压字' : '底图压字')}</span>
        <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-zinc-300">{t.project_id ? `专属 · ${t.project_name || ''}` : '通用'}</span>
        {canEdit && (
          <span className="absolute bottom-1 left-1 grid h-4 w-4 place-items-center rounded-none bg-black/55" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" className="h-3 w-3 accent-indigo-500" checked={on} onChange={() => setPicked((x) => (x.includes(t.id) ? x.filter((i) => i !== t.id) : [...x, t.id]))} />
          </span>
        )}
        {(canEdit || canBrowse) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition group-hover:opacity-100">
            <button className="btn-soft !px-3 !py-1.5 text-xs" onClick={(e) => { e.stopPropagation(); setEditTpl(t); }}>管理</button>
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="truncate text-xs font-medium text-zinc-300">{t.name}</div>
              <div className="mt-1 text-[10px] text-indigo-300">文字：</div>
        <div className="line-clamp-2 text-xs text-zinc-400">{t.text_style_prompt}</div>
        {t.scene_prompt && (
          <>
                  <div className="mt-1 text-[10px] text-amber-300">背景：</div>
            <div className="line-clamp-1 text-xs text-zinc-400">{t.scene_prompt}</div>
          </>
        )}
      </div>
    </div>
    );
  };

  return (
    <Section
      title="模板"
      desc={T('admin.templates.desc')}
      actions={<>
        {msg && <span className="text-xs text-amber-400">{msg}</span>}
        {canEdit && (
          <>
            {isSuperTpl && <button className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-600" onClick={() => setTrashOpen(true)}>回收站</button>}
            <button className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-amber-950/30 transition hover:bg-amber-500" onClick={() => setTypesOpen(true)}>管理模板标签</button>
            <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-950/30 transition hover:bg-indigo-500" onClick={() => setUpOpen(true)}>新建模板</button>
          </>
        )}
      </>}
    >
      {/* 筛选行：左侧 品牌 → 产品 → 项目 三个下拉，右侧模板标签（同一行，条件为「且」的关系）。
          移动端：三个下拉固定成一列、依次向下排，文案精简、标签字号更小，避免撑出手机边框。 */}
      <div className={`${isMobileLayout ? 'mb-3 flex flex-col gap-2' : 'mb-4 flex items-center gap-2'}`}>
        <div className={isMobileLayout ? 'grid shrink-0 grid-cols-1 gap-1.5' : 'flex shrink-0 items-center gap-2'}>
          <label className={isMobileLayout ? 'grid grid-cols-[3.5rem_1fr] items-center gap-1.5' : 'contents'}>
            {isMobileLayout && <span className="text-[10px] font-medium text-zinc-500">品牌</span>}
            <select
              className={isMobileLayout ? 'input min-w-0 !px-1.5 !py-1 text-[11px]' : 'input !w-32 !px-2 !py-1 text-xs'}
              value={pick.brand}
              onChange={(e) => setPick({ brand: Number(e.target.value), cat: 0, proj: 0 })}
            >
              {/* 移动端文案精简：只留「品牌 / 全部」等短标签 */}
              <option value={0}>{isMobileLayout ? '全部' : '选择品牌（全部）'}</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className={isMobileLayout ? 'grid grid-cols-[3.5rem_1fr] items-center gap-1.5' : 'contents'}>
            {isMobileLayout && <span className="text-[10px] font-medium text-zinc-500">产品</span>}
            <select
              className={isMobileLayout ? 'input min-w-0 !px-1.5 !py-1 text-[11px]' : 'input !w-32 !px-2 !py-1 text-xs'}
              value={pick.cat}
              onChange={(e) => setPick({ ...pick, cat: Number(e.target.value), proj: 0 })}
            >
              <option value={0}>{isMobileLayout ? '全部' : '选择产品（全部）'}</option>
              {catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className={isMobileLayout ? 'grid grid-cols-[3.5rem_1fr] items-center gap-1.5' : 'contents'}>
            {isMobileLayout && <span className="text-[10px] font-medium text-zinc-500">项目</span>}
            <select
              className={isMobileLayout ? 'input min-w-0 !px-1.5 !py-1 text-[11px]' : 'input !w-36 !px-2 !py-1 text-xs'}
              value={pick.proj}
              onChange={(e) => setPick({ ...pick, proj: Number(e.target.value) })}
            >
              <option value={0}>{isMobileLayout ? '全部' : '选择项目（全部）'}</option>
              {projOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
        <span className={`shrink-0 text-zinc-500 ${isMobileLayout ? 'text-[10px]' : 'ml-auto text-[11px]'}`}>模板标签：</span>
        <div className={`flex min-w-0 items-center gap-1.5 overflow-x-auto ${isMobileLayout ? 'flex-1' : 'flex-1 justify-end'}`}>
          <button onClick={() => setTypeId(0)} className={`shrink-0 rounded-lg transition ${isMobileLayout ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} ${typeId === 0 ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>
            全部标签
          </button>
          {types.map((t) => (
            <button key={t.id} onClick={() => setTypeId(t.id)} className={`shrink-0 rounded-lg transition ${isMobileLayout ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} ${typeId === t.id ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>
              {t.name}<span className={`ml-1 text-zinc-400 ${isMobileLayout ? 'text-[9px]' : 'text-[10px]'}`}>{t.template_count ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 汇总展示：通用 + 项目专属放在一起，按标签与下拉条件筛选 */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-zinc-500">
          共 {generic.length + exclusive.length} 个模板（通用 {generic.length} · 项目专属 {exclusive.length}）· 第 {curPage}/{pageCount} 页
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {pageItems.map(card)}
      </div>
      {/* 分页 + 批量操作 */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <label className="flex items-center gap-1.5 text-xs text-zinc-300">
              <input type="checkbox" className="h-4 w-4 accent-indigo-500" checked={allPicked} onChange={toggleAll} />
              全选（本页 {pageItems.length} 个{allPicked ? ' · 可单独取消' : ''}）
            </label>
          )}
          {canEdit && (
            <>
              <span className="text-[11px] text-zinc-500">已选 {picked.length} 个</span>
              <button
                className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-500 disabled:opacity-40"
                disabled={!picked.length}
                onClick={() => {
                  const first = templates.find((x) => x.id === picked[0]);
                  if (first) setEditTpl(first);
                }}
              >
                批量修改
              </button>
              <button className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-500 disabled:opacity-40" disabled={!picked.length} onClick={() => setBatchDel(true)}>批量删除</button>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button className="btn-soft !px-2.5 !py-1 text-xs disabled:opacity-40" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>上一页</button>
          {Array.from({ length: pageCount }).slice(0, 12).map((_, i) => (
            <button key={i} onClick={() => setPage(i + 1)} className={`h-7 min-w-7 rounded px-2 text-xs transition ${curPage === i + 1 ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>{i + 1}</button>
          ))}
          {pageCount > 12 && <span className="text-xs text-zinc-500">…共 {pageCount} 页</span>}
          <button className="btn-soft !px-2.5 !py-1 text-xs disabled:opacity-40" disabled={curPage >= pageCount} onClick={() => setPage(curPage + 1)}>下一页</button>
        </div>
      </div>

      <ConfirmModal
        open={batchDel}
        title="批量删除模板"
        desc={`将删除已选中的 ${picked.length} 个模板，删除后不可恢复。`}
        onCancel={() => setBatchDel(false)}
        onConfirm={async () => {
          for (const id of picked) await api.deleteTemplate(id).catch(() => {});
          setBatchDel(false); setPicked([]); await load(); flash('已批量删除模板');
        }}
      />
      {generic.length + exclusive.length === 0 && <Empty text="当前筛选下暂无模板" />}

      <TemplateUploadModal open={upOpen} onClose={() => setUpOpen(false)} types={types} brands={brands} onDone={async () => { setUpOpen(false); await load(); flash('模板已创建'); }} />
      <TemplateEditModal
        template={editTpl}
        types={types}
        brands={brands}
        readOnly={!canEdit}
        onClose={() => setEditTpl(null)}
        onDeleted={async () => { setEditTpl(null); await load(); flash('模板已删除'); }}
        onDone={async () => { setEditTpl(null); await load(); flash('模板已修改'); }}
      />

      {/* 模板标签管理 */}
      <Modal open={typesOpen} title="管理模板标签" width="xl" onClose={() => setTypesOpen(false)} footer={<button className="btn-soft" onClick={() => setTypesOpen(false)}>关闭</button>}>
        <TemplateTypesManager types={types} onChanged={load} flash={flash} />
      </Modal>

      <TrashModal open={trashOpen} onClose={() => setTrashOpen(false)} flash={flash} />

      <ConfirmModal open={delTpl !== null} title="删除模板" onCancel={() => setDelTpl(null)} onConfirm={async () => { if (delTpl) { await api.deleteTemplate(delTpl.id); setDelTpl(null); void load(); } }} />
    </Section>
  );
}

/**
 * 模板标签管理：每个标签可配置
 * - 画布界面（A 底图界面 / B 产品+AI背景界面）
 * - 默认 AI 背景提示词
 * - 是否拼图（显示 2/3/4 拼图单选与宫格容器）
 */
function TemplateTypesManager({ types, onChanged, flash }: { types: TemplateType[]; onChanged: () => void | Promise<void>; flash: (t: string) => void }) {
  type Draft = { name: string; kind: 'A' | 'B'; promptText: string; promptScene: string; puzzle: boolean };
  const blank: Draft = { name: '', kind: 'A', promptText: '', promptScene: '', puzzle: false };
  // 新建表单 与 行内修改表单 各自独立，互不联动
  const [draft, setDraft] = useState<Draft>(blank);
  const [editId, setEditId] = useState<number | null>(null);
  const [edit, setEdit] = useState<Draft>(blank);

  /** A / B / 拼图 三种选择都用同样的按钮形式 */
  function KindButtons({ value, puzzleValue, onChange, compact = false }: { value: 'A' | 'B'; puzzleValue: boolean; onChange: (patch: Partial<Draft>) => void; compact?: boolean }) {
    const cls = (on: boolean) =>
      `rounded transition ${compact ? 'px-2.5 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'} ${
        on ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
      }`;
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => onChange({ kind: 'A' })} className={cls(value === 'A')}>
          {compact ? 'A 底图界面' : 'A · 底图界面'}
        </button>
        <button type="button" onClick={() => onChange({ kind: 'B' })} className={cls(value === 'B')}>
          {compact ? 'B 产品+AI背景界面' : 'B · 产品+AI背景界面'}
        </button>
        <button type="button" onClick={() => onChange({ puzzle: !puzzleValue })} className={cls(puzzleValue)}>
          拼图标签（2/3/4 拼图）
        </button>
      </div>
    );
  }

  /** 交换两个标签的顺序号（其余保持不动，保证画布 / 模板下拉顺序一致） */
  async function syncSort(list: TemplateType[], a: number, b: number) {
    const sorted = [...list];
    const tmp = sorted[a];
    sorted[a] = sorted[b];
    sorted[b] = tmp;
    for (let i = 0; i < sorted.length; i++) {
      await api.updateTemplateType(sorted[i].id, { sort: i });
    }
  }

  async function save(id: number) {
    if (!edit.name.trim()) return flash('标签名不能为空');
    try {
      await api.updateTemplateType(id, {
        name: edit.name.trim(),
        path_kind: edit.kind,
        prompt_text: edit.promptText,
        prompt_scene: edit.promptScene,
        puzzle: edit.puzzle ? 1 : 0,
        // 不再提交比例：出图比例统一以画布比例为准
      });
      setEditId(null);
      await onChanged();
      flash('标签已修改');
    } catch (e) { flash(e instanceof Error ? e.message : '修改失败'); }
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="label !mb-0">新建标签<input className="input mt-1 !w-40" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="如：大字报" /></label>
          <KindButtons value={draft.kind} puzzleValue={draft.puzzle} onChange={(patch) => setDraft({ ...draft, ...patch })} />
          <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={async () => {
            if (!draft.name.trim()) return flash('标签名不能为空');
            try {
              await api.createTemplateType(draft.name.trim(), draft.kind, { prompt_text: draft.promptText, prompt_scene: draft.promptScene, puzzle: draft.puzzle ? 1 : 0 });
              setDraft(blank);
              await onChanged();
              flash('标签已新建');
            } catch (e) { flash(e instanceof Error ? e.message : '新建失败'); }
          }}>新建</button>
        </div>
        {/* 新建时只填「标签名 + 类型」：
            内置提示词与比例都不在这里设置，建好标签后再到列表里点「修改」去配置。
            出图比例已改为统一以画布比例为准，后台不再单独设置比例。 */}
      </div>

      <div className="space-y-1.5">
        {types.map((t) => (
          <div key={t.id} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
            {editId === t.id ? (
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input className="input !w-40" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                  <KindButtons compact value={edit.kind} puzzleValue={edit.puzzle} onChange={(patch) => setEdit({ ...edit, ...patch })} />
                  <span className="ml-auto flex items-center gap-1.5">
                    <button className="btn-primary !px-2.5 !py-1 text-[11px]" onClick={() => save(t.id)}>保存</button>
                    <button className="btn-soft !px-2.5 !py-1 text-[11px]" onClick={() => setEditId(null)}>取消</button>
                  </span>
                </div>
                {/* 比例设置已移除：所有 AI 生图统一以画布比例为准 */}
                <textarea className="input text-xs" rows={2} value={edit.promptScene} onChange={(e) => setEdit({ ...edit, promptScene: e.target.value })} placeholder="内置背景提示词（仅 B 类：先生成背景时使用）" />
                <textarea className="input text-xs" rows={3} value={edit.promptText} onChange={(e) => setEdit({ ...edit, promptText: e.target.value })} placeholder="内置文字样式提示词（留空则前端不显示 AI 文字样式区；文字出图比例以这里写的比例为准，与画布无关）" />
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2 text-sm text-zinc-200">
                  {t.name}
                  <Badge>{t.path_kind === 'B' ? 'B 产品+AI背景界面' : 'A 底图界面'}</Badge>
                  {Number(t.puzzle) === 1 && <Badge tone="amber">拼图</Badge>}
                  {t.prompt_text ? <Badge tone="indigo">含文字提示词</Badge> : <Badge tone="zinc">无文字提示词</Badge>}
                  {t.prompt_scene ? <Badge tone="indigo">含背景提示词</Badge> : null}
                  {/* 比例已改为统一以画布比例为准，这里不再显示比例徽标 */}
                  <span className="text-[11px] text-zinc-500">{t.template_count ?? 0} 个模板</span>
                </span>
                <span className="flex items-center gap-1.5">
                  {/* 调整顺序：新建/修改模板与画布里的模板标签顺序都会同步 */}
                  <button
                    className="btn-soft !px-2 !py-1 text-[11px]"
                    title="上移（画布与模板排序同步）"
                    disabled={types.indexOf(t) === 0}
                    onClick={async () => {
                      const i = types.indexOf(t);
                      if (i <= 0) return;
                      const prev = types[i - 1];
                      try {
                        await api.updateTemplateType(t.id, { sort: i - 1 });
                        await api.updateTemplateType(prev.id, { sort: i });
                        await syncSort(types, i, i - 1);
                        await onChanged();
                        flash('顺序已调整');
                      } catch (e) { flash(e instanceof Error ? e.message : '调整失败'); }
                    }}
                  >↑</button>
                  <button
                    className="btn-soft !px-2 !py-1 text-[11px]"
                    title="下移（画布与模板排序同步）"
                    disabled={types.indexOf(t) === types.length - 1}
                    onClick={async () => {
                      const i = types.indexOf(t);
                      if (i < 0 || i >= types.length - 1) return;
                      const next = types[i + 1];
                      try {
                        await api.updateTemplateType(t.id, { sort: i + 1 });
                        await api.updateTemplateType(next.id, { sort: i });
                        await syncSort(types, i, i + 1);
                        await onChanged();
                        flash('顺序已调整');
                      } catch (e) { flash(e instanceof Error ? e.message : '调整失败'); }
                    }}
                  >↓</button>
                  <button className="btn-soft !px-2.5 !py-1 text-[11px]" onClick={() => {
                    setEditId(t.id);
                    setEdit({
                      name: t.name, kind: t.path_kind,
                      promptText: t.prompt_text || '', promptScene: t.prompt_scene || '',
                      puzzle: Number(t.puzzle) === 1,
                    });
                  }}>修改</button>
                  <button className="btn-danger !px-2.5 !py-1 text-[11px]" onClick={async () => {
                    try { await api.deleteTemplateType(t.id); await onChanged(); flash('标签已删除'); }
                    catch (e) { flash(e instanceof Error ? e.message : '删除失败'); }
                  }}>删除</button>
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplateUploadModal({
  open, onClose, types, brands, onDone, fixedProjectId, fixedBrandId,
}: {
  open: boolean;
  onClose: () => void;
  types: TemplateType[];
  brands: Brand[];
  onDone: () => void | Promise<void>;
  fixedProjectId?: number;
  fixedBrandId?: number;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState({ name: '', typeId: 0, prompt: '', scene: '', brandId: fixedBrandId || 0, projectId: fixedProjectId || 0 });
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    api.listProjects().then((r) => setProjects(r.projects)).catch(() => {});
    setForm({ name: '', typeId: types[0]?.id ?? 0, prompt: '', scene: '', brandId: fixedBrandId || brands[0]?.id || 0, projectId: fixedProjectId || 0 });
    setFile(null); setErr('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fixedProjectId, fixedBrandId]);

  const curType = types.find((t) => t.id === form.typeId);
  // 项目专属模板：先归属品牌（产品），再选该品牌下的项目
  const brandProjects = projects.filter((p) => p.brand_id === form.brandId);
  /** 「智能参考」只允许 1 个模板：已存在时不允许再建 */
  const smartRefFull = isSmartRefType(curType) && Number(curType?.template_count ?? 0) >= 1;

  async function submit() {
    if (!file) { setErr('请选择模板图片'); return; }
    if (smartRefFull) { setErr('「智能参考」只能有 1 个模板，请到「管理模板」里替换它的参考图'); return; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('name', form.name || file.name);
    fd.append('text_style_prompt', form.prompt.trim());
    if (form.typeId) fd.append('template_type_id', String(form.typeId));
    if (form.typeId && curType?.path_kind === 'B') fd.append('scene_prompt', form.scene.trim());
    if (form.brandId) fd.append('brand_id', String(form.brandId));
    if (form.projectId) fd.append('project_id', String(form.projectId));
    try {
      await api.createTemplate(fd);
      await onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : '创建失败'); }
  }

  return (
    <Modal open={open} title="新建模板" width="xl" onClose={onClose} footer={<ModalFooter okText="创建模板" onCancel={onClose} onOk={submit} />}>
      <div className="grid gap-3">
        <label className="label">模板标签
          <select className="input mt-1" value={form.typeId} onChange={(e) => setForm({ ...form, typeId: Number(e.target.value) })}>
            {types.map((t) => <option key={t.id} value={t.id} style={{ color: t.path_kind === 'B' ? '#fbbf24' : '#7dd3fc' }}>{t.name}</option>)}
          </select>
        </label>
        <label className="label">模板名称（选填）<input className="input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：夏季促销-暖色" /></label>
        {/* 顺序：背景提示词 → 文字样式提示词。
            两个「内置提示词」只读展示框已按要求移除（在「管理 → 管理模板标签」里查看和修改）。 */}
        {curType?.path_kind === 'B' && (
          <label className="label text-amber-300">背景提示词（先生成背景，可留空用标签默认）<textarea className="input mt-1 min-h-[72px]" value={form.scene} onChange={(e) => setForm({ ...form, scene: e.target.value })} placeholder="描述环境背景：奶油色桌面、自然光…（不含产品）" rows={2} /></label>
        )}
        <label className="label text-indigo-300">文字样式提示词（可留空，留空则用模板标签的默认提示词）<textarea className="input mt-1 min-h-[72px] text-xs" value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} placeholder="描述文字排版风格：字体、颜色、排布…" rows={2} /></label>
        <div className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <span className="label !mb-0">模板为通用模板 / 项目专属模板（先归属产品，再选项目）</span>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className="input"
              value={form.brandId}
              disabled={!!fixedBrandId}
              onChange={(e) => setForm({ ...form, brandId: Number(e.target.value), projectId: 0 })}
            >
              <option value={0}>请选择品牌</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select
              className="input"
              value={form.projectId}
              disabled={!!fixedProjectId || !form.brandId}
              onChange={(e) => setForm({ ...form, projectId: Number(e.target.value) })}
            >
              <option value={0}>通用模板（全部）</option>
              {brandProjects.map((p) => <option key={p.id} value={p.id}>专属 · {p.name}</option>)}
            </select>
          </div>
          {!form.brandId && <span className="text-[11px] text-zinc-500">先选择品牌（产品），才能选择该项目专属模板。</span>}
          {form.brandId > 0 && brandProjects.length === 0 && <span className="text-[11px] text-zinc-500">该品牌下暂无项目，只能保存为通用模板。</span>}
        </div>
        <div>
          <span className="label">模板图片</span>
          <button className="btn-soft w-full" onClick={() => fileRef.current?.click()}>
            {file ? `已选择：${file.name}` : '选择图片文件'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        </div>
        {err && <div className="text-xs text-red-400">{err}</div>}
      </div>
    </Modal>
  );
}

function TemplateEditModal({
  template, types, brands, onClose, onDone, onDeleted, readOnly = false,
}: {
  template: Template | null;
  types: TemplateType[];
  brands: Brand[];
  onClose: () => void;
  onDone: () => void | Promise<void>;
  /** 删除成功后回调（弹窗左下角的删除按钮） */
  onDeleted?: () => void | Promise<void>;
  /** 只读（部门成员等只有查看权限的角色） */
  readOnly?: boolean;
}) {
  const user = useAuth((s) => s.user);
  // 内置提示词 = 该模板标签配置的默认提示词：管理员可直接修改（保存时同步到标签），其他人只读
  const canEditBuiltin = !readOnly && !!user && isGlobalRole(user.role);
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState({ name: '', typeId: 0, prompt: '', scene: '', brandId: 0, projectId: 0 });
  const [builtinText, setBuiltinText] = useState('');
  const [builtinScene, setBuiltinScene] = useState('');
  const [newImage, setNewImage] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const imgRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!template) return;
    api.listProjects().then((r) => setProjects(r.projects)).catch(() => {});
    setForm({
      name: template.name || '',
      typeId: template.template_type_id || types[0]?.id || 0,
      prompt: template.text_style_prompt,
      scene: template.scene_prompt || '',
      brandId: template.brand_id || brands[0]?.id || 0,
      projectId: template.project_id || 0,
    });
    setErr('');
    setNewImage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  // 切换标签时同步该标签的内置提示词
  useEffect(() => {
    const t = types.find((x) => x.id === form.typeId);
    setBuiltinText(t?.prompt_text || '');
    setBuiltinScene(t?.prompt_scene || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.typeId, types]);

  if (!template) return null;
  const curType = types.find((t) => t.id === form.typeId);

  return (
    <Modal
      open={template !== null}
      title={readOnly ? '查看模板' : '管理模板'}
      width="xl"
      onClose={onClose}
      footer={readOnly ? (
        <button className="btn-soft" onClick={onClose}>关闭</button>
      ) : (
        <>
          <button
            className="mr-auto rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
            onClick={async () => {
              try {
                await api.deleteTemplate(template.id);
                if (onDeleted) await onDeleted();
                else onClose();
              } catch (e) { setErr(e instanceof Error ? e.message : '删除失败'); }
            }}
          >
            删除该模板
          </button>
          <ModalFooter onCancel={onClose} onOk={async () => {
      try {
        await api.updateTemplate(
          template.id,
          {
            name: form.name,
            template_type_id: form.typeId || null,
            text_style_prompt: form.prompt,
            scene_prompt: curType?.path_kind === 'B' ? form.scene : null,
            project_id: form.projectId || null,
          },
          newImage
        );
        if (canEditBuiltin && curType && (builtinText !== (curType.prompt_text || '') || builtinScene !== (curType.prompt_scene || ''))) {
          await api.updateTemplateType(curType.id, { prompt_text: builtinText, prompt_scene: builtinScene });
        }
        await onDone();
      } catch (e) { setErr(e instanceof Error ? e.message : '保存失败'); }
    }} />
        </>
      )}
    >
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-2">
          <span className="label">{readOnly ? '模板底图' : '模板底图（可替换）'}</span>
          <div className="aspect-[3/4] w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
            <img
              src={newImage ? URL.createObjectURL(newImage) : template.url}
              alt=""
              className="h-full w-full object-contain"
            />
          </div>
          {/* 上传替换底图属于「修改」权限 */}
          {!readOnly && (
            <>
              <button className="btn-soft w-full" onClick={() => imgRef.current?.click()}>
                {newImage ? `已选择新底图：${newImage.name}` : '上传替换底图'}
              </button>
              <input
                ref={imgRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { setNewImage(e.target.files?.[0] ?? null); e.target.value = ''; }}
              />
              {newImage && (
                <button className="btn-soft w-full" onClick={() => setNewImage(null)}>取消替换（保留原底图）</button>
              )}
            </>
          )}
        </div>
        <div className="grid gap-3">
        <label className="label">名称<input className="input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="label">模板标签
          <select className="input mt-1" value={form.typeId} onChange={(e) => setForm({ ...form, typeId: Number(e.target.value) })}>
            {types.map((t) => <option key={t.id} value={t.id} style={{ color: t.path_kind === 'B' ? '#fbbf24' : '#7dd3fc' }}>{t.name}</option>)}
          </select>
        </label>
        {/* 顺序：背景提示词 → 背景内置提示词 → 文字样式提示词 → 文字内置提示词（A 路径标签不显示前两项） */}
        {curType?.path_kind === 'B' && (
          <label className="label text-amber-300">背景提示词（本模板，先生成背景）
            <textarea className="input mt-1 min-h-[56px] text-xs" value={form.scene} onChange={(e) => setForm({ ...form, scene: e.target.value })} rows={3} />
          </label>
        )}
        {curType?.path_kind === 'B' && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-300">背景内置提示词</span>
              <span className="text-[10px] text-zinc-500">{canEditBuiltin ? '可修改（保存后同步到该模板标签）' : '仅可查看（需要管理员权限才能修改）'}</span>
            </div>
            {canEditBuiltin ? (
              <textarea
                className="input min-h-[56px] text-xs text-zinc-400"
                value={builtinScene}
                onChange={(e) => setBuiltinScene(e.target.value)}
                placeholder="该模板标签的内置背景提示词（选填）"
                rows={2}
              />
            ) : (
              <div className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-500">{curType.prompt_scene || '（无）'}</div>
            )}
          </div>
        )}
        <label className="label text-indigo-300">文字样式提示词（可留空）
          <textarea className="input mt-1 min-h-[64px] text-xs" value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} rows={3} />
        </label>
        {!!curType && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-300">文字内置提示词</span>
              <span className="text-[10px] text-zinc-500">{canEditBuiltin ? '可修改（保存后同步到该模板标签，本标签下所有模板通用）' : '仅可查看（需要管理员权限才能修改）'}</span>
            </div>
            {canEditBuiltin ? (
              <textarea
                className="input min-h-[72px] text-xs text-zinc-400"
                value={builtinText}
                onChange={(e) => setBuiltinText(e.target.value)}
                placeholder="该模板标签的内置提示词（画布中会显示在模板提示词下方，用户可改）"
                rows={3}
              />
            ) : (
              <div className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-500">{curType.prompt_text || '（无）'}</div>
            )}
          </div>
        )}
        <div className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <span className="label !mb-0">模板为通用模板 / 项目专属模板（先归属产品，再选项目）</span>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className="input"
              value={form.brandId}
              onChange={(e) => setForm({ ...form, brandId: Number(e.target.value), projectId: 0 })}
            >
              <option value={0}>请选择品牌</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select
              className="input"
              value={form.projectId}
              disabled={!form.brandId}
              onChange={(e) => setForm({ ...form, projectId: Number(e.target.value) })}
            >
              <option value={0}>通用模板（全部）</option>
              {projects.filter((p) => p.brand_id === form.brandId).map((p) => <option key={p.id} value={p.id}>专属 · {p.name}</option>)}
            </select>
          </div>
        </div>
        {err && <div className="text-xs text-red-400">{err}</div>}
        </div>
      </div>
    </Modal>
  );
}

/* ==================== AI 配置 / 站点设置 ==================== */
function AiTab() {
  const [cfg, setCfg] = useState<AiConfigView | null>(null);
  const [form, setForm] = useState({ endpoint: '', api_key: '', model: '', timeout_ms: 180000 });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.getAiConfig().then((r) => {
      setCfg(r.config);
      setForm({ endpoint: r.config.endpoint, api_key: '', model: r.config.model, timeout_ms: r.config.timeout_ms });
    });
  }, []);

  async function save() {
    await api.updateAiConfig(form);
      setMsg('已保存 ✓');
    api.getAiConfig().then((r) => setCfg(r.config));
  }

  return (
    <Section title="AI 服务配置" desc="用于生成场景背景与文字样式。">
      <Card>
        <div className="grid max-w-lg gap-3">
          <label className="label">API 地址<input className="input mt-1" value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} /></label>
          <label className="label">API Key {cfg?.has_key && <span className="text-green-500">（已配置，留空保持不变）</span>}<input className="input mt-1" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder="sk-..." /></label>
          <label className="label">模型<input className="input mt-1" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></label>
          <label className="label">超时时间（毫秒）<input className="input mt-1" type="number" value={form.timeout_ms} onChange={(e) => setForm({ ...form, timeout_ms: Number(e.target.value) })} /></label>
          <div className="flex items-center gap-3">
            <button className="btn-primary !w-32" onClick={save}>保存配置</button>
            {msg && <span className="text-sm text-green-400">{msg}</span>}
          </div>
        </div>
      </Card>
    </Section>
  );
}

function SettingsTab() {
  const [form, setForm] = useState({ site_title: '', page_title: '', logo_url: '', footer_text: '' });
  const [msg, setMsg] = useState('');
  const logoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getSettings().then((r) => setForm({ site_title: r.settings.site_title, page_title: r.settings.page_title || '封面三层设计工具', logo_url: r.settings.logo_url || '', footer_text: r.settings.footer_text || '' }));
  }, []);

  async function save() {
    await api.updateSettings(form);
    // 网页名称（浏览器标签）立即生效
    if (form.page_title) document.title = form.page_title;
    setMsg('已保存 ✓');
  }
  async function uploadLogo(file: File) {
    const { url } = await api.upload(file);
    setForm((f) => ({ ...f, logo_url: url }));
  }

  return (
    <Section title="站点设置" desc="网页名称（打开网页时浏览器标签上的名字）/ 首页标题 / Logo / 备案信息。">
      <Card>
        <div className="grid max-w-lg gap-3">
          <label className="label">网页名称（打开网页时浏览器标签上的名字）
            <input className="input mt-1" value={form.page_title} onChange={(e) => setForm({ ...form, page_title: e.target.value })} placeholder="如：封面三层设计工具" />
            <span className="mt-1 block text-[11px] text-zinc-500">默认「封面三层设计工具」；保存后立即生效（所有页面）。</span>
          </label>
          <label className="label">首页标题<input className="input mt-1" value={form.site_title} onChange={(e) => setForm({ ...form, site_title: e.target.value })} /></label>
          <label className="label">Logo
            <div className="mt-1 flex items-center gap-2">
              <input className="input" value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="Logo 图片 URL" />
              <button className="btn-soft shrink-0" onClick={() => logoRef.current?.click()}>上传</button>
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void uploadLogo(f);
              }} />
            </div>
            {form.logo_url && <img src={form.logo_url} alt="logo" className="mt-2 h-12 max-w-[200px] rounded-lg bg-zinc-950 object-contain p-1" />}
          </label>
          <label className="label">网站尾部备案信息<input className="input mt-1" value={form.footer_text} onChange={(e) => setForm({ ...form, footer_text: e.target.value })} placeholder="如：© 2026 小红书素材设计 · 京ICP备xxxxxx号" /></label>
          <div className="flex items-center gap-3">
            <button className="btn-primary !w-32" onClick={save}>保存设置</button>
            {msg && <span className="text-sm text-green-400">{msg}</span>}
          </div>
        </div>
      </Card>

      {/* 提示语 / 引导语：超管可改前端与后端的全部提示文案 */}
      <div className="mt-6">
        <UiTextsManager />
      </div>
    </Section>
  );
}

/** 提示语 / 引导语管理（仅超管可见）：留空 = 恢复默认 */
function UiTextsManager() {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listUiTexts()
      .then((r) => { setOverrides(r.texts || {}); setDraft(r.texts || {}); })
      .catch(() => {});
  }, []);

  function flash(t: string) { setMsg(t); window.setTimeout(() => setMsg(''), 2600); }

  const groups: { label: string; prefix: string }[] = [
    { label: '首页', prefix: 'home.' },
    { label: '画布（前端设计器）', prefix: 'designer.' },
    { label: '素材大类 / 选用提示', prefix: 'asset.' },
    { label: '后台各页说明', prefix: 'admin.' },
  ];

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-zinc-200">提示语 / 引导语</span>
        <span className="text-[11px] text-zinc-500">超管可修改前端与后端所有页面的提示语；把内容清空即恢复默认文案。</span>
        <span className="ml-auto flex items-center gap-2">
          {msg && <span className="text-xs text-amber-400">{msg}</span>}
          <button
            className="btn-primary !px-3 !py-1.5 text-xs"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api.saveUiTexts(draft);
                setOverrides(r.texts || {});
                setDraft(r.texts || {});
                flash('已保存 ✓');
              } catch (e) { flash(e instanceof Error ? e.message : '保存失败'); }
              finally { setBusy(false); }
            }}
          >保存提示语</button>
        </span>
      </div>
      <div className="grid gap-4">
        {groups.map((g) => (
          <div key={g.prefix} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="mb-2 text-xs font-semibold text-zinc-300">{g.label}</div>
            <div className="grid gap-2">
              {Object.keys(UI_TEXT_DEFAULTS).filter((k) => k.startsWith(g.prefix)).map((k) => (
                <label key={k} className="grid gap-1">
                  <span className="text-[11px] text-zinc-500">{k}{overrides[k] ? '（已自定义）' : ''}</span>
                  <textarea
                    className="input min-h-[44px] text-xs"
                    rows={2}
                    value={draft[k] ?? ''}
                    placeholder={UI_TEXT_DEFAULTS[k]}
                    onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}




