import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUi } from '../store/ui';
import { useAuth } from '../store/auth';
import { api, apiUrl } from '../lib/api';
import { useUiTexts } from '../lib/uiTexts';
import EditableHint from '../components/EditableHint';
import { isSmartRefType } from '../lib/smartRef';
import { canBrowseAllProjects } from '../lib/types';
import { useIsMobileLayout } from '../store/viewMode';
import type { Brand, Project, Template, TemplateType } from '../lib/types';

const TYPE_LABEL: Record<string, string> = { A: '底图压字', B: '产品-背景-压字' };

const RED = '#ff2442';

export default function Home() {
  const T = useUiTexts();
  const user = useAuth((s) => s.user);
  const projectId = useUi((s) => s.projectId);
  const setProjectId = useUi((s) => s.setProjectId);
  const navigate = useNavigate();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [types, setTypes] = useState<TemplateType[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState('小红书素材设计');
  const [busy, setBusy] = useState(true);
  const isMobileLayout = useIsMobileLayout();

  // 右上角两级筛选：品牌 → 项目（都按用户权限返回；默认：全部）
  const [typeId, setTypeId] = useState(0);
  const [selBrand, setSelBrand] = useState<number>(0);
  const [selProj, setSelProj] = useState<number>(0);
  const [autoPicked, setAutoPicked] = useState(false);

  useEffect(() => {
    const browseAll = canBrowseAllProjects(user?.role);
    api.getSettings().then((r) => setTitle(r.settings.site_title || '小红书素材设计')).catch(() => {});
    api.listBrands(browseAll).then((r) => setBrands(r.brands)).catch(() => {});
    // 部门主管 / 部门成员可浏览全部项目（只读），项目经理仍只看到自己负责的项目
    api.listProjects(undefined, undefined, undefined, browseAll).then((r) => setProjects(r.projects)).catch(() => {});
  }, [user?.role]);

  /**
   * 默认选中：
   * 1) 只有一个可见项目（项目经理 / 普通用户）→ 默认选中该品牌与该项目
   * 2) 否则若已有记忆中的项目 → 选中它所属品牌与该项目
   */
  useEffect(() => {
    if (autoPicked || !projects.length) return;
    if (projects.length === 1) {
      setSelBrand(projects[0].brand_id);
      setSelProj(projects[0].id);
      setProjectId(projects[0].id);
      setAutoPicked(true);
      return;
    }
    if (projectId && projects.some((p) => p.id === projectId)) {
      const p = projects.find((x) => x.id === projectId)!;
      setSelBrand(p.brand_id);
      setSelProj(p.id);
      setAutoPicked(true);
    }
  }, [projects, projectId, autoPicked, setProjectId]);

  // 默认拉取权限范围内的“全部模板”+ 模板标签（标签也按权限返回）
  useEffect(() => {
    setBusy(true);
    Promise.all([api.listTemplates(), api.listTemplateTypes()])
      .then(([t, tt]) => {
        setTemplates(t.references);
        setTypes(tt.types);
      })
      .catch(() => {
        setTemplates([]);
        setTypes([]);
      })
      .finally(() => setBusy(false));
  }, []);

  // 级联：品牌 → 项目（不需要中间的产品级别）
  const projOptions = useMemo(
    () => (selBrand ? projects.filter((p) => p.brand_id === selBrand) : projects),
    [projects, selBrand]
  );

  // 标签全部展示（含暂无模板的新标签，数量为 0）；「智能参考」固定排第一
  const typeOptions = useMemo(() => {
    const list = [...types];
    list.sort((a, b) => {
      const sa = isSmartRefType(a) ? 0 : 1;
      const sb = isSmartRefType(b) ? 0 : 1;
      return sa - sb;
    });
    return list;
  }, [types]);

  const filtered = useMemo(() => {
    let list = templates;
    // 1) 模板标签
    if (typeId) list = list.filter((t) => t.template_type_id === typeId);
    // 2) 通用模板（未归属项目）+ 对应范围的专属模板
    if (selProj) {
      // 精确到项目：通用 + 该项目专属
      list = list.filter((t) => t.project_id == null || t.project_id === selProj);
    } else if (selBrand) {
      // 精确到品牌：通用 + 该品牌（及其下级项目）的专属
      list = list.filter((t) => t.project_id == null || t.brand_id === selBrand);
    }
    // 3)「智能参考」模板固定排第一个
    return [...list].sort((a, b) => {
      const sa = isSmartRefType({ name: a.template_type_name }) ? 0 : 1;
      const sb = isSmartRefType({ name: b.template_type_name }) ? 0 : 1;
      return sa - sb;
    });
  }, [templates, typeId, selBrand, selProj]);

  function chooseProject(id: number) {
    setSelProj(id);
    if (id) setProjectId(id);
  }

  /** 进入画布：模板若绑定项目，则自动切到该项目，保证保存/素材权限正确 */
  function openTemplate(t: Template) {
    if (t.project_id) setProjectId(t.project_id);
    navigate(`/designer?reference_id=${t.id}`);
  }

  const selectCls =
    'rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 transition hover:border-zinc-600 focus:border-[color:var(--red)] outline-none';

  /** 移动端：下拉更小、字号更小，避免占掉横向空间 */
  const mobileSelectCls =
    'min-w-0 rounded-lg border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-200 outline-none focus:border-[color:var(--red)]';

  return (
    <div className="h-full overflow-y-auto" style={{ ['--red' as never]: RED }}>
      <div className={`mx-auto max-w-[1600px] ${isMobileLayout ? 'px-3 py-3' : 'px-4 py-6 md:px-6'}`}>
        {/* Hero：小红书红风格 */}
        <div
          className={`relative mb-6 overflow-hidden rounded-3xl border border-zinc-800 ${isMobileLayout ? 'mb-3 rounded-2xl px-4 py-4' : 'px-6 py-8 md:px-10 md:py-10'}`}
          style={{ background: 'linear-gradient(135deg, #2a0d14 0%, #1b1b1f 45%, #241019 100%)' }}
        >
          <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full blur-3xl" style={{ background: 'rgba(255,36,66,0.28)' }} />
          <div className="pointer-events-none absolute -bottom-24 right-10 h-64 w-64 rounded-full blur-3xl" style={{ background: 'rgba(255,36,66,0.16)' }} />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ background: RED }}>
                ✦ RED Style · 封面模板
              </span>
              <h1 className={`mt-3 font-extrabold tracking-tight text-white ${isMobileLayout ? 'text-xl' : 'text-3xl md:text-4xl'}`}><EditableHint k="home.title" /></h1>
              <p className={`mt-2 text-zinc-400 ${isMobileLayout ? 'text-xs' : 'text-sm md:text-base'}`}>
                <EditableHint k="home.subtitle" />
              </p>
            </div>

            {/* 右上角：品牌 → 项目 两级筛选（PC / 手机端切换已移除，自动识别设备） */}
            <div className="flex flex-wrap items-center gap-2">
              <select className={`${isMobileLayout ? mobileSelectCls : selectCls}`} value={selBrand} onChange={(e) => { setSelBrand(Number(e.target.value)); setSelProj(0); }}>
                <option value={0}>品牌（全部）</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <select className={`${isMobileLayout ? mobileSelectCls : selectCls}`} value={selProj} onChange={(e) => chooseProject(Number(e.target.value))}>
                <option value={0}>{selBrand ? '项目（该品牌全部）' : '项目（全部）'}</option>
                {projOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* 模板标签筛选：PC 与手机都用按钮行（手机端按钮与字号更小） */}
        <div className={`flex flex-wrap items-center ${isMobileLayout ? 'mb-3 gap-1.5' : 'mb-5 gap-2'}`}>
          <button
            onClick={() => setTypeId(0)}
            className={`rounded-full font-semibold transition ${isMobileLayout ? 'px-2.5 py-0.5 text-[11px]' : 'px-4 py-1.5 text-sm'} ${typeId === 0 ? 'text-white shadow-lg' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
            style={typeId === 0 ? { background: RED, boxShadow: '0 8px 24px rgba(255,36,66,0.28)' } : undefined}
          >
            全部模板
          </button>
          {typeOptions.map((t) => {
            const active = typeId === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTypeId(t.id)}
                className={`rounded-full font-semibold transition ${isMobileLayout ? 'px-2.5 py-0.5 text-[11px]' : 'px-4 py-1.5 text-sm'} ${active ? 'text-white shadow-lg' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                style={active ? { background: RED, boxShadow: '0 8px 24px rgba(255,36,66,0.28)' } : undefined}
              >
                {t.name}
                <span className={`ml-1.5 font-normal ${isMobileLayout ? 'text-[9px]' : 'text-[11px]'} ${active ? 'text-white/80' : 'text-zinc-500'}`}>{t.template_count ?? 0}</span>
              </button>
            );
          })}
          <span className={`text-zinc-500 ${isMobileLayout ? 'ml-1 text-[10px]' : 'ml-2 text-xs'}`}>
            {isMobileLayout ? `${filtered.length} 个` : `共 ${filtered.length} 个模板`}
          </span>
        </div>

        {busy ? (
          <div className="py-16 text-center text-zinc-500">加载中…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-16 text-center text-zinc-500">
            {T('home.empty')}
          </div>
        ) : (
          <div className={`grid gap-4 ${isMobileLayout ? 'grid-cols-2 gap-2.5' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
            {filtered.map((t) => {
              const smart = isSmartRefType({ name: t.template_type_name });
              return (
              <div
                key={t.id}
                /* 悬停效果：整张卡片轻微放大 + 保留红色描边与阴影，
                   图片本身不再单独缩放（否则会出现「图放大、标题不动」的割裂感） */
                className="group relative cursor-pointer overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 transition-transform duration-200 ease-out will-change-transform hover:z-10 hover:scale-[1.025] hover:border-[color:var(--red)] hover:shadow-[0_16px_40px_rgba(255,36,66,0.22)]"
                onClick={() => openTemplate(t)}
              >
                {/* 图片容器固定底色，且图片用 block 去掉行内元素基线间隙，
                    否则缩放时底部会露出背景色细线（看起来像白线闪烁） */}
                <div className="relative overflow-hidden bg-zinc-950">
                  <img
                    src={apiUrl(t.url)}
                    alt={t.name || ''}
                    className="block w-full"
                    loading="lazy"
                  />
                  <span
                    className={`absolute left-1.5 top-1.5 rounded-full font-semibold text-white ${isMobileLayout ? 'px-1.5 py-0 text-[9px]' : 'px-2 py-0.5 text-[10px]'}`}
                    style={{ background: RED }}
                  >
                    {t.template_type_name || TYPE_LABEL[t.kind] || '底图压字'}
                  </span>
                  {t.project_id != null ? (
                    <span className={`absolute right-1.5 top-1.5 rounded-full bg-black/70 text-zinc-200 ${isMobileLayout ? 'px-1.5 py-0 text-[9px]' : 'px-2 py-0.5 text-[10px]'}`}>
                      「{t.project_name || '项目'}」专属
                    </span>
                  ) : (
                    <span className={`absolute right-1.5 top-1.5 rounded-full bg-black/70 text-zinc-200 ${isMobileLayout ? 'px-1.5 py-0 text-[9px]' : 'px-2 py-0.5 text-[10px]'}`}>通用</span>
                  )}
                  <div className="absolute inset-0 hidden items-center justify-center bg-gradient-to-t from-black/75 via-black/25 to-transparent opacity-0 transition group-hover:opacity-100 sm:flex">
                    {/* 智能参考是唯一特例：悬浮按钮文案改为「智能参考」 */}
                    <span className="rounded-full px-5 py-2.5 text-sm font-bold text-white" style={{ background: RED }}>
                      {smart ? T('designer.smartRef') : T('home.cta')}
                    </span>
                  </div>
                </div>
                <div className={isMobileLayout ? 'p-2' : 'p-3'}>
                  <div className={`truncate font-semibold text-zinc-100 group-hover:text-white ${isMobileLayout ? 'text-xs' : 'text-sm'}`}>{t.name}</div>
                  <div className={`mt-1 line-clamp-2 text-zinc-500 ${isMobileLayout ? 'text-[10px]' : 'text-xs'}`}>{t.text_style_prompt}</div>
                  <button
                    onClick={(e) => { e.stopPropagation(); openTemplate(t); }}
                    className={`mt-2 w-full rounded-xl font-semibold text-white sm:hidden ${isMobileLayout ? 'py-1.5 text-[11px]' : 'py-2 text-xs'}`}
                    style={{ background: RED }}
                  >
                    {smart ? T('designer.smartRef') : '设计'}
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
