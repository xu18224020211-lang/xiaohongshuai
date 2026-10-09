import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useUiTexts } from '../lib/uiTexts';
import { useAuth } from '../store/auth';
import { canBrowseAllProjects } from '../lib/types';
import AssetKindBar, { type AssetKind } from './AssetKindBar';
import type { Asset, AssetTag, AssetType, AssetTypeDef, Brand, Category, Model, Project } from '../lib/types';

/** 路径 A 默认底图、路径 B 默认产品图（保留给旧调用） */
export const defaultAssetTypeFor = (path: 'A' | 'B'): AssetType => (path === 'B' ? 'product' : 'scene');

/**
 * 从素材库选择（画布左侧调用）
 * - 默认展示「用户权限内的所有通用素材 + 专属素材」
 * - 左侧：选择品牌 → 选择项目（选品牌=该品牌通用+专属；选项目=该项目专属）
 * - 右侧：选择素材类型 / 选择素材标签（默认都是全部，不默认底图）
 * - 分页：每页 4×5 = 20 个
 */
export default function MaterialPicker({
  type, open, onClose, onPick,
}: {
  type: AssetType;
  open: boolean;
  onClose: () => void;
  onPick: (asset: Asset) => void;
}) {
  const T = useUiTexts();
  const user = useAuth((s) => s.user);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [types, setTypes] = useState<AssetTypeDef[]>([]);
  const [productTags, setProductTags] = useState<AssetTag[]>([]);
  const [stickerTags, setStickerTags] = useState<AssetTag[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  // 大类：默认显示「产品类」（画布左侧从素材库选择）
  const [kind, setKind] = useState<AssetKind>('product');
  const [fTag, setFTag] = useState<number | 0>(0);
  const [fBrand, setFBrand] = useState<number>(0);
  const [fCat, setFCat] = useState<number>(0);
  const [fModel, setFModel] = useState<number>(0);
  const [fProject, setFProject] = useState<number>(0);
  const [page, setPage] = useState(1);
  /** 每页 3×5 = 15 个 */
  const PER_PAGE = 15;

  useEffect(() => {
    if (!open) return;
    setFTag(0);
    setFBrand(0);
    setFCat(0);
    setFModel(0);
    setFProject(0);
    setPage(1);
    // 打开时默认「产品类」
    setKind('product');
    // 部门主管 / 部门成员可浏览全部品牌与项目（只读）
    const browseAll = canBrowseAllProjects(user?.role);
    api.listAssetTypes().then((r) => setTypes(r.types)).catch(() => setTypes([]));
    api.listAssetTags('product').then((r) => setProductTags(r.tags)).catch(() => setProductTags([]));
    api.listAssetTags('sticker').then((r) => setStickerTags(r.tags)).catch(() => setStickerTags([]));
    api.listBrands(browseAll).then((r) => setBrands(r.brands)).catch(() => setBrands([]));
    api.listCategories(undefined, browseAll).then((r) => setCats(r.categories)).catch(() => setCats([]));
    api.listModels({ all: browseAll }).then((r) => setModels(r.models)).catch(() => setModels([]));
    api.listProjects(undefined, undefined, undefined, browseAll).then((r) => setProjects(r.projects)).catch(() => setProjects([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const projOptions = useMemo(
    () => (fBrand ? projects.filter((p) => p.brand_id === fBrand) : projects),
    [projects, fBrand]
  );

  useEffect(() => {
    if (!open) return;
    // 默认全部（通用 + 权限内专属）；选了具体项目 → 只看该项目专属
    api
      .listAssets({
        tag_id: fTag || undefined,
        scope: fProject ? 'project' : 'all',
        project_id: fProject || undefined,
      })
      .then((r) => setAssets(r.assets))
      .catch(() => setAssets([]));
    setPage(1);
  }, [open, fTag, fProject]);

  const list = useMemo(() => {
    // 大类：产品类 = 产品图；贴图类 = 底图 / 贴纸（贴图类不按品牌过滤）
    let out = kind === 'product' ? assets.filter((a) => a.type === 'product') : assets.filter((a) => a.type !== 'product');
    if (kind === 'product' && !fProject) {
      if (fBrand) out = out.filter((a) => a.brand_id === fBrand);
      if (fCat) out = out.filter((a) => a.category_id === fCat);
      if (fModel) out = out.filter((a) => a.model_id === fModel);
    }
    return out;
  }, [assets, kind, fBrand, fCat, fModel, fProject]);
  const pageCount = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const curPage = Math.min(page, pageCount);
  const pageItems = list.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);

  if (!open) return null;

  const typeName = (code: string) =>
    types.find((t) => t.code === code)?.name
    || (code === 'product' ? '产品图' : code === 'sticker' ? '贴纸' : code === 'scene' ? '底图' : code);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-[64rem] flex-col rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold text-white">从素材库选择</span>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded text-zinc-400 transition hover:bg-zinc-800 hover:text-white">✕</button>
        </div>
        <p className="mb-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-[11px] text-zinc-400">
          {T('designer.picker.hint')}
        </p>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <AssetKindBar
            kind={kind}
            onKindChange={(k) => { setKind(k); setFTag(0); setFProject(0); }}
            brands={brands} cats={cats} models={models}
            productTags={productTags} stickerTags={stickerTags}
            brand={fBrand} cat={fCat} model={fModel} tagId={fTag}
            onBrand={(v) => { setFBrand(v); setFCat(0); setFModel(0); setFProject(0); }}
            onCat={(v) => { setFCat(v); setFModel(0); }}
            onModel={setFModel}
            onTag={setFTag}
            projects={projects}
            projectId={fProject}
            onProject={setFProject}
            compact
            layout="stack"
          />
          <span className="ml-auto text-[11px] text-zinc-500">共 {list.length} 个 · 第 {curPage}/{pageCount} 页</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* 每页 3×5 = 15 个；预览统一 3:4 */}
          <div className="grid grid-cols-3 gap-2 md:grid-cols-5">            {pageItems.map((a) => (
              <button
                key={a.id}
                onClick={() => onPick(a)}
                className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 transition hover:border-indigo-500"
              >
                <span className="relative block aspect-[3/4] w-full overflow-hidden">
                  <img src={a.url} alt="" className="h-full w-full object-cover" />
                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-zinc-200">
                    {typeName(a.type)}
                  </span>
                  <span className={`absolute right-1 top-1 rounded px-1.5 py-0.5 text-[10px] ${a.project_id ? 'bg-amber-500/80 text-black' : 'bg-emerald-600/80 text-white'}`}>
                    {a.project_id ? `「${a.project_name || '项目'}」专属` : '通用'}
                  </span>
                </span>
                {(a.tags || []).length > 0 && (
                  <span className="flex flex-wrap gap-1 px-1.5 py-1">
                    {(a.tags || []).map((t) => (
                      <span key={t.id} className="rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-indigo-300">{t.name}</span>
                    ))}
                  </span>
                )}
              </button>
            ))}
            {list.length === 0 && (
              <div className="col-span-full py-10 text-center text-sm text-zinc-600">暂无素材（可换品牌 / 项目或清空筛选）</div>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-center gap-1.5">
          <button className="btn-soft !px-2.5 !py-1 text-xs disabled:opacity-40" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>上一页</button>
          {Array.from({ length: pageCount }).slice(0, 12).map((_, i) => (
            <button key={i} onClick={() => setPage(i + 1)} className={`h-7 min-w-7 rounded px-2 text-xs transition ${curPage === i + 1 ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>{i + 1}</button>
          ))}
          {pageCount > 12 && <span className="text-xs text-zinc-500">…共 {pageCount} 页</span>}
          <button className="btn-soft !px-2.5 !py-1 text-xs disabled:opacity-40" disabled={curPage >= pageCount} onClick={() => setPage(curPage + 1)}>下一页</button>
        </div>
      </div>
    </div>
  );
}
