import type { DesignPath, OverlayItem, PlacedImage, PuzzleState } from './types';

/** 图层面板里的一个条目（按「从底层往上」的顺序编号） */
export interface LayerEntry {
  /** 图层编号：1 = 最底层 */
  no: number;
  /** 显示名：图层1 / 图层2 / …… */
  label: string;
  /** 选择用的 id：layer1 / layer2 / puzzle / puzzle:i / ov-xxx */
  id: string;
  kind: 'image' | 'puzzle' | 'overlay';
  visible: boolean;
  locked: boolean;
}

/**
 * 按「底层 → 上层」的顺序给出图层编号。
 * 叠放顺序（下 → 上）：场景底层 → 拼图容器 → 产品中间层 → 文字/贴纸（按 z 升序）
 * 名称统一为 图层1、图层2、……，不再显示图片文件名。
 */
export function buildLayerEntries(opts: {
  path: DesignPath;
  layer1: PlacedImage | null;
  layer2: PlacedImage | null;
  puzzle: PuzzleState | null;
  layer3: OverlayItem[];
}): LayerEntry[] {
  const { layer1, layer2, puzzle, layer3 } = opts;
  const bottomUp: Omit<LayerEntry, 'no' | 'label'>[] = [];

  if (layer1) {
    bottomUp.push({ id: 'layer1', kind: 'image', visible: layer1.visible !== false, locked: !!layer1.locked });
  }
  if (puzzle && puzzle.visible !== false) {
    bottomUp.push({ id: 'puzzle', kind: 'puzzle', visible: true, locked: false });
  }
  if (layer2) {
    bottomUp.push({ id: 'layer2', kind: 'image', visible: layer2.visible !== false, locked: !!layer2.locked });
  }
  // 文字 / 贴纸：z 越小越靠下
  [...layer3]
    .sort((a, b) => a.z - b.z)
    .forEach((it) => {
      bottomUp.push({ id: it.id, kind: 'overlay', visible: it.visible !== false, locked: !!it.locked });
    });

  return bottomUp.map((e, i) => ({ ...e, no: i + 1, label: `图层${i + 1}` }));
}

/** 单个 id 对应的图层编号（找不到返回 null） */
export function layerNoOf(entries: LayerEntry[], id: string | null): number | null {
  if (!id) return null;
  const hit = entries.find((e) => e.id === id);
  return hit ? hit.no : null;
}

/** 拼图容器占用的图层号与其中每一格的编号（格子按 1..n 依次编号） */
export function puzzleCellLabels(entries: LayerEntry[], count: number): { box: LayerEntry | null; cellLabels: string[] } {
  const box = entries.find((e) => e.kind === 'puzzle') || null;
  if (!box) return { box: null, cellLabels: Array.from({ length: count }, (_, i) => `第 ${i + 1} 格`) };
  return {
    box,
    cellLabels: Array.from({ length: count }, (_, i) => `第 ${i + 1} 格`),
  };
}
