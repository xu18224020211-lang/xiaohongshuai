import type { PuzzleCell } from './types';

/**
 * 拼图格子的矩形（相对容器左上角）。
 * 2 = 上下均分，3 = 上中下均分，4 = 2×2。
 */
export function puzzleCellRects(count: number, w: number, h: number, gap: number) {
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  if (count === 4) {
    const cw = (w - gap) / 2;
    const ch = (h - gap) / 2;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) rects.push({ x: c * (cw + gap), y: r * (ch + gap), w: cw, h: ch });
  } else {
    const ch = (h - gap * (count - 1)) / count;
    for (let i = 0; i < count; i++) rects.push({ x: 0, y: i * (ch + gap), w, h: ch });
  }
  return rects;
}

/**
 * 拼图格子内图片的最终几何：始终按「最小铺满」放大（zoom >= 1），
 * 位置夹在 [格 - 图, 0] 之间 —— 图片可以移动/缩放但永远被裁剪在格内。
 */
export function puzzleCellGeometry(cell: PuzzleCell, naturalW: number, naturalH: number, rectW: number, rectH: number) {
  const cover = Math.max(rectW / Math.max(1, naturalW), rectH / Math.max(1, naturalH));
  const zoom = Math.max(1, cell.zoom || 1);
  const dw = naturalW * cover * zoom;
  const dh = naturalH * cover * zoom;
  const minX = Math.min(0, rectW - dw);
  const minY = Math.min(0, rectH - dh);
  return {
    width: dw,
    height: dh,
    offsetX: Math.max(minX, Math.min(0, cell.offsetX || 0)),
    offsetY: Math.max(minY, Math.min(0, cell.offsetY || 0)),
  };
}

/**
 * 以画布高度为标准自适应：图片高度 = 画布高度，宽度按原图比例（可超出画布左右，被画布裁剪），
 * 水平居中、垂直贴顶 —— 所有放进画布的图默认按这个规则展示。
 */
export function fitHeightRect(naturalW: number, naturalH: number, boxW: number, boxH: number) {
  const nw = Math.max(1, naturalW);
  const nh = Math.max(1, naturalH);
  const s = boxH / nh;
  const width = nw * s;
  const height = boxH;
  return { x: (boxW - width) / 2, y: 0, width, height };
}

/**
 * 按比例铺满（cover）：保持图片比例，缩放到刚好盖住目标框并居中，
 * 超出部分会被画布裁剪。
 */
export function coverRect(naturalW: number, naturalH: number, boxW: number, boxH: number) {
  const nw = Math.max(1, naturalW);
  const nh = Math.max(1, naturalH);
  const s = Math.max(boxW / nw, boxH / nh);
  const width = nw * s;
  const height = nh * s;
  return { x: (boxW - width) / 2, y: (boxH - height) / 2, width, height };
}
