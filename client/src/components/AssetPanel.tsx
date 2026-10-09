import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import EditableHint from './EditableHint';
import { loadImageSize, sizeForCanvas } from '../lib/image';
import { loadImageSize as loadSize } from '../lib/image';
import { useDesign } from '../store/design';
import { useUi } from '../store/ui';
import { useAuth } from '../store/auth';
import { isDesignDirty, saveDesignNow } from '../lib/autosave';
import Modal from './Modal';
import MaterialPicker from './MaterialPicker';
import { useUiTexts } from '../lib/uiTexts';
import { ratioForSize, sizeForRatio } from '../lib/canvasSizes';
import type { TemplateType } from '../lib/types';

/** 默认 2 行，内容超过 2 行时自动变高（最多 260px） */
function AutoArea({
  value, onChange, placeholder, className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={2}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      style={{ overflow: 'hidden' }}
    />
  );
}

/** 模板提示词 + 标签配置的默认提示词（追加在下方，用户可继续修改） */
export function composePrompt(base?: string | null, tagPrompt?: string | null) {
  return [(base || '').trim(), (tagPrompt || '').trim()].filter(Boolean).join('\n');
}

/** 上传箭头矢量图标（移动端「本地 / 素材库」按钮用） */
function UploadArrowIcon({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

/** 不同界面在标签下拉里用不同颜色区分（A=蓝，B=琥珀） */
const SKY = '#7dd3fc';
const AMBER = '#fbbf24';

/**
 * 左侧素材 / AI 面板。
 * compact：移动端使用 —— 不再占满整屏高度，而是作为整页滚动流中的一段自然铺开。
 * canvasSlot：移动端把「画布区域」插到「底图（图2）区域」下方、提示词区域上方。
 */
export default function AssetPanel({ compact = false, canvasSlot = null }: { compact?: boolean; canvasSlot?: React.ReactNode }) {
  const path = useDesign((s) => s.path);
  const setPath = useDesign((s) => s.setPath);
  const setTagType = useDesign((s) => s.setTagType);
  const setTemplatePreview = useDesign((s) => s.setTemplatePreview);
  const tagTypeId = useDesign((s) => s.tagTypeId);
  const baseTextPrompt = useDesign((s) => s.baseTextPrompt);
  const baseScenePrompt = useDesign((s) => s.baseScenePrompt);
  const tagTextPrompt = useDesign((s) => s.tagTextPrompt);
  const tagScenePrompt = useDesign((s) => s.tagScenePrompt);
  const setTagPrompts = useDesign((s) => s.setTagPrompts);

  const setLayer1 = useDesign((s) => s.setLayer1);
  const setLayer2 = useDesign((s) => s.setLayer2);
  const layer1 = useDesign((s) => s.layer1);
  const layer2 = useDesign((s) => s.layer2);
  const canvasWidth = useDesign((s) => s.canvasWidth);
  const canvasHeight = useDesign((s) => s.canvasHeight);
  const setCanvas = useDesign((s) => s.setCanvas);
  const textPrompt = useDesign((s) => s.textPrompt);
  const setTextPrompt = useDesign((s) => s.setTextPrompt);
  const scenePrompt = useDesign((s) => s.scenePrompt);
  const setScenePrompt = useDesign((s) => s.setScenePrompt);
  const puzzle = useDesign((s) => s.puzzle);
  const setPuzzleCount = useDesign((s) => s.setPuzzleCount);
  const layer3Count = useDesign((s) => s.layer3.length);
  const resetCanvasForSwitch = useDesign((s) => s.resetCanvasForSwitch);
  const setPendingSwitch = useDesign((s) => s.setPendingSwitch);
  const openSaveName = useDesign((s) => s.openSaveName);
  const setPuzzleCell = useDesign((s) => s.setPuzzleCell);
  const clearPuzzleCell = useDesign((s) => s.clearPuzzleCell);
  const removePuzzle = useDesign((s) => s.removePuzzle);

  const user = useAuth((s) => s.user);
  const [types, setTypes] = useState<TemplateType[]>([]);
  const [pickerType, setPickerType] = useState<'scene' | 'product' | null>(null);
  const [cellTarget, setCellTarget] = useState(0);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState('');
  const [pendingPath, setPendingPath] = useState<{ path: 'A' | 'B'; tagId: number } | null>(null);

  const sceneFileRef = useRef<HTMLInputElement>(null);
  const productFileRef = useRef<HTMLInputElement>(null);
  const puzzleFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.listTemplateTypes().then((r) => setTypes(r.types)).catch(() => {});
  }, []);

  const currentTag = types.find((t) => t.id === tagTypeId) || null;
  const isPuzzleTag = !!currentTag && Number(currentTag.puzzle) === 1 && path === 'A';
  // 大字报等纯文字标签：不需要底图（上传 / 素材库按钮置灰）
  const isTextOnlyTag = !!currentTag && /大字报/.test(currentTag.name);
  const puzzleCount = puzzle?.count ?? 2;

  // 切换模板标签时画布配置同步切换：进入拼图标签 → 默认 4 拼图并生成容器；切到非拼图标签 → 移除拼图容器
  useEffect(() => {
    if (!currentTag) return; // 标签未加载 / 未选中时不改动画布，避免误清空
    if (isPuzzleTag) {
      if (!puzzle) setPuzzleCount(4);
    } else if (puzzle) {
      removePuzzle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTag, isPuzzleTag, puzzle]);

  /** 切换模板标签时，图1 预览自动换成该标签下的第一个模板底图 */
  async function previewFirstTemplateOfTag(tagId: number) {
    try {
      const r = await api.listTemplates({ template_type_id: tagId });
      const first = r.references[0];
      setTemplatePreview(first ? first.url : null);
    } catch {
      /* 忽略：预览失败不影响画布 */
    }
  }

  /** 切换模板标签：只要画布里有内容就先提示保存（A/B 之间与同类标签内部切换都要提示），并清空画布 */
  function onTagChange(id: number) {
    const tag = types.find((t) => t.id === id);
    if (!tag) return;
    if (tag.id === tagTypeId) return;
    const hasContent = !!layer1 || !!layer2 || !!puzzle || layer3Count > 0;
    if (hasContent) {
      // 交给「切换界面」确认弹框（保存 / 不保存都由用户决定）
      setPendingPath({ path: tag.path_kind, tagId: id });
      return;
    }
    applySwitch({ path: tag.path_kind, tagId: id });
  }

  /** 标签默认提示词单独存一份（灰色展示在模板提示词下方，可继续编辑） */
  function applyTagPrompt(tag: TemplateType) {
    setTagPrompts(tag.prompt_text || '', tag.prompt_scene || '');
  }

  /** 切换标签到目标界面：清空画布内容并切换（保存与否由调用方决定） */
  function applySwitch(target: { path: 'A' | 'B'; tagId: number }) {
    resetCanvasForSwitch();
    setPath(target.path);
    setTagType(target.tagId);
    const tag = types.find((t) => t.id === target.tagId);
    if (tag) applyTagPrompt(tag);
    void previewFirstTemplateOfTag(target.tagId);
  }

  /** 「保存并切换」：先弹框填名称保存，保存成功后（Designer 里）再清空画布并切换 */
  function confirmSwitch() {
    if (!pendingPath) return;
    setPendingPath(null);
    setPendingSwitch(pendingPath);
    openSaveName('switch');
  }
  function leaveWithoutSave() {
    if (!pendingPath) return;
    const target = pendingPath;
    setPendingPath(null);
    applySwitch(target);
  }

  function run(key: string, fn: () => Promise<void>) {
    setBusy((b) => ({ ...b, [key]: true }));
    setErr('');
    fn()
      .catch((e) => setErr(e instanceof Error ? e.message : '操作失败'))
      .finally(() => setBusy((b) => ({ ...b, [key]: false })));
  }

  async function pickSceneAsset(url: string, name?: string) {
    // 以画布高度为标准自适应
    const { w, h } = await loadSize(url);
    setLayer1(url, name || '底图', w, h);
    setPickerType(null);
  }
  async function pickProductAsset(url: string, name?: string) {
    try {
      const { w, h } = await loadImageSize(url);
      setLayer2(url, w, h, name || '产品图');
      setPickerType(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    }
  }
  /** 素材库选图放入拼图某一格 */
  async function pickPuzzleAsset(url: string, name?: string) {
    try {
      const { w, h } = await loadImageSize(url);
      setPuzzleCell(cellTarget, url, name, w, h);
      setPickerType(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    }
  }
  // 拼图各格的图片一律在画布中点格子的「+」添加；
  // 这里保留上面的 helper 仅供内部复用，不再对外暴露格子级入口。

  /** 上传到素材库（同时记录为自己的素材，之后在右侧「素材」里可以复用） */
  async function uploadToLibrary(file: File, assetType: 'scene' | 'product') {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', assetType);
    fd.append('tag_ids', JSON.stringify([]));
    if (user?.brand_id) fd.append('brand_id', String(user.brand_id));
    try {
      const r = await api.uploadAsset(fd);
      return r.asset.url;
    } catch {
      // 素材库写入失败时退回普通上传，保证画布流程不中断
      const { url } = await api.upload(file);
      return url;
    }
  }
  async function uploadScene(file: File) {
    const url = await uploadToLibrary(file, 'scene');
    const { w, h } = await loadSize(url);
    setLayer1(url, file.name, w, h);
  }
  async function uploadProduct(file: File) {
    const url = await uploadToLibrary(file, 'product');
    const { w, h } = await loadImageSize(url);
    setLayer2(url, w, h, file.name);
  }

  const sceneFull = composePrompt(scenePrompt, tagScenePrompt);
  const textFull = composePrompt(textPrompt, tagTextPrompt);

  /**
   * 组装发给 AI 的提示词（严格分开，先背景后文字）：
   * - 生成背景：发「背景提示词 + 背景内置提示词」
   * - 生成文字：发「文字样式提示词 + 文字内置提示词」
   * 比例不再写进提示词（也删掉了所有比例字样），统一由接口按画布比例单独传给 AI。
   */
  function promptFor(kind: 'scene' | 'text') {
    const st = useDesign.getState();
    if (kind === 'scene') {
      const parts = [st.scenePrompt, st.tagScenePrompt].map((s) => (s || '').trim()).filter(Boolean);
      return parts.join('\n');
    }
    return [st.textPrompt, st.tagTextPrompt].map((s) => (s || '').trim()).filter(Boolean).join('\n');
  }

  async function genScene() {
    const bgPrompt = promptFor('scene');
    if (!bgPrompt.trim()) return;
    const st = useDesign.getState();
    const projectId = useUi.getState().projectId;
    const refs = st.layer2 ? [st.layer2.url] : [];
    st.setAiBusy(true);
    try {
      // 生图比例一律以画布比例为准：只传画布宽高，由服务端换算成「比例」传给 AI（不传像素尺寸）
      const { url } = await api.generate({
        kind: 'scene',
        prompt: bgPrompt,
        canvas_width: st.canvasWidth,
        canvas_height: st.canvasHeight,
        referenceImages: refs.length ? refs : undefined,
        project_id: projectId ?? undefined,
      });
      // AI 结果：以画布高度为标准、宽度按比例自适应（图层名统一用「图层N」）
      const dim = await loadImageSize(url);
      // 新生成的背景图放在最底层，原底图/产品图默认隐藏（避免与原图叠加重复）
      setLayer1(url, undefined, dim.w, dim.h);
      st.hideLowerLayersAfterGenerate('layer1');
    } finally {
      st.setAiBusy(false);
    }
  }

  async function genText() {
    const textPromptFull = promptFor('text');
    if (!textPromptFull.trim()) return;
    const st = useDesign.getState();
    const projectId = useUi.getState().projectId;
    const figure1 = st.templatePreview;
    // 产品+AI背景界面：先生成背景，再生成文字样式 —— 文字优先参考已生成的背景，其次产品图
    const figure2 = st.path === 'B' ? st.layer1?.url || st.layer2?.url : st.layer1?.url;
    const refs = [figure1, figure2].filter(Boolean) as string[];
    st.setAiBusy(true);
    try {
      // 同上：文字样式生图比例也以画布比例为准，只传画布宽高
      const { url } = await api.generate({
        kind: 'text',
        prompt: textPromptFull,
        canvas_width: st.canvasWidth,
        canvas_height: st.canvasHeight,
        referenceImages: refs.length ? refs : undefined,
        project_id: projectId ?? undefined,
      });
      // AI 生成的文字图：以画布高度为标准、宽度按比例自适应
      const { w, h } = await loadImageSize(url);
      st.addOverlay('text', url, w, h);
    } finally {
      st.setAiBusy(false);
    }
  }

  const figure2 = path === 'B' ? layer2 : layer1;
  const kindA = types.filter((t) => t.path_kind === 'A');
  const kindB = types.filter((t) => t.path_kind === 'B');
  const promptCls = 'input !min-h-[44px] resize-y text-xs leading-relaxed !text-zinc-300';
  /** 默认内置提示词：颜色更浅（灰）以示区分 */
  const promptGrayCls = 'input !min-h-[44px] resize-y text-xs leading-relaxed !text-zinc-500';
  // 提示词框默认收起，点标题右侧的蓝色「修改」才展开
  const [showTagBg, setShowTagBg] = useState(false);
  const [showTagText, setShowTagText] = useState(false);
  const T = useUiTexts();

  return (
    <aside className={compact ? 'flex flex-col bg-zinc-900' : 'flex h-full flex-col bg-zinc-900'}>
      {/* 界面选择：按后台模板标签类型（默认选中进入时所用模板的标签） */}
      <div className="shrink-0 border-b border-zinc-800 p-2.5">
        <label className="label !mb-1 !text-[11px]"><EditableHint k="designer.tagLabel" inputClassName="input !py-0.5 !px-2 text-xs !w-52" /></label>
        {/* 不同界面用不同颜色区分，不再在下拉里标注界面文字 */}
        <select
          className="input !py-1.5 text-xs"
          style={{ color: currentTag ? (currentTag.path_kind === 'B' ? AMBER : SKY) : undefined }}
          value={tagTypeId ?? 0}
          onChange={(e) => onTagChange(Number(e.target.value))}
        >
          <option value={0}>请选择模板进行设计</option>
          {kindA.map((t) => <option key={t.id} value={t.id} style={{ color: SKY }}>{t.name}</option>)}
          {kindB.map((t) => <option key={t.id} value={t.id} style={{ color: AMBER }}>{t.name}</option>)}
        </select>
        <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-zinc-500">
          <EditableHint k="designer.pathLabel.prefix" inputClassName="input !py-0.5 !px-2 text-[10px] !w-24" />
          <EditableHint k={path === 'A' ? 'designer.pathLabel.a' : 'designer.pathLabel.b'} inputClassName="input !py-0.5 !px-2 text-[10px] !w-52" />
        </div>
      </div>

      <div className={compact ? 'space-y-4 overflow-visible p-3' : 'min-h-0 flex-1 space-y-4 overflow-y-auto p-3'}>
        {err && <div className="rounded-lg bg-red-900/40 p-2 text-xs text-red-300">{err}</div>}

        {/* 拼图标签：这里只保留「拼图张数」选择。
            每格图片请在画布中点击对应格子的「+」添加（会加入到该格，而不是底图）。 */}
        {isPuzzleTag && (
          <section>
            <label className="label">拼图张数</label>
            <div className="grid grid-cols-3 gap-1.5">
              {([2, 3, 4] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setPuzzleCount(n)}
                  className={`rounded-lg border py-1.5 text-xs font-medium transition ${
                    puzzleCount === n
                      ? 'border-indigo-500 bg-indigo-600/20 text-white'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600'
                  }`}
                >
                  {n}拼图
                </button>
              ))}
            </div>
            <div className="mt-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[10px] leading-relaxed text-zinc-500">
              请在画布中点击某个格子的「+」来添加图片，所选素材会进入该格子（不会作为底图）。
            </div>
          </section>
        )}

        {/* 图2：底图（A）/ 产品（B） */}
        {!isPuzzleTag && (
          <section>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300">
                {path === 'B' ? <EditableHint k="designer.slot.product2" inputClassName="input !py-0.5 !px-2 text-xs !w-40" /> : <EditableHint k="designer.slot.scene2" inputClassName="input !py-0.5 !px-2 text-xs !w-40" />}
              </span>
            </div>
            {/* 大字报标签：按钮变灰但仍可点击（需要的话也能自己上传底图）
                compact（移动端）：文案精简为「本地 / 素材库」，配上传箭头图标 */}
            {/* PC 端预览与上方两个按钮之间留出更大间距（移动端维持紧凑） */}
            <div className={`grid grid-cols-2 ${compact ? 'mb-2 gap-2' : 'mb-4 gap-2'}`}>
              <button
                onClick={() => (path === 'B' ? productFileRef.current?.click() : sceneFileRef.current?.click())}
                title="从本地上传"
                className={`inline-flex items-center justify-center gap-1 rounded-lg font-semibold transition ${compact ? 'px-3 py-2 text-xs' : 'py-2 text-sm'} ${isTextOnlyTag ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/30 hover:bg-indigo-500'}`}
              >
                <UploadArrowIcon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                本地
              </button>
              <button
                onClick={() => setPickerType(path === 'B' ? 'product' : 'scene')}
                title="从素材库选择"
                className={`inline-flex items-center justify-center gap-1 rounded-lg font-semibold transition ${compact ? 'px-3 py-2 text-xs' : 'py-2 text-sm'} ${isTextOnlyTag ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600' : 'bg-sky-600 text-white shadow-lg shadow-sky-950/30 hover:bg-sky-500'}`}
              >
                <UploadArrowIcon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                素材库
              </button>
            </div>
            <input ref={sceneFileRef} type="file" accept="image/*" className="hidden" data-role="scene-upload" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadScene(f);
              e.target.value = '';
            }} />
            <input ref={productFileRef} type="file" accept="image/*" className="hidden" data-role="product-upload" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadProduct(f);
              e.target.value = '';
            }} />
            {/* 移动端：不再显示图2预览（改为画布左上角「图2」悬浮提示 +
                画布右上角绿色打勾）；PC 端保留预览 */}
            {!compact && (figure2 ? (
              <div className="relative overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950">
                <img src={figure2.url} alt="" className="max-h-40 w-full object-contain" />
                <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-zinc-100">图2</span>
                <span
                  title="图2 已配置"
                  className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white shadow-md shadow-black/40"
                >
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 13 4.5 4.5L19 7" />
                  </svg>
                </span>
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-zinc-500/80 bg-zinc-900/40 p-4 text-center text-xs text-zinc-400">
                {isTextOnlyTag
                  ? <EditableHint k="designer.slot.textOnly" inputClassName="input !py-0.5 !px-2 text-xs !w-52" />
                  : (path === 'B' ? T('designer.slot.emptyProduct') : T('designer.slot.emptyScene'))}
              </div>
            ))}
          </section>
        )}

        {/* 画布区域（移动端）：位于「底图（图2）区域」下方、提示词区域上方 */}
        {canvasSlot}

        {/* 背景（仅 B 路径，先生成背景）
            可编辑的背景提示词输入框保留（生成 AI 背景要自己输入提示词）；
            内置背景提示词单独放在下方灰框里，比例标在该框尾部并随画布比例切换。 */}
        {path === 'B' && (
          <section>
            <label className="label block">背景提示词</label>
            <AutoArea
              className={promptCls}
              value={scenePrompt}
              onChange={setScenePrompt}
              placeholder="如：极简白色工作室，柔和自然光，木质地板"
            />
            {tagScenePrompt.trim() !== '' ? (
              <div className="mt-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-zinc-400"><EditableHint k="designer.tagSection.bgTitle" inputClassName="input !py-0.5 !px-2 text-xs !w-56" /></span>
                  {showTagBg ? (
                    <button
                      type="button"
                      className="shrink-0 text-[11px] text-zinc-400 transition hover:text-zinc-200"
                      onClick={() => setShowTagBg(false)}
                    >隐藏</button>
                  ) : (
                    <button
                      type="button"
                      className="shrink-0 text-[11px] text-zinc-400 transition hover:text-zinc-200"
                      onClick={() => setShowTagBg(true)}
                    >{T('designer.editLink')}</button>
                  )}
                </div>
                {showTagBg && (
                  /* 只读框：原样展示后台内置背景提示词（不再插入任何比例字样） */
                  <div className={`${promptGrayCls} mt-1.5 cursor-default select-text whitespace-pre-wrap`} aria-readonly="true">
                    {tagScenePrompt}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-2 rounded-lg border border-dashed border-zinc-800 p-3 text-center text-[11px] text-zinc-600">
                该模板标签未配置内置背景提示词，可在后台「模板 → 模板标签」里配置
              </div>
            )}
            <button
              disabled={busy.scene}
              onClick={() => run('scene', genScene)}
              className="mt-2 w-full rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:from-fuchsia-500 hover:to-violet-500 disabled:opacity-60"
            >
              {busy.scene ? '✦ AI 生成中…' : '✦ AI 生成含产品背景'}
            </button>
            <div className="mt-1 text-[10px] text-zinc-500"><EditableHint k="designer.sendBg" inputClassName="input !py-0.5 !px-2 text-[10px] !w-72" /></div>
          </section>
        )}

        {/* 文字样式（后生成文字）：AI文案内容始终显示；内置文字样式提示词默认隐藏，点右侧「修改」展开 */}
        {textFull.trim() !== '' ? (
          <section>
            <label className="label block"><EditableHint k="designer.tagSection.textTitle" inputClassName="input !py-0.5 !px-2 text-xs !w-56" /></label>
            <AutoArea
              className={promptCls}
              value={textPrompt}
              onChange={setTextPrompt}
              placeholder="模板自带的文字样式提示词"
            />
            {tagTextPrompt.trim() !== '' && (
              <div className="mt-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-zinc-400"><EditableHint k="designer.tagSection.tagTextTitle" inputClassName="input !py-0.5 !px-2 text-xs !w-56" /></span>
                  {showTagText ? (
                    <button
                      type="button"
                      className="shrink-0 text-[11px] text-zinc-400 transition hover:text-zinc-200"
                      onClick={() => setShowTagText(false)}
                    >隐藏</button>
                  ) : (
                    <button
                      type="button"
                      className="shrink-0 text-[11px] text-zinc-400 transition hover:text-zinc-200"
                      onClick={() => setShowTagText(true)}
                    >{T('designer.editLink')}</button>
                  )}
                </div>
                {showTagText && (
                  <AutoArea
                    className={`${promptGrayCls} mt-1.5`}
                    value={tagTextPrompt}
                    onChange={(v) => setTagPrompts(v, tagScenePrompt)}
                    placeholder="后台模板标签配置的默认提示词（可修改）"
                  />
                )}
              </div>
            )}
            <button disabled={busy.text} onClick={() => run('text', genText)} className="btn-primary mt-1.5 w-full">
              {busy.text ? '✦ AI 生成中…' : '✦ AI 生成预览图'}
            </button>
            <div className="mt-1 text-[10px] text-zinc-500"><EditableHint k="designer.sendText" inputClassName="input !py-0.5 !px-2 text-[10px] !w-72" /></div>
          </section>
        ) : (
          <section>
            <div className="rounded-lg border border-dashed border-zinc-800 p-3 text-center text-[11px] text-zinc-600">
              该模板标签未配置 AI 文字样式提示词，可在后台「模板 → 模板标签」里配置
            </div>
          </section>
        )}
      </div>

      <MaterialPicker
        type={pickerType ?? 'scene'}
        open={pickerType !== null}
        onClose={() => setPickerType(null)}
        onPick={(a) => {
          if (pickerType === 'product') void pickProductAsset(a.url, a.name || undefined);
          else if (isPuzzleTag) void pickPuzzleAsset(a.url, a.name || undefined);
          else void pickSceneAsset(a.url, a.name || undefined);
        }}
      />
      <Modal
        open={pendingPath !== null}
        title={T('designer.switch.title')}
        onClose={() => setPendingPath(null)}
        footer={
          <>
            <button className="btn-soft" onClick={() => setPendingPath(null)}>取消</button>
            <button className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-500" onClick={leaveWithoutSave}>{T('designer.switch.discard')}</button>
            <button className="btn-primary" onClick={confirmSwitch}>{T('designer.switch.save')}</button>
          </>
        }
      >
        <p className="text-sm text-zinc-300">
          {T('designer.switch.line1').replace('{path}', pendingPath?.path === 'B' ? T('designer.pathLabel.b') : T('designer.pathLabel.a'))}
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          <EditableHint k="designer.switch.line2" inputClassName="input !py-0.5 !px-2 text-xs !w-[26rem]" />
        </p>
      </Modal>
    </aside>
  );
}
