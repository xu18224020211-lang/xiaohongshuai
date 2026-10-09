import { create } from 'zustand';
import type { ToolMode, DesignPath, DesignState, OverlayItem, PlacedImage, PuzzleCell, PuzzleState, UndoStep } from '../lib/types';
import { puzzleCellRects, puzzleCellGeometry, fitHeightRect } from '../lib/puzzle';
export { puzzleCellRects, puzzleCellGeometry } from '../lib/puzzle';

let counter = 0;
const uid = () => `ov-${Date.now()}-${counter++}`;

const UNDO_LIMIT = 20;
/** pushStep 置位：订阅器据此在状态更新后补记「操作完成后」的最新状态（用于跳回到最新一步） */
let pendingPush = false;
/**
 * 不记入历史的「设置类」操作：切换界面 / 拼图张数 / 拼图容器调整 / 移除拼图容器 / 改画布尺寸。
 * 历史只保留对图片本身有明显可见变化的操作（保留变化前 + 变化后）。
 */
const SKIP_STEP_LABELS = ['切换界面', '调整拼图容器', '移除拼图容器', '修改画布尺寸'];
const isSkippedStep = (label: string) => SKIP_STEP_LABELS.includes(label) || /^\d+ ?拼图$/.test(label);
/**
 * 生成一步历史记录（最多保留前后共 20 步）。
 * 指针式历史：undoSteps[i] 记录第 i+1 步「之前」的状态，undoPos 表示当前处于第几步之后；
 * 跳转到某一步只移动指针，不删除其它记录。
 */
const pushStep = (st: DesignState, label: string): { undoSteps: UndoStep[]; undoPos: number } => {
  if (isSkippedStep(label)) {
    // 不记录：返回原样，画布照常更新
    return { undoSteps: st.undoSteps || [], undoPos: st.undoPos ?? (st.undoSteps || []).length };
  }
  const step: UndoStep = {
    label,
    at: Date.now(),
    path: st.path,
    canvasWidth: st.canvasWidth,
    canvasHeight: st.canvasHeight,
    layer1: st.layer1 ? { ...st.layer1 } : null,
    layer2: st.layer2 ? { ...st.layer2 } : null,
    layer3: st.layer3.map((i) => ({ ...i })),
    puzzle: st.puzzle ? { ...st.puzzle, cells: st.puzzle.cells.map((c) => (c ? { ...c } : null)) } : null,
    selectedId: st.selectedId,
  };
  pendingPush = true;
  // 回退过历史后再做新操作：截断「指针之后」的分支
  const kept = (st.undoSteps || []).slice(0, st.undoPos ?? (st.undoSteps || []).length);
  let next = [...kept, step];
  let pos = next.length;
  if (next.length > UNDO_LIMIT) {
    next = next.slice(next.length - UNDO_LIMIT);
    pos = next.length;
  }
  return { undoSteps: next, undoPos: pos };
};
const applyStep = (s: UndoStep) => ({
  path: s.path,
  canvasWidth: s.canvasWidth,
  canvasHeight: s.canvasHeight,
  layer1: s.layer1 ? { ...s.layer1 } : null,
  layer2: s.layer2 ? { ...s.layer2 } : null,
  layer3: s.layer3.map((i) => ({ ...i })),
  puzzle: s.puzzle ? { ...s.puzzle, cells: s.puzzle.cells.map((c) => (c ? { ...c } : null)) } : null,
  selectedId: s.selectedId,
});

const initial: DesignState = {
  path: 'A',
  canvasWidth: 1080,
  canvasHeight: 1440,
  layer1: null,
  layer2: null,
  layer3: [],
  selectedId: null,
  textPrompt: '',
  scenePrompt: '极简白色工作室，柔和自然光，木质地板',
  aiSize: '1024x1360',
  designName: '未命名设计1',
  designId: null,
  projectId: null,
  templatePreview: null,
  brushMode: 'select' as ToolMode,
  undoSteps: [],
  undoPos: 0,
  undoTip: null,
  tagTypeId: null,
  puzzle: null,
  baseTextPrompt: '',
  baseScenePrompt: '',
  tagTextPrompt: '',
  tagScenePrompt: '',
  brushSize: 40,
  freeTransform: false,
  aiBusy: false,
  zoom: 100,
  plusDisabled: false,
  onPlus: null,
  pendingSwitch: null,
  saveNameOpen: false,
  saveNameFlow: null,
};

interface DesignActions {
  reset: () => void;
  /** 画布缩放（20% ~ 200%，在自适应基础上叠加） */
  setZoom: (v: number) => void;
  /** 清空画布内容（切换模板标签时用；保留提示词与画布尺寸） */
  resetCanvasForSwitch: () => void;
  /** 切换模板标签时待保存的目标（保存成功后由 Designer 应用） */
  setPendingSwitch: (v: { path: DesignPath; tagId: number } | null) => void;
  /** 打开「填写设计名称」弹框：save＝仅保存；switch＝保存后清空画布并切换标签 */
  openSaveName: (flow: 'save' | 'switch') => void;
  closeSaveName: () => void;
  /** 画布上的「+」号按钮目标（由画布页面注册处理函数；textOnly 时禁用不显示） */
  setPlus: (disabled: boolean, handler: ((target: string) => void) | null) => void;
  /** CTRL+Z 撤销（最多 20 条记录） */
  undo: () => boolean;
  /** 历史面板：跳转到第 index 步 */
  undoTo: (index: number) => boolean;
  hydrate: (s: Partial<DesignState>) => void;
  setPath: (p: DesignPath) => void;
  /** 选择模板标签（决定画布界面 A/B 与是否拼图） */
  setTagType: (id: number | null) => void;
  /** 记录模板自身提示词（标签提示词会追加到其下方） */
  setBasePrompts: (text: string, scene: string) => void;
  /** 标签默认提示词（灰色展示、可编辑） */
  setTagPrompts: (text: string, scene: string) => void;
  /**
   * AI 生成成功后的图层整理：
   * 新图（target 层）保持在原图下方显示，原底图/产品图默认隐藏。
   */
  hideLowerLayersAfterGenerate: (target: 'layer1' | 'layer2') => void;
  /** 设置拼图张数（2/3/4），同步调整容器与格子 */
  setPuzzleCount: (count: 2 | 3 | 4) => void;
  /** 往某一格放入图片（直接铺满该格） */
  setPuzzleCell: (index: number, url: string, name?: string, naturalW?: number, naturalH?: number) => void;
  /** 调整某一格内图片的缩放 / 位置（会自动夹在格内） */
  updatePuzzleCell: (index: number, patch: Partial<PuzzleCell>) => void;
  /** 清空某一格 */
  clearPuzzleCell: (index: number) => void;
  /** 调整拼图容器整体（拖动 / 缩放） */
  updatePuzzle: (patch: Partial<Pick<PuzzleState, 'x' | 'y' | 'width' | 'height' | 'gap' | 'visible' | 'name'>>) => void;
  togglePuzzleVisible: () => void;
  /** 移除拼图容器（切换到非拼图标签时调用，避免画布里残留宫格） */
  removePuzzle: () => void;
  setCanvas: (w: number, h: number) => void;
  setLayer1: (url: string, name?: string, naturalW?: number, naturalH?: number) => void;
  setLayer2: (url: string, naturalW: number, naturalH: number, name?: string) => void;
  updateLayer1: (patch: Partial<PlacedImage>) => void;
  updateLayer2: (patch: Partial<PlacedImage>) => void;
  toggleLayer1Lock: () => void;
  toggleLayer2Lock: () => void;
  toggleOverlayLock: (id: string) => void;
  /** 眼睛：显示 / 隐藏 */
  toggleLayer1Visible: () => void;
  toggleLayer2Visible: () => void;
  toggleOverlayVisible: (id: string) => void;
  removeLayer2: () => void;
  /** 移除底图（场景底层） */
  removeLayer1: () => void;
  /** 删除当前选中的图层 / 元素（Delete 键与图层面板共用） */
  deleteSelected: () => void;
  addOverlay: (kind: OverlayItem['kind'], url: string, w: number, h: number) => void;
  updateOverlay: (id: string, patch: Partial<OverlayItem>) => void;
  removeOverlay: (id: string) => void;
  duplicateOverlay: (id: string) => void;
  select: (id: string | null) => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;
  setTextPrompt: (p: string) => void;
  setScenePrompt: (p: string) => void;
  setAiSize: (s: string) => void;
  setDesignName: (n: string) => void;
  setDesignId: (id: number | null) => void;
  setProjectId: (id: number | null) => void;
  setTemplatePreview: (url: string | null) => void;
  setBrushMode: (m: ToolMode) => void;
  setBrushSize: (s: number) => void;
  setAiBusy: (v: boolean) => void;
  setFreeTransform: (v: boolean) => void;
  snapshot: () => { layers: unknown; canvasWidth: number; canvasHeight: number };
}

export const useDesign = create<DesignState & DesignActions>((set, get) => ({
  ...initial,

  reset: () => set({ ...initial }),

  /** 撤销上一步（最多记录 20 步） */
  undo: () => {
    const st = get();
    const steps = st.undoSteps || [];
    const pos = st.undoPos ?? steps.length;
    if (pos <= 0 || !steps.length) return false;
    set({ ...applyStep(steps[pos - 1]), undoPos: pos - 1 });
    return true;
  },

  /** 历史面板：跳转到第 index 步（0 基）之后的状态（保留其它记录，只移动指针） */
  undoTo: (index: number) => {
    const st = get();
    const steps = st.undoSteps || [];
    if (index < 0 || index >= steps.length) return false;
    if ((st.undoPos ?? steps.length) - 1 === index) return true; // 已在当前步
    // 第 index 步之后的状态 = 第 index+2 步之前的状态；最后一步用 undoTip（操作完成后的最新状态）
    const target = index + 1 < steps.length ? steps[index + 1] : st.undoTip;
    if (!target) return false;
    set({ ...applyStep(target), undoPos: index + 1 });
    return true;
  },

  /**
   * 载入设计稿：统一把全部图层的「锁定」清掉（需求：所有图层默认不要锁定），
   * 让用户打开历史设计后可以直接拖动/缩放。
   */
  hydrate: (s) =>
    set({
      ...s,
      layer1: s.layer1 ? { ...s.layer1, locked: false } : s.layer1 ?? null,
      layer2: s.layer2 ? { ...s.layer2, locked: false } : s.layer2 ?? null,
      layer3: (s.layer3 || []).map((i) => ({ ...i, locked: false })),
    }),

  setPath: (p) =>
    set((st) => ({
      path: p,
      layer1: null,
      layer2: null,
      puzzle: null,
      selectedId: null,
      brushMode: 'select',
      ...pushStep(st, '切换界面'),
    })),

  setTagType: (id) => set({ tagTypeId: id }),

  setBasePrompts: (text, scene) => set({ baseTextPrompt: text || '', baseScenePrompt: scene || '' }),

  setTagPrompts: (text, scene) =>
    set(() => ({
      tagTextPrompt: text || '',
      tagScenePrompt: scene || '',
    })),

  /**
   * AI 生成成功后：新生成的图默认显示，且位于原图下方；
   * 原底图 / 产品图默认隐藏（眼睛关闭），可在右侧图层面板随时打开对比。
   */
  hideLowerLayersAfterGenerate: (target) =>
    set((st) => {
      if (target === 'layer1') {
        return {
          // 新背景图落到最底层：原产品层保持在其上方，但默认隐藏避免叠加重复
          layer2: st.layer2 ? { ...st.layer2, visible: false } : st.layer2,
          selectedId: 'layer1',
          ...pushStep(st, '生成背景图'),
        };
      }
      // 生成产品/文字类结果时，隐藏原底图
      return {
        layer1: st.layer1 ? { ...st.layer1, visible: false } : st.layer1,
        ...pushStep(st, '生成图层'),
      };
    }),

  setPuzzleCount: (count) =>
    set((st) => {
      // 宫格容器按比例铺满整块画布、格子之间不留间隔
      const width = st.canvasWidth;
      const height = st.canvasHeight;
      const gap = 0;
      const prev = st.puzzle?.cells ?? [];
      const cells: (PuzzleCell | null)[] = Array.from({ length: count }, (_, i) => prev[i] ?? null);
      const next: PuzzleState = {
        count,
        x: 0,
        y: 0,
        width,
        height,
        gap,
        cells,
        visible: st.puzzle?.visible !== false,
      };
      return { puzzle: next, selectedId: 'puzzle', ...pushStep(st, `${count} 拼图`) };
    }),

  setPuzzleCell: (index, url, _name, naturalW, naturalH) =>
    set((st) => {
      if (!st.puzzle) return {};
      const rects = puzzleCellRects(st.puzzle.count, st.puzzle.width, st.puzzle.height, st.puzzle.gap);
      const rect = rects[index];
      if (!rect) return {};
      // 默认居中铺满该格（图片永远盖住格子，不会露底）
      let cx = 0;
      let cy = 0;
      if (naturalW && naturalH) {
        const cover = Math.max(rect.w / naturalW, rect.h / naturalH);
        cx = (rect.w - naturalW * cover) / 2;
        cy = (rect.h - naturalH * cover) / 2;
      }
      // 同样不保留原始文件名
      const cells = st.puzzle.cells.map((c, i) => (i === index ? { url, name: undefined, zoom: 1, offsetX: cx, offsetY: cy } : c));
      return {
        puzzle: { ...st.puzzle, cells },
        selectedId: `puzzle:${index}`,
        ...pushStep(st, `拼图第 ${index + 1} 格`),
      };
    }),

  updatePuzzleCell: (index, patch) =>
    set((st) => {
      if (!st.puzzle) return {};
      const cells = st.puzzle.cells.map((c, i) => (i === index && c ? { ...c, ...patch } : c));
      return { puzzle: { ...st.puzzle, cells }, ...pushStep(st, '调整拼图图片') };
    }),

  clearPuzzleCell: (index) =>
    set((st) => {
      if (!st.puzzle) return {};
      const cells = st.puzzle.cells.map((c, i) => (i === index ? null : c));
      return { puzzle: { ...st.puzzle, cells }, ...pushStep(st, '清空拼图格子') };
    }),

  updatePuzzle: (patch) => set((st) => (st.puzzle ? { puzzle: { ...st.puzzle, ...patch }, ...pushStep(st, '调整拼图容器') } : {})),

  togglePuzzleVisible: () => set((st) => (st.puzzle ? { puzzle: { ...st.puzzle, visible: st.puzzle.visible === false } } : {})),

  removePuzzle: () =>
    set((st) => (st.puzzle
      ? {
        puzzle: null,
        selectedId: st.selectedId === 'puzzle' || (typeof st.selectedId === 'string' && st.selectedId.startsWith('puzzle:')) ? null : st.selectedId,
        ...pushStep(st, '移除拼图容器'),
      }
      : {})),

  /**
   * 修改画布尺寸：原有元素与素材按比例缩放并上下左右居中
   */
  setCanvas: (w, h) =>
    set((st) => {
      const { undoSteps, undoPos } = pushStep(st, '修改画布尺寸');
      const s = Math.min(w / st.canvasWidth, h / st.canvasHeight);
      const recenter = <T extends { x: number; y: number; width: number; height: number; rotation?: number }>(it: T | null): T | null =>
        it
          ? { ...it, width: it.width * s, height: it.height * s, x: (w - it.width * s) / 2, y: (h - it.height * s) / 2 }
          : null;
      return {
        undoSteps,
        undoPos,
        canvasWidth: w,
        canvasHeight: h,
        // 底图：按新画布高度重新自适应（宽度按比例）
        layer1: st.layer1
          ? (() => {
              const natW = st.layer1.naturalWidth || st.layer1.width;
              const natH = st.layer1.naturalHeight || st.layer1.height;
              return { ...st.layer1, ...fitHeightRect(natW, natH, w, h), rotation: st.layer1.rotation };
            })()
          : null,
        layer2: recenter(st.layer2),
        // 文字 / AI 生成图：按新画布高度重新自适应；贴纸按比例缩放
        layer3: st.layer3.map((it) => {
          if (it.kind === 'text') {
            const ratio = it.width > 0 ? it.height / it.width : 1;
            const nw = it.width;
            const nh = nw * ratio;
            const r = fitHeightRect(nw, nh, w, h);
            return { ...it, ...r };
          }
          return {
            ...it,
            width: it.width * s,
            height: it.height * s,
            x: (w - it.width * s) / 2,
            y: (h - it.height * s) / 2,
          };
        }),
        // 拼图容器按比例铺满画布，格子内容等比缩放
        puzzle: st.puzzle
          ? {
              ...st.puzzle,
              x: 0,
              y: 0,
              width: w,
              height: h,
              cells: st.puzzle.cells.map((c) =>
                c ? { ...c, zoom: c.zoom, offsetX: c.offsetX * s, offsetY: c.offsetY * s } : null
              ),
            }
          : null,
      };
    }),

  setLayer1: (url, _name, naturalW, naturalH) =>
    set((st) => {
      // 默认以画布高度为标准、宽度按比例自适应（水平居中）
      const r = naturalW && naturalH
        ? fitHeightRect(naturalW, naturalH, st.canvasWidth, st.canvasHeight)
        : { x: 0, y: 0, width: st.canvasWidth, height: st.canvasHeight };
      return {
        ...pushStep(st, '设置底图'),
        // 所有图层默认不锁定，加入后即可直接拖动/缩放
        // 命名统一走「图层N」，不保留上传文件的原始文件名
        layer1: { url, name: undefined, ...r, rotation: 0, locked: false, visible: true },
        selectedId: null,
      };
    }),

  setLayer2: (url, naturalW, naturalH, _name) =>
    set((st) => {
      const { undoSteps, undoPos } = pushStep(st, '设置产品图');
      // 与原图/生成图一致：以画布高度为标准、宽度按比例自适应
      const r = fitHeightRect(naturalW, naturalH, st.canvasWidth, st.canvasHeight);
      return {
        undoSteps,
        undoPos,
        path: 'B',
        layer2: {
          url,
          // 同上：不保留原始文件名，列表里按「图层N」依次显示
          name: undefined,
          naturalWidth: naturalW,
          naturalHeight: naturalH,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          rotation: 0,
          // 默认不锁定（只有最底层默认锁定）；上传后在画布上直接可见
          // （生成「含产品背景」时再自动把产品层隐藏，避免与合成结果重复）
          locked: false,
          visible: true,
        },
        // 刚加入的产品图立刻显示变换控件（底图默认锁定，不加控件）
        selectedId: 'layer2',
      };
    }),

  updateLayer1: (patch) => set((st) => (st.layer1 ? { layer1: { ...st.layer1, ...patch }, ...pushStep(st, '调整底图') } : {})),
  updateLayer2: (patch) => set((st) => (st.layer2 ? { layer2: { ...st.layer2, ...patch }, ...pushStep(st, '调整产品图') } : {})),

  toggleLayer1Lock: () => set((st) => (st.layer1 ? { layer1: { ...st.layer1, locked: !st.layer1.locked } } : {})),
  toggleLayer2Lock: () => set((st) => (st.layer2 ? { layer2: { ...st.layer2, locked: !st.layer2.locked } } : {})),
  toggleOverlayLock: (id) =>
    set((st) => ({ layer3: st.layer3.map((i) => (i.id === id ? { ...i, locked: !i.locked } : i)) })),

  // 眼睛：睁眼显示 / 闭眼隐藏
  toggleLayer1Visible: () => set((st) => (st.layer1 ? { layer1: { ...st.layer1, visible: st.layer1.visible === false } } : {})),
  toggleLayer2Visible: () => set((st) => (st.layer2 ? { layer2: { ...st.layer2, visible: st.layer2.visible === false } } : {})),
  toggleOverlayVisible: (id) =>
    set((st) => ({ layer3: st.layer3.map((i) => (i.id === id ? { ...i, visible: i.visible === false } : i)) })),

  removeLayer2: () => set((st) => (st.layer2 && !st.layer2.locked ? { layer2: null, ...pushStep(st, '移除产品图') } : {})),

  removeLayer1: () => set((st) => (st.layer1 && !st.layer1.locked ? { layer1: null, ...pushStep(st, '移除底图') } : {})),

  /** 删除当前选中的图层（画布 Delete 键 / 图层面板删除按钮共用）；锁定图层不可删除 */
  deleteSelected: () =>
    set((st) => {
      const id = st.selectedId;
      if (!id) return {};
      if (id === 'layer1') return st.layer1 && !st.layer1.locked ? { layer1: null, selectedId: null, ...pushStep(st, '移除底图') } : {};
      if (id === 'layer2') return st.layer2 && !st.layer2.locked ? { layer2: null, selectedId: null, ...pushStep(st, '移除产品图') } : {};
      if (id === 'puzzle') return st.puzzle ? { puzzle: null, selectedId: null, ...pushStep(st, '移除拼图容器') } : {};
      if (id.startsWith('puzzle:')) {
        const idx = Number(id.split(':')[1]);
        if (!st.puzzle || !st.puzzle.cells[idx]) return {};
        const cells = st.puzzle.cells.map((c, i) => (i === idx ? null : c));
        return { puzzle: { ...st.puzzle, cells }, selectedId: null, ...pushStep(st, '清空拼图格子') };
      }
      const target = st.layer3.find((i) => i.id === id);
      if (target?.locked) return {}; // 锁定图层不可删除
      return {
        layer3: st.layer3.filter((i) => i.id !== id),
        selectedId: null,
        ...pushStep(st, '删除元素'),
      };
    }),

  addOverlay: (kind, url, w, h) => {
    const st = get();
    const maxZ = st.layer3.reduce((m, i) => Math.max(m, i.z), 0);
    // 文字 / AI 生成图：默认以画布高度为标准，宽度按比例自适应（水平居中、贴顶）
    // 贴纸：保持较小的默认尺寸，便于后续手动摆放
    let nw: number;
    let nh: number;
    let nx: number;
    let ny: number;
    if (kind === 'text') {
      const r = fitHeightRect(w, h, st.canvasWidth, st.canvasHeight);
      nw = r.width; nh = r.height; nx = r.x; ny = r.y;
    } else {
      const targetW = st.canvasWidth * 0.28;
      const ratio = w > 0 ? h / w : 1;
      nw = targetW;
      nh = targetW * ratio;
      nx = (st.canvasWidth - nw) / 2;
      ny = (st.canvasHeight - nh) / 2;
    }
    const item: OverlayItem = {
      id: uid(),
      kind,
      url,
      width: nw,
      height: nh,
      x: nx,
      y: ny,
      rotation: 0,
      opacity: 1,
      removeWhite: false,
      locked: false,
      visible: true,
      z: maxZ + 1,
    };
    set({ layer3: [...st.layer3, item], selectedId: item.id, ...pushStep(st, kind === 'text' ? '添加文字' : '添加元素') });
  },

  updateOverlay: (id, patch) =>
    set((st) => ({
      layer3: st.layer3.map((i) => (i.id === id ? { ...i, ...patch } : i)),
      ...pushStep(st, '调整元素'),
    })),

  removeOverlay: (id) =>
    set((st) => {
      const target = st.layer3.find((i) => i.id === id);
      if (target?.locked) return {}; // 锁定图层不可删除
      return {
        layer3: st.layer3.filter((i) => i.id !== id),
        selectedId: st.selectedId === id ? null : st.selectedId,
        ...pushStep(st, '删除元素'),
      };
    }),

  duplicateOverlay: (id) => {
    const st = get();
    const src = st.layer3.find((i) => i.id === id);
    if (!src) return;
    const maxZ = st.layer3.reduce((m, i) => Math.max(m, i.z), 0);
    const copy: OverlayItem = { ...src, id: uid(), x: src.x + 24, y: src.y + 24, z: maxZ + 1 };
    set({ layer3: [...st.layer3, copy], selectedId: copy.id, ...pushStep(st, '复制元素') });
  },

  select: (id) => set({ selectedId: id }),

  bringForward: (id) =>
    set((st) => {
      const items = [...st.layer3].sort((a, b) => a.z - b.z);
      const idx = items.findIndex((i) => i.id === id);
      if (idx < 0 || idx === items.length - 1) return {};
      const a = items[idx];
      const b = items[idx + 1];
      const tmp = a.z;
      a.z = b.z;
      b.z = tmp;
      return { layer3: items };
    }),

  sendBackward: (id) =>
    set((st) => {
      const items = [...st.layer3].sort((a, b) => a.z - b.z);
      const idx = items.findIndex((i) => i.id === id);
      if (idx <= 0) return {};
      const a = items[idx];
      const b = items[idx - 1];
      const tmp = a.z;
      a.z = b.z;
      b.z = tmp;
      return { layer3: items };
    }),

  setTextPrompt: (p) => set({ textPrompt: p }),
  setScenePrompt: (p) => set({ scenePrompt: p }),
  setAiSize: (s) => set({ aiSize: s }),
  setDesignName: (n) => set({ designName: n }),
  setDesignId: (id) => set({ designId: id }),
  setProjectId: (id) => set({ projectId: id }),
  setTemplatePreview: (url) => set({ templatePreview: url }),
  setBrushMode: (m) => set({ brushMode: m }),
  setBrushSize: (s) => set({ brushSize: s }),
  setAiBusy: (v) => set({ aiBusy: v }),
  setFreeTransform: (v) => set({ freeTransform: v }),

  setZoom: (v) => set({ zoom: Math.max(20, Math.min(200, Math.round(v))) }),
  setPlus: (disabled, handler) => set({ plusDisabled: disabled, onPlus: handler }),

  resetCanvasForSwitch: () =>
    set({ layer1: null, layer2: null, layer3: [], puzzle: null, selectedId: null, templatePreview: null }),
  setPendingSwitch: (v) => set({ pendingSwitch: v }),
  openSaveName: (flow) => set({ saveNameOpen: true, saveNameFlow: flow }),
  closeSaveName: () => set({ saveNameOpen: false, saveNameFlow: null }),

  snapshot: () => {
    const st = get();
    return {
      canvasWidth: st.canvasWidth,
      canvasHeight: st.canvasHeight,
      layers: {
        path: st.path,
        layer1: st.layer1,
        layer2: st.layer2,
        layer3: st.layer3,
        puzzle: st.puzzle,
      },
    };
  },
}));

/**
 * 每次「新操作」后记录一次最新状态（undoTip）：
 * undoSteps 里存的是每步之前的状态，最新状态（最后一步之后）单独留一份，
 * 这样历史面板跳回最后一步时也能还原。
 */
let appending = false;
useDesign.subscribe((st) => {
  if (!pendingPush || appending) return;
  pendingPush = false;
  const last = (st.undoSteps || [])[st.undoSteps.length - 1];
  appending = true;
  useDesign.setState({
    undoTip: {
      label: last?.label ?? '操作',
      at: Date.now(),
      path: st.path,
      canvasWidth: st.canvasWidth,
      canvasHeight: st.canvasHeight,
      layer1: st.layer1 ? { ...st.layer1 } : null,
      layer2: st.layer2 ? { ...st.layer2 } : null,
      layer3: st.layer3.map((i) => ({ ...i })),
      puzzle: st.puzzle ? { ...st.puzzle, cells: st.puzzle.cells.map((c) => (c ? { ...c } : null)) } : null,
      selectedId: st.selectedId,
    },
  });
  appending = false;
});
