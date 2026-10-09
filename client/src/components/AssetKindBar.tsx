import type { AssetTag, Brand, Category, Model, Project } from '../lib/types';
import { useUiTexts } from '../lib/uiTexts';

export type AssetKind = 'product' | 'sticker';

/** 大类名称默认值（超管可在「后台 → 素材 → 管理素材标签」里改名，前端同步） */
export const ASSET_KIND_LABEL: Record<AssetKind, string> = { product: '产品类', sticker: '贴图类' };

/**
 * 素材大类筛选条（一行内）：【产品类】【贴图类】+ 当前大类的下拉 + 靠右的项目专属勾选框。
 * - 产品类：品牌 → 类别 → 型号（按品牌级数联动：父级未选则子级不可选）→ 标签
 * - 贴图类：只有标签（没有项目勾选框）
 * - 选中某个品牌时，右侧显示该品牌下项目数量的「○ XXX项目专属」勾选框；未选品牌不显示。
 */
export default function AssetKindBar({
  kind, onKindChange,
  brands, cats, models, productTags, stickerTags,
  brand, cat, model, tagId,
  onBrand, onCat, onModel, onTag,
  projects = [], projectId = 0, onProject,
  compact = false, layout = 'row',
}: {
  kind: AssetKind;
  onKindChange: (k: AssetKind) => void;
  brands: Brand[];
  cats: Category[];
  models: Model[];
  productTags: AssetTag[];
  stickerTags: AssetTag[];
  brand: number;
  cat: number;
  model: number;
  tagId: number;
  onBrand: (v: number) => void;
  onCat: (v: number) => void;
  onModel: (v: number) => void;
  onTag: (v: number) => void;
  /** 用于右侧「XXX项目专属」勾选框的项目列表 */
  projects?: Project[];
  projectId?: number;
  onProject?: (v: number) => void;
  compact?: boolean;
  /** row＝大类按钮与下拉同一行；stack＝第一排大类按钮、下方依次是下拉与勾选框（窄栏用） */
  layout?: 'row' | 'stack';
}) {
  const T = useUiTexts();
  const isProduct = kind === 'product';
  const cls = compact ? 'input !w-[6.8rem] !px-2 !py-1.5 text-xs' : 'input !w-32 !px-2 !py-1.5 text-sm';
  const btnCls = (on: boolean) =>
    `shrink-0 rounded-xl font-semibold transition ${
      compact ? 'px-3.5 py-1.5 text-sm' : 'px-4 py-2 text-base'
    } ${
      on
        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/40 ring-1 ring-indigo-400'
        : 'border border-zinc-600 bg-zinc-800/60 text-zinc-400 hover:border-zinc-400 hover:text-zinc-200'
    }`;
  const catList = cats.filter((c) => (brand ? c.brand_id === brand : true));
  const modelList = models.filter((m) => (cat ? m.category_id === cat : true));
  const brandLevel = brands.find((b) => b.id === brand)?.product_level === 2 ? 2 : 3;
  const brandProjects = brand ? projects.filter((p) => p.brand_id === brand) : [];

  return (
    <div className={layout === 'stack' ? 'flex flex-col gap-1.5' : 'flex flex-wrap items-center gap-2'}>
      <div className="flex items-center gap-2">
        <button type="button" className={btnCls(isProduct)} onClick={() => onKindChange('product')}>{T('asset.kind.product')}</button>
        <button type="button" className={btnCls(!isProduct)} onClick={() => onKindChange('sticker')}>{T('asset.kind.sticker')}</button>
      </div>

      <div className={layout === 'stack' ? 'flex flex-wrap items-center gap-1.5' : 'contents'}>
        {isProduct ? (
          <>
            <select className={cls} value={brand} onChange={(e) => onBrand(Number(e.target.value))} title="选择品牌">
              <option value={0}>选择品牌</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select className={cls} value={cat} disabled={!brand} onChange={(e) => onCat(Number(e.target.value))} title="选择产品">
              <option value={0}>{brandLevel === 2 ? '选择产品' : '选择类别'}</option>
              {catList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {brandLevel === 3 && (
              <select className={cls} value={model} disabled={!brand || !cat} onChange={(e) => onModel(Number(e.target.value))} title="选择型号">
                <option value={0}>选择型号</option>
                {modelList.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
            <select className={cls} value={tagId} disabled={!brand} onChange={(e) => onTag(Number(e.target.value))} title="选择标签">
              <option value={0}>{T('asset.tagPlaceholder.product')}</option>
              {productTags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </>
        ) : (
          <select className={cls} value={tagId} onChange={(e) => onTag(Number(e.target.value))} title="选择标签">
            <option value={0}>{T('asset.tagPlaceholder.sticker')}</option>
            {stickerTags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {/* 「XXX项目专属」圆点勾选框：左侧对齐；未选品牌 / 贴图类都不显示 */}
      {isProduct && brandProjects.length > 0 && onProject && (
        <span className={layout === 'stack' ? 'flex flex-wrap items-center gap-2' : 'ml-auto flex flex-wrap items-center gap-2'}>
          {brandProjects.map((p) => {
            const on = projectId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onProject(on ? 0 : p.id)}
                title={on ? '取消只看该项目专属素材' : '只看该项目专属素材'}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition ${
                  on ? 'border-amber-500 bg-amber-500/20 text-amber-100' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'
                }`}
              >
                <span className={`grid h-3 w-3 place-items-center rounded-full border ${on ? 'border-amber-300' : 'border-zinc-500'}`}>
                  {on && <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />}
                </span>
                {p.name}项目专属
              </button>
            );
          })}
        </span>
      )}
    </div>
  );
}
