import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AssetPanel from '../components/AssetPanel';
import MaterialPicker from '../components/MaterialPicker';
import DesignerCanvas from '../components/DesignerCanvas';
import LayerPanel from '../components/LayerPanel';
import { api, apiUrl } from '../lib/api';
import { compositeLayers, downloadBlob, getDrawable, loadImageSize } from '../lib/image';
import { useUiTexts } from '../lib/uiTexts';
import { getCurrentMask } from '../lib/mask';
import { saveDesignNow, isDesignDirty, markDesignSaved } from '../lib/autosave';
import Modal from '../components/Modal';
import { isSmartRefType } from '../lib/smartRef';
import { CANVAS_RATIOS, ratioForSize, sizeForRatio } from '../lib/canvasSizes';
import { useDesign } from '../store/design';
import { useUi } from '../store/ui';
import { useIsMobileLayout } from '../store/viewMode';
import type { AssetType, OverlayItem, PuzzleState, TemplateType } from '../lib/types';

type DrawItem = OverlayItem & { drawable: HTMLImageElement | HTMLCanvasElement };

async function buildDrawItems(items: OverlayItem[]): Promise<DrawItem[]> {
  return Promise.all(
    items.map(async (it) => ({ ...it, drawable: await getDrawable(it.url, it.removeWhite) }))
  );
}

export default function Designer() {
  const [params] = useSearchParams();
  const designId = params.get('design_id');
  const referenceId = params.get('reference_id');

  const setDesignName = useDesign((s) => s.setDesignName);
  const layer2 = useDesign((s) => s.layer2);
  const layer1 = useDesign((s) => s.layer1);
  const layer3 = useDesign((s) => s.layer3);
  const puzzle = useDesign((s) => s.puzzle);
  const tagTypeId = useDesign((s) => s.tagTypeId);
  const canvasWidth = useDesign((s) => s.canvasWidth);
  const canvasHeight = useDesign((s) => s.canvasHeight);
  const setCanvas = useDesign((s) => s.setCanvas);
  const templatePreview = useDesign((s) => s.templatePreview);
  const setTemplatePreview = useDesign((s) => s.setTemplatePreview);
  const brushMode = useDesign((s) => s.brushMode);
  const setBrushMode = useDesign((s) => s.setBrushMode);
  const brushSize = useDesign((s) => s.brushSize);
  const freeTransform = useDesign((s) => s.freeTransform);
  const undoSteps = useDesign((s) => s.undoSteps);
  const undoPos = useDesign((s) => s.undoPos);
  const undoTo = useDesign((s) => s.undoTo);
  const setFreeTransform = useDesign((s) => s.setFreeTransform);
  const setPlus = useDesign((s) => s.setPlus);
  const openSaveName = useDesign((s) => s.openSaveName);
  const closeSaveName = useDesign((s) => s.closeSaveName);
  const saveNameOpen = useDesign((s) => s.saveNameOpen);
  const saveNameFlow = useDesign((s) => s.saveNameFlow);
  const pendingSwitch = useDesign((s) => s.pendingSwitch);
  const setPendingSwitch = useDesign((s) => s.setPendingSwitch);
  const resetCanvasForSwitch = useDesign((s) => s.resetCanvasForSwitch);
  const setTagPrompts = useDesign((s) => s.setTagPrompts);
  const setTextPrompt = useDesign((s) => s.setTextPrompt);
  const setScenePrompt = useDesign((s) => s.setScenePrompt);
  const setPath = useDesign((s) => s.setPath);
  const designPath = useDesign((s) => s.path);
  /** 画布缩放百分比（移动端左下角显示） */
  const canvasScale = useDesign((s) => s.zoom) / 100;
  /**
   * 图2 是否已配置（本地上传或从素材库选择后为 true）——移动端画布右上角打勾。
   * 与 AssetPanel 里的 figure2 判定保持一致：B 类看产品层 layer2，A 类看底图 layer1。
   */
  const figure2Ready = useDesign((s) => (s.path === 'B' ? !!s.layer2 : !!s.layer1));
  const setTagType = useDesign((s) => s.setTagType);
  const [nameDraft, setNameDraft] = useState('');
  const [flying, setFlying] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const setLayer1 = useDesign((s) => s.setLayer1);
  const setLayer2 = useDesign((s) => s.setLayer2);
  const setPuzzleCell = useDesign((s) => s.setPuzzleCell);
  const addOverlay = useDesign((s) => s.addOverlay);
  // 「+」号：选目标 → 弹框选上传 / 素材库
  const [plusTarget, setPlusTarget] = useState<string | null>(null);
  /**
   * 正在处理的目标（上传 / 素材库）：
   * 不能用 plusTarget —— 打开素材库前会把它清空，导致结果被错放到「底图」。
   * 这个 ref 会一直保留到图片真正落位后才清除。
   */
  const pendingTargetRef = useRef<string>('scene');
  const [plusPickerType, setPlusPickerType] = useState<AssetType | null>(null);
  const plusFileRef = useRef<HTMLInputElement>(null);
  const aiBusy = useDesign((s) => s.aiBusy);
  const select = useDesign((s) => s.select);

  // PC / 手机端预览：PC 上可手动切换；真机自动走移动端自适应
  const isMobileLayout = useIsMobileLayout();
  const [undoOpen, setUndoOpen] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const [types, setTypes] = useState<TemplateType[]>([]);

  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const assetSectionRef = useRef<HTMLDivElement>(null);
  const layerSectionRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  /** 移动端底部导航当前项（默认 AI配置） */
  const [mobileNav, setMobileNav] = useState<'ai' | 'canvas' | 'layers' | 'assets' | 'history'>('ai');
  const [mobilePickerOpen, setMobilePickerOpen] = useState(false);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);

  /** 移动端底部导航：滚动到区块 / 弹框展示 */
  function onNavClick(key: 'ai' | 'canvas' | 'layers' | 'assets' | 'history') {
    setMobileNav(key);
    if (key === 'ai') scrollToSection(assetSectionRef);
    else if (key === 'canvas') scrollToSection(canvasWrapRef);
    else if (key === 'layers') scrollToSection(layerSectionRef);
    else if (key === 'assets') setMobilePickerOpen(true);
    else setMobileHistoryOpen(true);
  }
  /** 移动端底部导航：滚动到对应区块 */
  function scrollToSection(ref: React.RefObject<HTMLDivElement | null>) {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const msgTimer = useRef<number>();
  const [leaveModal, setLeaveModal] = useState<'save' | 'nosave' | null>(null);
  const [saveImgOpen, setSaveImgOpen] = useState(false);
  const T = useUiTexts();

  function flash(m: string) {
    setMsg(m);
    if (msgTimer.current) window.clearTimeout(msgTimer.current);
    msgTimer.current = window.setTimeout(() => setMsg(''), 3000);
  }

  // 模板标签：进页面时载入一次
  useEffect(() => {
    api.listTemplateTypes().then((r) => setTypes(r.types)).catch(() => {});
  }, []);

  // 载入：模板 / 已有设计 / 新建
  useEffect(() => {
    const uiProjectId = useUi.getState().projectId;
    if (designId) {
      api
        .getDesign(Number(designId))
        .then(({ design }) => {
          const layers = JSON.parse(design.layers_json || '{}') as {
            path?: 'A' | 'B';
            layer1?: Record<string, unknown> | null;
            layer2?: Record<string, unknown> | null;
            layer3?: OverlayItem[];
            puzzle?: PuzzleState | null;
          };
          const l1 = layers.layer1
            ? { x: 0, y: 0, width: design.canvas_width, height: design.canvas_height, rotation: 0, locked: false, ...layers.layer1 }
            : null;
          const l2 = layers.layer2
            ? { x: 0, y: 0, width: design.canvas_width, height: design.canvas_height, rotation: 0, locked: false, ...layers.layer2 }
            : null;
          useDesign.getState().hydrate({
            designId: design.id,
            designName: design.name,
            projectId: design.project_id,
            canvasWidth: design.canvas_width,
            canvasHeight: design.canvas_height,
            path: layers.path || (l2 ? 'B' : 'A'),
            layer1: l1 as never,
            layer2: l2 as never,
            layer3: layers.layer3 || [],
            puzzle: layers.puzzle || null,
            selectedId: null,
            templatePreview: null,
          });
          markDesignSaved();
        })
        .catch((e) => flash(e instanceof Error ? e.message : '加载失败'));
    } else {
      useDesign.getState().reset();
      useDesign.getState().setProjectId(uiProjectId);
      if (referenceId) {
        Promise.all([
          api.listTemplates({ project_id: uiProjectId ?? undefined }),
          api.listTemplateTypes().catch(() => ({ types: [] as TemplateType[] })),
        ])
          .then(([r, tt]) => {
            const t = r.references.find((x) => x.id === Number(referenceId));
            if (!t) return;
            const st = useDesign.getState();
            const tag = tt.types.find((x) => x.id === t.template_type_id) || null;
            const kind: 'A' | 'B' = tag ? tag.path_kind : t.kind === 'A' ? 'A' : 'B';
            st.setBasePrompts(t.text_style_prompt || '', t.scene_prompt || '');
            st.setTextPrompt(t.text_style_prompt || '');
            st.setScenePrompt(t.scene_prompt || '');
            st.setTagPrompts(tag?.prompt_text || '', tag?.prompt_scene || '');
            st.setTagType(tag ? tag.id : null);
            st.setTemplatePreview(t.url);
            st.setPath(kind);
            void api.useTemplate(t.id).catch(() => {});
          })
          .catch(() => {})
          .finally(() => markDesignSaved());
      } else {
        markDesignSaved();
      }
    }
  }, [designId, referenceId]);

  // 关闭/刷新页面前的保存提示
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (isDesignDirty()) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // 键盘：撤销(Ctrl+Z) / 删除 / 复制 / ESC 取消选择
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const st = useDesign.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const ok = st.undo();
        flash(ok ? '已撤销' : '没有可撤销的操作');
        return;
      }
      if (e.key === 'Escape') {
        st.select(null);
        st.setBrushMode('select');
        return;
      }
      if (!st.selectedId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        st.deleteSelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        st.duplicateOverlay(st.selectedId);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 点击画布以外的区域 → 取消当前工具（画笔）
  function onRootMouseDown(e: React.MouseEvent) {
    if (brushMode === 'select') return;
    const inCanvas = canvasWrapRef.current?.contains(e.target as Node);
    const inToolbar = toolbarRef.current?.contains(e.target as Node);
    if (!inCanvas && !inToolbar) setBrushMode('select');
  }

  /** 换一个模板：同类标签里轮换下一个模板，提示词按后台设置同步 */
  async function swapTemplate() {
    try {
      const list = (await api.listTemplates({ template_type_id: tagTypeId ?? undefined })).references;
      if (list.length <= 1) return flash('这类标签只有一个模板，换一个还是这个');
      const current = templatePreview?.split('/').pop() || '';
      const idx = list.findIndex((t) => t.url.split('/').pop() === current);
      const next = list[(idx + 1 + list.length) % list.length] || list[0];
      setTemplatePreview(next.url);
      if (typeof next.text_style_prompt === 'string') setTextPrompt(next.text_style_prompt || '');
      if (typeof next.scene_prompt === 'string') setScenePrompt(next.scene_prompt || '');
      const allTypes = (await api.listTemplateTypes()).types;
      setTypes(allTypes);
      const typeId = next.template_type_id ?? tagTypeId ?? null;
      if (typeId) {
        if (typeId !== tagTypeId) setTagType(typeId);
        const tt = allTypes.find((t) => t.id === typeId);
        if (!tt) return;
        setTagPrompts(tt.prompt_text || '', tt.prompt_scene || '');
        if (!next.text_style_prompt && tt.prompt_text) setTextPrompt(next.text_style_prompt || '');
        if (!next.scene_prompt && tt.prompt_scene) setScenePrompt(next.scene_prompt || '');
      }
      flash('已换一个模板');
    } catch (e) {
      flash(e instanceof Error ? e.message : '换模板失败');
    }
  }

  /** 默认设计名：未命名设计 + 日期 + 时间戳 */
  function defaultDesignName() {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `未命名设计${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  /** 「缩小飞到头像」动效：从画布中心飞到右上角头像 */
  function flyToAvatar() {
    const canvasEl = document.querySelector('[data-canvas-pad]') as HTMLElement | null;
    const avatarEl = document.querySelector('[data-user-avatar]') as HTMLElement | null;
    const from = canvasEl?.getBoundingClientRect();
    const to = avatarEl?.getBoundingClientRect();
    const start = from
      ? { x: from.left + from.width / 2, y: from.top + from.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const end = to ? { x: to.left + to.width / 2, y: to.top + to.height / 2 } : { x: window.innerWidth - 60, y: 40 };
    setFlying({ start, end });
    window.setTimeout(() => setFlying(null), 900);
  }

  async function saveDesign() {
    const st = useDesign.getState();
    if (!st.layer1 && !st.layer2 && st.layer3.length === 0 && !st.puzzle) {
      return flash('画布还是空的，先添加素材吧');
    }
    setNameDraft(st.designId ? st.designName : defaultDesignName());
    openSaveName('save');
  }

  /** 弹框确定：设置名称 → 保存 → 动效 →（保存并切换时）清空画布并换标签 */
  async function submitSaveName() {
    const flow = saveNameFlow;
    const name = nameDraft.trim() || defaultDesignName();
    setDesignName(name);
    closeSaveName();
    setSaveState('saving');
    const r = await saveDesignNow();
    setSaveState(r.ok ? 'saved' : 'error');
    if (!r.ok) return flash(r.msg || '保存失败');
    flyToAvatar();
    flash('设计稿已保存，可在右上角头像 → 历史记录中查看');
    if (flow === 'switch' && pendingSwitch) {
      const target = pendingSwitch;
      setPendingSwitch(null);
      window.setTimeout(() => applySwitchTo(target), 650);
    }
  }

  /** 应用一个模板标签：同步内置提示词（出图比例统一以画布比例为准，后台不再设置比例） */
  function applyTag(tag: TemplateType) {
    setTagPrompts(tag.prompt_text || '', tag.prompt_scene || '');
  }

  /** 保存成功后切换标签：清空画布内容并切换界面（提示词同步） */
  function applySwitchTo(target: { path: 'A' | 'B'; tagId: number }) {
    resetCanvasForSwitch();
    setPath(target.path);
    setTagType(target.tagId);
    const tag = types.find((t) => t.id === target.tagId);
    if (tag) applyTag(tag);
  }

  const navigate = useNavigate();
  function goHome() {
    if (isDesignDirty()) setLeaveModal('save');
    else navigate('/');
  }
  async function doLeave() {
    setLeaveModal(null);
    navigate('/');
  }
  async function saveThenLeave() {
    setLeaveModal(null);
    await saveDesignNow();
    navigate('/');
  }

  async function downloadFull(format: 'png' | 'jpeg') {
    const st = useDesign.getState();
    try {
      const drawItems = await buildDrawItems(st.layer3);
      const canvas = await compositeLayers({
        canvasWidth: st.canvasWidth,
        canvasHeight: st.canvasHeight,
        layer1: st.layer1,
        layer2: st.layer2,
        layer2Image: getCurrentMask()?.display ?? null,
        layer3: drawItems,
        puzzle: st.puzzle,
        transparent: false,
      });
      const mime = format === 'png' ? 'image/png' : 'image/jpeg';
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, 0.92));
      if (blob) downloadBlob(blob, `${st.designName}.${format === 'png' ? 'png' : 'jpg'}`);
    } catch (e) {
      flash(e instanceof Error ? e.message : '导出失败');
    }
  }

  async function downloadBackground() {
    const st = useDesign.getState();
    if (!st.layer1 && !st.puzzle) return flash('当前没有背景图层');
    try {
      const canvas = await compositeLayers({
        canvasWidth: st.canvasWidth,
        canvasHeight: st.canvasHeight,
        layer1: st.layer1,
        layer2: null,
        layer3: [],
        puzzle: st.puzzle,
        transparent: false,
      });
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      if (blob) downloadBlob(blob, `${st.designName}-背景.png`);
    } catch (e) {
      flash(e instanceof Error ? e.message : '导出失败');
    }
  }

  async function downloadLayer3() {
    const st = useDesign.getState();
    if (st.layer3.length === 0) return flash('当前无文字/贴纸层（Layer 3）');
    try {
      const drawItems = await buildDrawItems(st.layer3);
      const canvas = await compositeLayers({
        canvasWidth: st.canvasWidth,
        canvasHeight: st.canvasHeight,
        layer1: null,
        layer2: null,
        layer3: drawItems,
        transparent: true,
      });
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      if (blob) downloadBlob(blob, `${st.designName}-文字样式.png`);
    } catch (e) {
      flash(e instanceof Error ? e.message : '导出失败');
    }
  }

  const saveLabel = saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '已保存' : saveState === 'error' ? '保存失败' : '';

  const currentTagName = types.find((t) => t.id === tagTypeId)?.name || '';
  const isTextOnlyTag = /大字报/.test(currentTagName);

  /** 把上传 / 素材库选中的图应用到「+」号对应的位置 */
  async function applyPickedImage(url: string, name: string | undefined, target: string) {
    const { w, h } = await loadImageSize(url);
    if (target === 'product') setLayer2(url, w, h, name || '产品图');
    else if (target === 'scene') setLayer1(url, name || '底图', w, h);
    else if (target.startsWith('cell:')) setPuzzleCell(Number(target.split(':')[1]), url, name, w, h);
    else addOverlay('sticker', url, w, h);
  }

  async function uploadForPlus(file: File) {
    // 用 pendingTargetRef：即使弹框已关闭也能记住「这次是为哪个位置加图」
    const target = pendingTargetRef.current;
    try {
      const { url } = await api.upload(file);
      await applyPickedImage(url, file.name, target);
    } catch (e) {
      flash(e instanceof Error ? e.message : '上传失败');
    }
  }

  /** 「+」号被点击：记住目标位置，再弹出「上传 / 素材库」选择框 */
  function openPlusDialog(target: string) {
    pendingTargetRef.current = target;
    setPlusTarget(target);
  }

  // 画布上的「+」号：注册处理器；大字报标签不显示
  useEffect(() => {
    setPlus(isTextOnlyTag, openPlusDialog);
    return () => setPlus(false, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTextOnlyTag]);

  const currentRatio = useMemo(() => ratioForSize(canvasWidth, canvasHeight), [canvasWidth, canvasHeight]);
  const showSwap = !!templatePreview && !isSmartRefType({ name: currentTagName });

  /** 画布内的浮层与工具条（PC / 手机共用同一套逻辑） */
  const canvasStack = (
    <>
      <DesignerCanvas />
      {aiBusy && (
        <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-black/40">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-700 bg-zinc-900/95 px-6 py-5 shadow-2xl">
            <div className="h-9 w-9 animate-spin rounded-full border-4 border-zinc-700 border-t-indigo-500" />
            <div className="text-xs text-zinc-200">AI 生成中，请稍候…</div>
          </div>
        </div>
      )}

      {/* 图1 模板预览：PC 与移动端都在左上角；移动端尺寸适当放大 */}
      {templatePreview && (
        <div className="absolute left-1.5 top-1.5 z-20 overflow-hidden rounded-lg border border-zinc-600 shadow-xl shadow-black/60 sm:rounded-xl">
          <img
            src={apiUrl(templatePreview)}
            alt="模板预览"
            className={isMobileLayout ? 'max-h-[16vh] w-auto max-w-[26vw] object-contain' : 'max-h-[30vh] w-auto max-w-[19vw] object-contain'}
          />
          <span className={`absolute left-1 top-1 rounded bg-indigo-600 font-semibold text-white ${isMobileLayout ? 'px-1.5 py-0 text-[9px]' : 'px-2 py-0.5 text-[11px]'}`}>图1</span>
          {showSwap && (
            /* 移动端：【换一个】保留，置于预览图内下方居中 */
            <button
              onClick={(e) => { e.stopPropagation(); void swapTemplate(); }}
              title="在同类标签里换一个模板"
              className={
                isMobileLayout
                  ? 'absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#ff2442] px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-lg shadow-black/50 transition hover:bg-[#ff3d58]'
                  : 'absolute bottom-1 right-1 rounded-lg bg-[#ff2442] px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg shadow-black/50 transition hover:bg-[#ff3d58]'
              }
            >
              换一个
            </button>
          )}
          <button
            onClick={() => setTemplatePreview(null)}
            className={`absolute right-0.5 top-0.5 grid place-items-center rounded-full bg-black/70 text-zinc-300 hover:text-white ${isMobileLayout ? 'h-5 w-5 text-[10px]' : 'h-5 w-5 text-[11px]'}`}
          >×</button>
        </div>
      )}

      {/* 移动端：右上角「图2 + 绿色打勾」合成一个等高标签整体
          —— 未配置时只显示「图2」，本地上传或从素材库选择后追加绿色打勾 */}
      {isMobileLayout && (
        <span
          title={figure2Ready ? '图2 已配置' : '图2 未配置'}
          className="pointer-events-none absolute right-1.5 top-1.5 z-20 inline-flex h-6 items-stretch overflow-hidden rounded-md bg-black/70 text-[10px] font-semibold text-zinc-100 shadow-md shadow-black/50 backdrop-blur-sm"
        >
          <span className="grid place-items-center px-1.5 leading-none">图2</span>
          {figure2Ready && (
            <span className="grid w-6 place-items-center bg-emerald-500 text-white">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 13 4.5 4.5L19 7" />
              </svg>
            </span>
          )}
        </span>
      )}

      {/* 移动端：左下角缩放百分比 */}
      {isMobileLayout && (
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 z-20 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-100">
          {Math.round(canvasScale * 100)}%
        </span>
      )}

      {/* 工具栏：移动端竖排在画布右侧、上下居中；PC 同样竖排在右中 */}
      <div
        ref={toolbarRef}
        className={
          isMobileLayout
            ? 'absolute right-1.5 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-xl border border-zinc-700 bg-zinc-900/95 p-1 shadow-xl backdrop-blur'
            : 'absolute right-2.5 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-900/90 p-2 shadow-xl backdrop-blur'
        }
      >
        {/* 选择工具 */}
        <button
          onClick={() => { select(null); setBrushMode('select'); setUndoOpen(false); }}
          title="选择工具"
          className={`grid place-items-center rounded-xl transition ${isMobileLayout ? 'h-8 w-8' : 'h-11 w-11'} ${brushMode === 'select' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
        >
          <svg viewBox="0 0 24 24" className={isMobileLayout ? 'h-4 w-4 fill-current' : 'h-5 w-5 fill-current'}>
            <path d="M5.5 2.6 18.9 12.2c.9.6.5 2-.6 2.1l-5 .5 2.9 5.4c.3.6.1 1.4-.5 1.7l-1.5.8c-.6.3-1.4.1-1.7-.5l-2.7-5.3-3.4 3c-.7.6-1.8.1-1.8-.8V3.5c0-1 1.2-1.6 1.9-.9Z" />
          </svg>
        </button>
        {/* 历史记录 */}
        <div className="relative">
          <button
            onClick={() => setUndoOpen((o) => !o)}
            title="历史记录（最多 20 步）"
            className={`grid place-items-center rounded-xl transition ${isMobileLayout ? 'h-8 w-8' : 'h-11 w-11'} ${undoOpen ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/40' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
          >
            <svg viewBox="0 0 24 24" className={`${isMobileLayout ? 'h-4 w-4' : 'h-5 w-5'} fill-none stroke-current`} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 9h11a5 5 0 0 1 0 10H9" />
              <path d="M8 5 4 9l4 4" />
            </svg>
          </button>
          {undoOpen && (
            <div className={`absolute z-50 max-h-[50vh] w-60 overflow-hidden overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl ${isMobileLayout ? 'right-0 top-full mt-1' : 'right-full top-0 mr-2'}`}>
              <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 text-[11px] text-zinc-400">
                <span>历史记录（最多 20 步）</span>
                <button className="text-zinc-500 hover:text-white" onClick={() => setUndoOpen(false)}>×</button>
              </div>
              <div className="p-1.5">
                {undoSteps.length === 0 && <div className="px-2 py-4 text-center text-[11px] text-zinc-600">还没有操作记录</div>}
                {undoSteps.map((step, index) => {
                  const isCurrent = index === (undoPos - 1);
                  return (
                    <button
                      key={`${step.at}-${index}`}
                      onClick={() => { const ok = undoTo(index); flash(ok ? `已跳转到第 ${index + 1} 步` : '跳转失败'); }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] transition ${isCurrent ? 'bg-amber-600/20 text-amber-100' : 'text-zinc-200 hover:bg-zinc-800'}`}
                    >
                      <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9px] ${isCurrent ? 'border-amber-400 text-amber-300' : 'border-zinc-600 text-zinc-500'}`}>
                        {isCurrent ? '✓' : index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{index + 1}. {step.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {/* 自由变换 */}
        <button
          onClick={() => setFreeTransform(!freeTransform)}
          title="自由变换（关闭=等比缩放）"
          className={`grid place-items-center rounded-xl transition ${isMobileLayout ? 'h-8 w-8 text-sm' : 'h-11 w-11 text-lg'} ${freeTransform ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
        >
          ⤢
        </button>
        {/* 橡皮擦 */}
        <button
          onClick={() => setBrushMode(brushMode === 'erase' ? 'select' : 'erase')}
          title="橡皮擦"
          className={`grid place-items-center rounded-xl transition ${isMobileLayout ? 'h-8 w-8' : 'h-11 w-11'} ${brushMode === 'erase' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'}`}
        >
          <svg viewBox="0 0 24 24" className={`${isMobileLayout ? 'h-4 w-4' : 'h-5 w-5'} fill-none stroke-current`} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8.5 19.5H20" />
            <path d="M4.2 16.3 12.9 7.6a2 2 0 0 1 2.8 0l3.1 3.1a2 2 0 0 1 0 2.8l-5.6 5.6a2 2 0 0 1-1.4.6H7.1a2 2 0 0 1-1.4-.6l-1.5-1.5a2 2 0 0 1 0-2.8Z" />
            <path d="M10.4 10.1l6.2 6.2" />
          </svg>
        </button>
      </div>

      {/* 右下：保存图片（手机用小红书红按钮，PC 用主按钮） */}
      <button
        onClick={() => setSaveImgOpen(true)}
        title="保存图片"
        className={
          isMobileLayout
            ? 'absolute bottom-1.5 right-1.5 z-30 rounded-xl border border-[#ff2442] bg-[#ff2442] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-xl shadow-black/40 transition hover:bg-[#ff3d58] active:bg-[#e01f3b]'
            : 'btn-primary absolute bottom-3 right-3 z-20'
        }
      >
        保存图片
      </button>
    </>
  );

  /** 左下角缩放控件（仅 PC 显示，手机上隐藏以免拥挤） */
  const zoomWidget = !isMobileLayout;

  /** 弹框类：PC 与手机共用一套，避免重复代码 */
  const sharedOverlays = (
    <>
      {/* 画布「+」号：上传 / 素材库（目标位置已记在 pendingTargetRef） */}
      <Modal
        open={plusTarget !== null}
        title={plusTarget?.startsWith('cell:') ? `第 ${Number(plusTarget.split(':')[1]) + 1} 格 · 添加图片` : '添加图片'}
        onClose={() => setPlusTarget(null)}
        footer={<button className="btn-soft" onClick={() => setPlusTarget(null)}>取消</button>}
      >
        <div className="grid gap-2">
          <button
            className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
            onClick={() => { setPlusTarget(null); plusFileRef.current?.click(); }}
          >上传素材</button>
          <button
            className="rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
            onClick={() => {
              // 拼图格子 / 底图位默认看「场景」类素材；产品位看「产品」类素材
              const t = pendingTargetRef.current;
              setPlusTarget(null);
              setPlusPickerType(t === 'product' ? 'product' : 'scene');
            }}
          >从素材库选择</button>
        </div>
      </Modal>
      <input
        ref={plusFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void uploadForPlus(f);
        }}
      />
      <MaterialPicker
        type={plusPickerType || 'scene'}
        open={plusPickerType !== null}
        onClose={() => setPlusPickerType(null)}
        onPick={async (a) => {
          setPlusPickerType(null);
          // 关键：用 pendingTargetRef，而不是已经被清空的 plusTarget，
          // 这样在拼图格子上点「+」选素材，图就会进到那一格，而不是底图。
          await applyPickedImage(a.url, a.name || undefined, pendingTargetRef.current);
        }}
      />
      <SaveImgModal
        open={saveImgOpen}
        onClose={() => setSaveImgOpen(false)}
        onPick={(fn) => { setSaveImgOpen(false); void fn(); }}
        handlers={{ downloadFull, downloadBackground, downloadLayer3 }}
      />
      {/* 离开页面的保存提示 */}
      <Modal
        open={leaveModal !== null}
        title="离开设计器？"
        onClose={() => setLeaveModal(null)}
        footer={
          <>
            <button className="btn-soft" onClick={() => setLeaveModal(null)}>取消</button>
            <button className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-500" onClick={doLeave}>不保存，直接离开</button>
            <button className="btn-primary" onClick={saveThenLeave}>保存并离开</button>
          </>
        }
      >
        <p className="text-sm text-zinc-400">当前设计有未保存的内容，是否在离开前保存？</p>
      </Modal>
      {/* 保存：填写设计名称 */}
      <Modal
        open={saveNameOpen}
        title={saveNameFlow === 'switch' ? '保存并切换模板标签' : '保存设计稿'}
        onClose={closeSaveName}
        footer={
          <>
            <button className="btn-soft" onClick={closeSaveName}>取消</button>
            <button className="btn-primary" onClick={() => void submitSaveName()}>确定</button>
          </>
        }
      >
        <label className="label">设计名称（可直接输入修改）
          <input
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            className="mt-1 w-full rounded-lg border-2 border-indigo-500 bg-zinc-950 px-3 py-2 text-sm text-white caret-indigo-400 outline-none transition placeholder:text-zinc-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="如：未命名设计20260921-153000"
          />
        </label>
        <p className="mt-2 text-[11px] text-zinc-500">
          {saveNameFlow === 'switch'
            ? '保存成功后会清空当前画布内容，并切换到新选择的模板标签。'
            : '保存到「右上角头像 → 历史记录」里，可随时再次编辑。'}
        </p>
      </Modal>
      {/* 保存成功动效 */}
      {flying && (
        <div
          className="pointer-events-none fixed z-[60] grid place-items-center rounded-lg border border-indigo-400 bg-indigo-600/90 text-[10px] font-semibold text-white shadow-2xl"
          style={{
            left: flying.start.x - 36,
            top: flying.start.y - 48,
            width: 72,
            height: 96,
            transition: 'transform 800ms cubic-bezier(0.4, 0, 0.2, 1), opacity 800ms ease-in',
            transform: `translate(${flying.end.x - flying.start.x}px, ${flying.end.y - flying.start.y}px) scale(0.12)`,
            opacity: 0.2,
          }}
        >
          设计稿
        </div>
      )}
    </>
  );

  return isMobileLayout ? (
    /* 移动端：整页一个纵向滚动流。
       顺序：请选择模板进行设计 → 底图（图2）/ 提示词 → 画布 → 图层。
       底部固定导航栏（AI配置、画布、图层、素材、历史）。 */
    <div className="flex h-full min-h-0 flex-col bg-zinc-950">
      {/* 顶部：返回按钮 + 比例（居中）+ 存储图标。
         返回 / 存储按钮的底色与画布工具栏按钮一致（bg-zinc-800）。
          模板下拉已移除，模板选择只保留下方内容流里的「请选择模板进行设计」，避免重复。 */}
      <div className="grid h-11 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-2">
        <button
          onClick={goHome}
          title="返回首页"
          className="inline-flex items-center gap-1 justify-self-start rounded-lg bg-zinc-800 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 transition hover:bg-zinc-700 active:bg-zinc-700"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          返回
        </button>
        <select
          value={currentRatio}
          onChange={(e) => { const s = sizeForRatio(e.target.value); setCanvas(s.w, s.h); }}
          className="mx-auto w-auto justify-self-center rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-100"
          title="画布比例（所有 AI 生图都按此比例出图）"
        >
          {CANVAS_RATIOS.map((r) => (
            <option key={r.ratio} value={r.ratio}>{r.ratio}</option>
          ))}
        </select>
        <button
          onClick={() => void saveDesign()}
          disabled={saveState === 'saving'}
          title="保存设计稿"
          className="grid h-8 w-8 place-items-center justify-self-end rounded-lg bg-zinc-800 text-zinc-200 transition hover:bg-zinc-700 disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
            <path d="M8 3v6h7V3" />
            <path d="M7 21v-6h10v6" />
          </svg>
        </button>
      </div>
      {msg && <div className="shrink-0 bg-amber-500/15 px-2 py-1 text-center text-[11px] text-amber-300">{msg}</div>}

      {/* 单一滚动容器：底图（图2）→ 画布 → 提示词 → 图层 */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden" onMouseDown={onRootMouseDown}>
        {/* 提示词 / AI 配置区（含「请选择模板进行设计」下拉、底图（图2）与各项输入框）。
            画布通过 canvasSlot 插到「底图（图2）区域」下方、提示词区域上方
            （A 类没有背景提示词框，则自然落在文字提示词框上方）。 */}
        <div className="border-b border-zinc-800" ref={assetSectionRef}>
          <AssetPanel
            compact
            canvasSlot={
              <div className="relative -mx-3 my-3 h-[38vh] min-h-[220px] border-y border-zinc-800" ref={canvasWrapRef}>
                {canvasStack}
              </div>
            }
          />
        </div>

        {/* 图层面板：同一滚动流内，「图层」导航跳到这里 */}
        <div ref={layerSectionRef}>
          <LayerPanel initialTab="layers" compact />
        </div>
      </div>

      {/* 底部固定导航栏：5 项，默认选中「AI配置」 */}
      <div className="flex h-12 shrink-0 border-t border-zinc-800 bg-zinc-900">
        {([
          ['ai', 'AI配置'],
          ['canvas', '画布'],
          ['layers', '图层'],
          ['assets', '素材'],
          ['history', '历史'],
        ] as const).map(([key, label]) => {
          const active = mobileNav === key;
          return (
            <button
              key={key}
              onClick={() => onNavClick(key)}
              className={`relative flex-1 text-[11px] font-semibold transition-colors duration-200 ${active ? 'text-white' : 'text-zinc-500'}`}
            >
              {label}
              {/* 选中态指示条（纯颜色过渡，无位移跳动） */}
              <span
                className={`absolute inset-x-3 top-0 h-0.5 rounded-full transition-all duration-200 ${active ? 'bg-[#ff2442] opacity-100' : 'opacity-0'}`}
              />
            </button>
          );
        })}
      </div>

      {/* 素材弹框：每页 3×5=15 个 + 分页（PC 端同样分页）；
          点击素材 → 关闭弹框并以新增图层形式加入画布 */}
      <MaterialPicker
        type={designPath === 'B' ? 'product' : 'scene'}
        open={mobilePickerOpen}
        onClose={() => setMobilePickerOpen(false)}
        onPick={async (a) => {
          setMobilePickerOpen(false);
          await applyPickedImage(a.url, a.name || undefined, designPath === 'B' ? 'product' : 'scene');
        }}
      />

      {/* 历史弹框：每页 3×5=15 个 + 分页；点击历史图 → 关闭弹框并以新增图层加入画布 */}
      <Modal open={mobileHistoryOpen} title="历史记录" width="xl" onClose={() => setMobileHistoryOpen(false)} footer={<button className="btn-soft" onClick={() => setMobileHistoryOpen(false)}>关闭</button>}>
        <div className="h-[60vh]">
          <LayerPanel initialTab="history" compact onHistoryPick={() => setMobileHistoryOpen(false)} />
        </div>
      </Modal>

      {sharedOverlays}
    </div>
  ) : (
    <div className="flex h-full flex-col">
      {/* 顶部：返回 / 比例（居中）/ 保存 */}
      <div className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 md:px-4">
        <div className="flex min-w-0 items-center justify-self-start">
          <button onClick={goHome} className="btn-ghost !px-2 text-sm">← 返回</button>
        </div>
        <select
          value={currentRatio}
          onChange={(e) => { const s = sizeForRatio(e.target.value); setCanvas(s.w, s.h); }}
          className="justify-self-center rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200"
          title="画布比例（背景提示词里的比例会随之替换）"
        >
          {CANVAS_RATIOS.map((r) => (
            <option key={r.ratio} value={r.ratio}>{r.ratio} · {r.hint}</option>
          ))}
        </select>
        <div className="flex min-w-0 items-center justify-self-end gap-2">
          <span className={`whitespace-nowrap text-xs ${saveState === 'error' ? 'text-red-400' : 'text-zinc-500'}`}>{saveLabel}</span>
          {msg && <span className="hidden whitespace-nowrap text-xs text-amber-400 lg:inline">{msg}</span>}
          <button onClick={() => void saveDesign()} disabled={saveState === 'saving'} className="btn-primary !px-4">{saveState === 'saving' ? '保存中…' : '保存'}</button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-[22rem] shrink-0 border-r border-zinc-800"><AssetPanel /></div>
        <div className="relative min-w-0 flex-1" onMouseDown={onRootMouseDown}>
          <div ref={canvasWrapRef} className="h-full w-full">
            {canvasStack}
            {zoomWidget && <ZoomWidget />}
          </div>
        </div>
        <div className="w-80 shrink-0 border-l border-zinc-800"><LayerPanel /></div>
      </div>

      {sharedOverlays}
    </div>
  );
}

/** 左下角画布缩放（PC） */
function ZoomWidget() {
  const zoom = useDesign((s) => s.zoom);
  const setZoom = useDesign((s) => s.setZoom);
  return (
    <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1 rounded-xl border border-zinc-700 bg-zinc-900/90 px-1.5 py-1 text-xs text-zinc-300 backdrop-blur">
      <button className="grid h-6 w-6 place-items-center rounded hover:bg-zinc-700" title="缩小" onClick={() => setZoom(zoom - 10)}>−</button>
      <button className="min-w-12 rounded px-1 py-0.5 text-center hover:bg-zinc-700" title="恢复 100%" onClick={() => setZoom(100)}>{zoom}%</button>
      <button className="grid h-6 w-6 place-items-center rounded hover:bg-zinc-700" title="放大" onClick={() => setZoom(zoom + 10)}>＋</button>
    </div>
  );
}

/** 保存图片弹框：PC 与手机共用 */
function SaveImgModal({
  open, onClose, onPick, handlers,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (fn: () => Promise<void>) => void;
  handlers: {
    downloadFull: (f: 'png' | 'jpeg') => Promise<void>;
    downloadBackground: () => Promise<void>;
    downloadLayer3: () => Promise<void>;
  };
}) {
  return (
    <Modal
      open={open}
      title="保存图片"
      onClose={onClose}
      footer={<button className="btn-soft" onClick={onClose}>取消</button>}
    >
      <div className="grid gap-2">
        <button
          className="flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-left transition hover:border-indigo-500 hover:bg-zinc-900"
          onClick={() => onPick(() => handlers.downloadFull('png'))}
        >
          <span>
            <span className="block text-sm font-semibold text-zinc-100">最终合成图</span>
            <span className="mt-0.5 block text-[11px] text-zinc-500">包含背景、产品与文字贴纸的完整封面（PNG）</span>
          </span>
          <span className="text-xs text-zinc-500">PNG</span>
        </button>
        <button
          className="flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-left transition hover:border-indigo-500 hover:bg-zinc-900"
          onClick={() => onPick(handlers.downloadBackground)}
        >
          <span>
            <span className="block text-sm font-semibold text-zinc-100">背景图</span>
            <span className="mt-0.5 block text-[11px] text-zinc-500">只导出底图 / 拼图宫格，不含产品与文字</span>
          </span>
          <span className="text-xs text-zinc-500">PNG</span>
        </button>
        <button
          className="flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-left transition hover:border-indigo-500 hover:bg-zinc-900"
          onClick={() => onPick(handlers.downloadLayer3)}
        >
          <span>
            <span className="block text-sm font-semibold text-zinc-100">文字样式 PNG</span>
            <span className="mt-0.5 block text-[11px] text-zinc-500">只导出文字 / 贴纸层，背景透明（可叠加使用）</span>
          </span>
          <span className="text-xs text-zinc-500">PNG</span>
        </button>
      </div>
    </Modal>
  );
}
