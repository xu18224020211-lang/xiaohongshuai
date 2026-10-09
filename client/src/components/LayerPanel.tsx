import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDesign } from '../store/design';
import { useAuth } from '../store/auth';
import { api, apiUrl } from '../lib/api';
import AssetKindBar, { type AssetKind } from './AssetKindBar';
import { useUiTexts } from '../lib/uiTexts';
import { loadImageSize } from '../lib/image';
import { roleLevel, canBrowseAllProjects } from '../lib/types';
import { buildLayerEntries } from '../lib/layers';
import { ratioForSize } from '../lib/canvasSizes';
import EditableHint from './EditableHint';
import type { Asset, AssetTag, AssetTypeDef, Brand, Category, Generation, Model, OverlayItem, Project } from '../lib/types';
import { defaultAssetTypeFor } from './MaterialPicker';

type Tab = 'layers' | 'assets' | 'history';

/**
 * 图层「上锁 / 解锁」：一个矢量图标按钮，不再是两个按钮。
 * - 已上锁 → 显示闭合锁，点击解锁
 * - 未上锁 → 显示打开锁，点击上锁
 * 图标即当前状态，title 说明点击后的动作。
 */
function LockToggle({ locked, onClick }: { locked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={locked ? '点击解锁（解锁后可拖动/缩放）' : '点击上锁（上锁后不可拖动/缩放）'}
      aria-label={locked ? '解锁图层' : '上锁图层'}
      className={`grid h-6 w-6 shrink-0 place-items-center rounded transition ${
        locked
          ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
          : 'text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200'
      }`}
    >
      {locked ? (
        /* 闭合的锁：锁梁扣在锁体上 */
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="10.5" width="16" height="10" rx="2" />
          <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
          <circle cx="12" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      ) : (
        /* 打开的锁：锁梁向右上敞开，表示未上锁 */
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="10.5" width="16" height="10" rx="2" />
          <path d="M8 10.5V7a4 4 0 0 1 7.5-2" />
          <circle cx="12" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      )}
    </button>
  );
}

/** 扁平化删除图标（暗红） */
function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 5.5h13" />
      <path d="M7.5 5.5V4.2c0-.6.5-1.1 1.1-1.1h2.8c.6 0 1.1.5 1.1 1.1v1.3" />
      <path d="M5.2 5.5l.8 9.3c.06.7.65 1.2 1.35 1.2h5.3c.7 0 1.29-.5 1.35-1.2l.8-9.3" />
      <path d="M8.4 8.6v4.6M11.6 8.6v4.6" />
    </svg>
  );
}

/** 眼睛：睁眼=显示，闭眼=隐藏 */
function EyeToggle({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button
      title={visible ? '点击隐藏该图层' : '点击显示该图层'}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`grid h-6 w-6 place-items-center rounded transition ${
        visible ? 'text-emerald-300 hover:bg-zinc-700' : 'text-zinc-600 hover:bg-zinc-700 hover:text-zinc-300'
      }`}
    >
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {visible ? (
          <>
            <path d="M1.6 10S4.9 4.6 10 4.6 18.4 10 18.4 10 15.1 15.4 10 15.4 1.6 10 1.6 10Z" />
            <circle cx="10" cy="10" r="2.4" />
          </>
        ) : (
          <>
            <path d="M2.2 7.4S5 4.8 10 4.8s7.8 2.6 7.8 2.6" />
            <path d="M4.4 8.6 3 11.2M8 8.2 7.4 11.2M12 8.2l.6 3M15.6 8.6l1.4 2.6" />
          </>
        )}
      </svg>
    </button>
  );
}

export default function LayerPanel({
  initialTab = 'layers', compact = false, onHistoryPick,
}: { initialTab?: Tab; compact?: boolean; onHistoryPick?: () => void } = {}) {
  const user = useAuth((s) => s.user);
  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);
  // 所有用户都能看到 图层 / 素材 / 历史（素材与历史按各自权限返回）
  const tabs: [Tab, string][] = [['layers', '图层'], ['assets', '素材'], ['history', '历史']];
  return (
    <aside className="flex h-full flex-col bg-zinc-900">
      {/* 手机端由外层标签切换，这里不再重复显示大标签栏 */}
      {!compact && (
        <div className="flex shrink-0 border-b border-zinc-800">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2.5 text-sm font-medium transition ${
                tab === key ? 'border-b-2 border-indigo-500 bg-zinc-800/50 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'layers' && <LayersTab />}
        {tab === 'assets' && <AssetsTab />}
        {tab === 'history' && <HistoryTab onPick={onHistoryPick} />}
      </div>
    </aside>
  );
}

function LayersTab() {
  const canvasWidth = useDesign((s) => s.canvasWidth);
  const canvasHeight = useDesign((s) => s.canvasHeight);
  const path = useDesign((s) => s.path);
  const puzzle = useDesign((s) => s.puzzle);
  const togglePuzzleVisible = useDesign((s) => s.togglePuzzleVisible);
  const layer1 = useDesign((s) => s.layer1);
  const layer2 = useDesign((s) => s.layer2);
  const layer3 = useDesign((s) => s.layer3);
  const selectedId = useDesign((s) => s.selectedId);
  const select = useDesign((s) => s.select);
  const updateOverlay = useDesign((s) => s.updateOverlay);
  const removeOverlay = useDesign((s) => s.removeOverlay);
  const duplicateOverlay = useDesign((s) => s.duplicateOverlay);
  const bringForward = useDesign((s) => s.bringForward);
  const sendBackward = useDesign((s) => s.sendBackward);
  const toggleLayer1Lock = useDesign((s) => s.toggleLayer1Lock);
  const toggleLayer2Lock = useDesign((s) => s.toggleLayer2Lock);
  const toggleOverlayLock = useDesign((s) => s.toggleOverlayLock);
  const toggleLayer1Visible = useDesign((s) => s.toggleLayer1Visible);
  const toggleLayer2Visible = useDesign((s) => s.toggleLayer2Visible);
  const toggleOverlayVisible = useDesign((s) => s.toggleOverlayVisible);
  const removeLayer1 = useDesign((s) => s.removeLayer1);
  const removeLayer2 = useDesign((s) => s.removeLayer2);
  const removePuzzle = useDesign((s) => s.removePuzzle);
  const updatePuzzle = useDesign((s) => s.updatePuzzle);
  const updateLayer1 = useDesign((s) => s.updateLayer1);
  const updateLayer2 = useDesign((s) => s.updateLayer2);
  // 图层名称：双击可就地修改（默认 图层1、图层2……，不再显示图片名称）
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  /** 图层编号与名称：从底层往上依次为 图层1、图层2、…… */
  const entries = useMemo(
    () => buildLayerEntries({ path, layer1, layer2, puzzle, layer3 }),
    [path, layer1, layer2, puzzle, layer3]
  );
  /** id → 名称（自定义名称优先，否则用「图层N」） */
  const labelOf = useCallback(
    (id: string) => {
      const e = entries.find((x) => x.id === id);
      const custom =
        id === 'layer1' ? layer1?.name : id === 'layer2' ? layer2?.name : id === 'puzzle' ? puzzle?.name : layer3.find((i) => i.id === id)?.name;
      return custom || e?.label || '图层';
    },
    [entries, layer1, layer2, puzzle, layer3]
  );

  const startRename = (id: string, current: string) => { setRenameId(id); setRenameDraft(current); };
  const commitRename = () => {
    const v = renameDraft.trim();
    const id = renameId;
    setRenameId(null);
    if (!id || !v) return;
    if (id === 'layer1') updateLayer1({ name: v });
    else if (id === 'layer2') updateLayer2({ name: v });
    else if (id === 'puzzle') updatePuzzle({ name: v });
    else updateOverlay(id, { name: v });
  };
  /** 双击可改的图层名 */
  const NameLabel = ({ id, text, className = '' }: { id: string; text: string; className?: string }) => (
    renameId === id ? (
      <input
        autoFocus
        className="input !w-40 !py-0.5 !px-1.5 text-xs"
        value={renameDraft}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setRenameDraft(e.target.value)}
        onBlur={commitRename}
        onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenameId(null); }}
      />
    ) : (
      <span
        title="双击可修改图层名称"
        className={`cursor-text text-xs font-medium text-zinc-200 ${className}`}
        onDoubleClick={(e) => { e.stopPropagation(); startRename(id, text); }}
      >{text}</span>
    )
  );

  // 面板展示顺序：从上层往下（最上面是最后一层），与画布叠放直观对应
  const sorted = [...layer3].sort((a, b) => b.z - a.z);
  const selected = layer3.find((i) => i.id === selectedId);
  const cellIndex = selectedId?.startsWith('puzzle:') ? Number(selectedId.split(':')[1]) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 text-xs text-zinc-500">
        <span><EditableHint k="designer.layers.title" inputClassName="input !py-0.5 !px-2 text-[10px] !w-56" /></span>
        <span>{ratioForSize(canvasWidth, canvasHeight)}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        {/* 顶部：文字 / 贴纸（可编辑、随新增往上叠） */}
        {sorted.length > 0 && <div className="pt-0 text-xs font-semibold text-zinc-400">上层 · 文字 / 贴纸（新增自动置顶）</div>}
        {sorted.map((it: OverlayItem) => (
          <div
            key={it.id}
            onClick={() => select(it.id)}
            className={`cursor-pointer rounded-lg border p-2.5 transition ${
              it.id === selectedId ? 'border-indigo-500 bg-indigo-950/30' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">
                  {entries.find((e) => e.id === it.id)?.no ?? ''}
                </span>
                <NameLabel id={it.id} text={labelOf(it.id)} />
              </span>
              <div className="flex items-center gap-1">
                <EyeToggle visible={it.visible !== false} onClick={() => toggleOverlayVisible(it.id)} />
                <LockToggle locked={it.locked} onClick={() => toggleOverlayLock(it.id)} />
                <button
                  title={it.locked ? '图层已锁定，先解锁才能删除' : '删除该元素'}
                  disabled={!!it.locked}
                  className={`grid h-6 w-6 place-items-center rounded transition ${it.locked ? 'cursor-not-allowed text-zinc-600' : 'text-red-800 hover:bg-red-900/40 hover:text-red-500'}`}
                  onClick={(e) => { e.stopPropagation(); removeOverlay(it.id); }}
                ><TrashIcon /></button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
              <button className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300 transition hover:bg-zinc-700" onClick={() => bringForward(it.id)}>上移</button>
              <button className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300 transition hover:bg-zinc-700" onClick={() => sendBackward(it.id)}>下移</button>
              <button className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300 transition hover:bg-zinc-700" onClick={() => duplicateOverlay(it.id)}>复制</button>
              <span className="ml-auto text-[10px] text-zinc-500">透明度 {Math.round(it.opacity * 100)}%</span>
            </div>
          </div>
        ))}

        {/* 中部：产品中间层（仅路径B，倒数第二层）
            整张卡片可点选（包括空白区域），右侧图标有自己的 stopPropagation */}
        {path === 'B' && layer2 && (
          <div
            onClick={() => select('layer2')}
            className={`cursor-pointer rounded-lg border p-2.5 transition ${selectedId === 'layer2' ? 'border-indigo-500 bg-indigo-950/20' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600'}`}
          >
            <div className="flex items-center justify-between">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">
                  {entries.find((e) => e.id === 'layer2')?.no ?? ''}
                </span>
                <NameLabel id="layer2" text={labelOf('layer2')} />
                <span className="shrink-0 text-[10px] text-zinc-500">产品层</span>
              </span>
              {layer2 && (
                <span className="flex items-center gap-1">
                  <EyeToggle visible={layer2.visible !== false} onClick={toggleLayer2Visible} />
                  <LockToggle locked={layer2.locked} onClick={toggleLayer2Lock} />
                  <button
                    title={layer2.locked ? '图层已锁定，先解锁才能删除' : '删除该图层'}
                    disabled={!!layer2.locked}
                    className={`grid h-6 w-6 place-items-center rounded transition ${layer2.locked ? 'cursor-not-allowed text-zinc-600' : 'text-red-800 hover:bg-red-900/40 hover:text-red-500'}`}
                    onClick={(e) => { e.stopPropagation(); removeLayer2(); }}
                  ><TrashIcon /></button>
                </span>
              )}
            </div>
          </div>
        )}

        {/* 拼图容器（拼图+压字）：整张卡片可点选空白处 */}
        {puzzle && (
          <div
            onClick={() => select('puzzle')}
            className={`cursor-pointer rounded-lg border p-2.5 transition ${selectedId === 'puzzle' ? 'border-indigo-500 bg-indigo-950/20' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600'}`}
          >
            <div className="flex items-center justify-between">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">
                  {entries.find((e) => e.id === 'puzzle')?.no ?? ''}
                </span>
                <NameLabel id="puzzle" text={labelOf('puzzle')} />
                <span className="shrink-0 text-[10px] text-zinc-500">{puzzle.count} 拼图</span>
              </span>
              <span className="flex items-center gap-1">
                <EyeToggle visible={puzzle.visible !== false} onClick={togglePuzzleVisible} />
                <button
                  title="删除拼图容器"
                  className="grid h-6 w-6 place-items-center rounded text-red-800 transition hover:bg-red-900/40 hover:text-red-500"
                  onClick={(e) => { e.stopPropagation(); removePuzzle(); }}
                ><TrashIcon /></button>
              </span>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1">
              {puzzle.cells.map((c, i) => (
                <button
                  key={i}
                  onClick={() => select(`puzzle:${i}`)}
                  className={`truncate rounded px-1.5 py-1 text-left text-[10px] transition ${
                    selectedId === `puzzle:${i}` ? 'bg-indigo-600/30 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  第 {i + 1} 格{c ? '' : '（空）'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 底部：场景底层（仅当存在）：整张卡片可点选空白处 */}
        {layer1 && (
          <div
            onClick={() => select('layer1')}
            className={`cursor-pointer rounded-lg border p-2.5 transition ${selectedId === 'layer1' ? 'border-indigo-500 bg-indigo-950/20' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600'}`}
          >
            <div className="flex items-center justify-between">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">
                  {entries.find((e) => e.id === 'layer1')?.no ?? ''}
                </span>
                <NameLabel id="layer1" text={labelOf('layer1')} />
                <span className="shrink-0 text-[10px] text-zinc-500">底图</span>
              </span>
              {layer1 && (
                <span className="flex items-center gap-1">
                  <EyeToggle visible={layer1.visible !== false} onClick={toggleLayer1Visible} />
                  <LockToggle locked={layer1.locked} onClick={toggleLayer1Lock} />
                  <button
                    title={layer1.locked ? '图层已锁定，先解锁才能删除' : '删除该图层'}
                    disabled={!!layer1.locked}
                    className={`grid h-6 w-6 place-items-center rounded transition ${layer1.locked ? 'cursor-not-allowed text-zinc-600' : 'text-red-800 hover:bg-red-900/40 hover:text-red-500'}`}
                    onClick={(e) => { e.stopPropagation(); removeLayer1(); }}
                  ><TrashIcon /></button>
                </span>
              )}
            </div>
          </div>
        )}
        {!layer1 && !layer2 && !puzzle && sorted.length === 0 && (
          <div className="rounded-lg border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-600">
            <EditableHint k="designer.layers.empty" inputClassName="input !py-0.5 !px-2 text-xs !w-64" />
          </div>
        )}
      </div>

      {cellIndex !== null && puzzle?.cells[cellIndex] && (
        <div className="shrink-0 border-t border-zinc-800 p-3">
          <div className="text-xs font-semibold text-zinc-300">拼图第 {cellIndex + 1} 格图片</div>
          <p className="mt-1 text-[10px] text-zinc-500">
            在画布中点击该图可直接拖动 / 用变换控件缩放，图片始终裁剪在格内。
          </p>
        </div>
      )}

      {selected && (
        <div className="shrink-0 border-t border-zinc-800 p-3">
          <div className="mb-2 text-xs font-semibold text-zinc-300">选中元素属性</div>
          <label className="mb-1 flex items-center justify-between text-[11px] text-zinc-400">
            <span>透明度</span>
            <span>{Math.round(selected.opacity * 100)}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={selected.opacity}
            onChange={(e) => updateOverlay(selected.id, { opacity: Number(e.target.value) })}
            className="w-full accent-indigo-500"
          />
        </div>
      )}
    </div>
  );
}

/**
 * 素材：与后台同一素材库，显示「自己权限内的全部素材」
 * - 左侧【品牌 → 项目】：默认显示权限内所有通用 + 专属；选品牌只看该品牌；选项目只看该项目专属
 * - 右侧【类型 → 标签】
 * - 点击素材按类型应用到对应图层
 */
function AssetsTab() {
  const T = useUiTexts();
  const user = useAuth((s) => s.user);
  const path = useDesign((s) => s.path);
  const canvasWidth = useDesign((s) => s.canvasWidth);
  const addOverlay = useDesign((s) => s.addOverlay);
  const setLayer1 = useDesign((s) => s.setLayer1);
  const setLayer2 = useDesign((s) => s.setLayer2);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [types, setTypes] = useState<AssetTypeDef[]>([]);
  const [productTags, setProductTags] = useState<AssetTag[]>([]);
  const [stickerTags, setStickerTags] = useState<AssetTag[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  // 大类：产品类 / 贴图类（只能二选一）
  const [kind, setKind] = useState<AssetKind>('product');
  const [fTag, setFTag] = useState<number | 0>(0);
  const [fBrand, setFBrand] = useState<number>(0);
  const [fCat, setFCat] = useState<number>(0);
  const [fModel, setFModel] = useState<number>(0);
  const [fProject, setFProject] = useState<number>(0);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    void path;
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
  }, [user?.role]);

  useEffect(() => {
    api
      .listAssets({
        tag_id: fTag || undefined,
        scope: fProject ? 'project' : 'all',
        project_id: fProject || undefined,
      })
      .then((r) => setAssets(r.assets))
      .catch(() => setAssets([]));
  }, [fTag, fProject]);

  const projOptions = useMemo(
    () => (fBrand ? projects.filter((p) => p.brand_id === fBrand) : projects),
    [projects, fBrand]
  );
  const list = useMemo(() => {
    // 大类：产品类 = 产品图；贴图类 = 底图 / 贴纸
    let out = kind === 'product' ? assets.filter((a) => a.type === 'product') : assets.filter((a) => a.type !== 'product');
    if (kind === 'product' && !fProject) {
      if (fBrand) out = out.filter((a) => a.brand_id === fBrand);
      if (fCat) out = out.filter((a) => a.category_id === fCat);
      if (fModel) out = out.filter((a) => a.model_id === fModel);
    }
    return out;
  }, [assets, kind, fBrand, fCat, fModel, fProject]);

  const typeName = (code: string) =>
    types.find((t) => t.code === code)?.name || (code === 'product' ? '产品图' : code === 'sticker' ? '贴纸' : code === 'scene' ? '底图' : code);

  /**
   * 选用：把素材添加到画布「上面一层」（不删除画布中已有图层）。
   * 产品图 / 底图按画布高度等比放入，贴纸按 28% 宽放入，都可再拖动缩放。
   */
  async function pick(a: Asset) {
    try {
      const { w, h } = await loadImageSize(a.url);
      if (a.type === 'sticker') {
        const sc = Math.min((canvasWidth * 0.28) / w, 1);
        addOverlay('sticker', a.url, w * sc, h * sc);
      } else {
        addOverlay('text', a.url, w, h);
      }
      setMsg('已选用到画布上面一层');
      window.setTimeout(() => setMsg(''), 2200);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* 大类：产品类（品牌-产品-型号-标签 + 项目专属勾选） / 贴图类（标签） */}
      <div className="space-y-1.5 border-b border-zinc-800 p-2">
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
        <div className="flex items-center justify-between text-[10px] text-zinc-500">
          <span>共 {list.length} 个素材</span>
          {msg && <span className="text-emerald-300">{msg}</span>}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-3 gap-1.5">
          {list.map((a) => (
            <button key={a.id} onClick={() => void pick(a)} title={typeName(a.type)} className="group overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 transition hover:border-indigo-500">
              <span className="relative block aspect-[3/4] w-full overflow-hidden">
                <img src={apiUrl(a.url)} alt="" className="h-full w-full object-cover" />
                <span className="absolute left-0.5 top-0.5 rounded bg-black/70 px-1 py-0.5 text-[9px] text-zinc-200">{T(`asset.kind.${a.type === 'product' ? 'product' : 'sticker'}`)}</span>
                {a.project_id && <span className="absolute right-0.5 top-0.5 rounded bg-amber-500/80 px-1 py-0.5 text-[9px] text-black">专属</span>}
                {/* 悬停只显示「选用」两个字 */}
                <span className="absolute inset-0 hidden flex-col items-center justify-center gap-1 bg-black/65 px-1 text-center text-[9px] leading-tight text-zinc-100 group-hover:flex">
                  <span className="rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">{T('designer.pickLabel')}</span>
                </span>
              </span>
            </button>
          ))}
          {list.length === 0 && <div className="col-span-3 rounded-lg border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-600">暂无素材</div>}
        </div>
      </div>
    </div>
  );
}

function HistoryTab({ onPick }: { onPick?: () => void } = {}) {
  const canvasWidth = useDesign((s) => s.canvasWidth);
  const addOverlay = useDesign((s) => s.addOverlay);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [filter, setFilter] = useState<'all' | 'scene' | 'text'>('all');

  // 只跟随用户个人权限：右侧历史 = 我自己在画布中生成的记录
  const load = useCallback(() => api.listGenerations(undefined, { mine: true }).then((r) => setGenerations(r.generations)).catch(() => {}), []);
  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 点击历史图：以「新增图层」形式添加到画布（不再覆盖底图），随后关闭弹框。
   * 统一走 addOverlay 新增一层，避免破坏用户已有的底图/产品图。
   */
  async function reuse(g: Generation) {
    try {
      const { w, h } = await loadImageSize(g.url);
      const s = Math.min((canvasWidth * 0.7) / w, 1.5);
      addOverlay('text', g.url, w * s, h * s);
      onPick?.();
    } catch {
      /* ignore */
    }
  }

  const list = generations.filter((g) => filter === 'all' || g.kind === filter);
  // 分页：每页 3×5 = 15 个（PC 与移动端一致）
  const PER_PAGE = 15;
  const pageCount = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const [page, setPage] = useState(1);
  const curPage = Math.min(page, pageCount);
  const pageItems = list.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-zinc-800 p-2">
        {(['all', 'scene', 'text'] as const).map((k) => (
          <button
            key={k}
            onClick={() => { setFilter(k); setPage(1); }}
            className={`rounded px-2.5 py-1 text-[11px] transition ${filter === k ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
          >
            {k === 'all' ? '全部' : k === 'scene' ? '场景' : '文字'}
          </button>
        ))}
        <span className="ml-auto self-center text-[10px] text-zinc-500">共 {list.length} 个 · 第 {curPage}/{pageCount} 页</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-600">暂无生成记录</div>
        ) : (
          /* 每页 3×5 = 15 个；预览统一 3:4 */
          <div className="grid grid-cols-3 gap-1.5 md:grid-cols-5">
            {pageItems.map((g) => (
              <div key={g.id} className="group relative">
                <button onClick={() => void reuse(g)} title={g.prompt} className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 transition hover:border-indigo-500">
                  <img src={apiUrl(g.url)} alt="" className="aspect-[3/4] w-full object-cover" />
                </button>
                <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/70 px-1 text-[9px] text-zinc-300">
                  {g.kind === 'scene' ? '场景' : '文字'}
                </span>
                <button
                  onClick={async () => { await api.deleteGeneration(g.id); void load(); }}
                  className="absolute right-1 top-1 hidden rounded bg-black/70 px-1 text-[9px] text-red-400 group-hover:block"
                >
                  ×
              </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* 分页控件 */}
      {list.length > PER_PAGE && (
        <div className="flex shrink-0 items-center justify-center gap-1.5 border-t border-zinc-800 p-2">
          <button
            className="rounded bg-zinc-800 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-40"
            disabled={curPage <= 1}
            onClick={() => setPage(curPage - 1)}
          >上一页</button>
          {Array.from({ length: pageCount }).slice(0, 12).map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i + 1)}
              className={`h-7 min-w-7 rounded px-2 text-[11px] transition ${curPage === i + 1 ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
            >{i + 1}</button>
          ))}
          {pageCount > 12 && <span className="text-[11px] text-zinc-500">…共 {pageCount} 页</span>}
          <button
            className="rounded bg-zinc-800 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-40"
            disabled={curPage >= pageCount}
            onClick={() => setPage(curPage + 1)}
          >下一页</button>
        </div>
      )}
    </div>
  );
}

