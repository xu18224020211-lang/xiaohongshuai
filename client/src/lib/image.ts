import type { OverlayItem, PlacedImage, PuzzleState } from './types';
import { puzzleCellRects, puzzleCellGeometry, coverRect } from './puzzle';
export { coverRect } from './puzzle';

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败: ' + url));
    img.src = url;
  });
}

export async function loadImageSize(url: string): Promise<{ w: number; h: number }> {
  const img = await loadImage(url);
  return { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
}

const cache = new Map<string, HTMLImageElement | HTMLCanvasElement>();

/** 获取可用于 Konva 的图片对象 */
export async function getDrawable(
  url: string,
  removeWhite: boolean
): Promise<HTMLImageElement | HTMLCanvasElement> {
  const key = `${url}|${removeWhite ? 'rw' : 'raw'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const img = await loadImage(url);
  if (!removeWhite) {
    cache.set(key, img);
    return img;
  }
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    if (r > 232 && g > 232 && b > 232) d[i + 3] = 0;
  }
  ctx.putImageData(id, 0, 0);
  cache.set(key, c);
  return c;
}

export function invalidateImageCache() {
  cache.clear();
}

/** 根据画布宽高算一个合法的 AI size（16 倍数、像素范围、单边≤3840），用于场景生成贴合画布比例 */
export function sizeForCanvas(w: number, h: number): string {
  let W = Math.max(16, Math.round(w / 16) * 16);
  let H = Math.max(16, Math.round(h / 16) * 16);
  while (W * H < 655360 && W < 3840 && H < 3840) {
    W *= 2;
    H *= 2;
  }
  const scale = Math.min(1, 3840 / W, 3840 / H, Math.sqrt(8294400 / (W * H)));
  W = Math.max(16, Math.round((W * scale) / 16) * 16);
  H = Math.max(16, Math.round((H * scale) / 16) * 16);
  return `${W}x${H}`;
}

interface DrawItem extends OverlayItem {
  drawable: HTMLImageElement | HTMLCanvasElement;
}

function drawPlaced(ctx: CanvasRenderingContext2D, img: CanvasImageSource, p: PlacedImage) {
  ctx.save();
  ctx.translate(p.x + p.width / 2, p.y + p.height / 2);
  ctx.rotate((p.rotation * Math.PI) / 180);
  ctx.drawImage(img, -p.width / 2, -p.height / 2, p.width, p.height);
  ctx.restore();
}

/** 合成导出（按画布原始分辨率） */
export async function compositeLayers(opts: {
  canvasWidth: number;
  canvasHeight: number;
  layer1: PlacedImage | null;
  layer2: PlacedImage | null;
  layer2Image?: HTMLCanvasElement | HTMLImageElement | null;
  layer3: DrawItem[];
  puzzle?: PuzzleState | null;
  transparent: boolean;
}): Promise<HTMLCanvasElement> {
  const { canvasWidth, canvasHeight, layer1, layer2, layer2Image, layer3, puzzle, transparent } = opts;
  const c = document.createElement('canvas');
  c.width = canvasWidth;
  c.height = canvasHeight;
  const ctx = c.getContext('2d')!;

  if (!transparent) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  if (layer1) {
    const img = await getDrawable(layer1.url, false);
    drawPlaced(ctx, img, layer1);
  }
  // 拼图容器（宫格，按比例裁剪在格内）
  if (puzzle && puzzle.visible !== false) {
    const rects = puzzleCellRects(puzzle.count, puzzle.width, puzzle.height, puzzle.gap);
    for (let i = 0; i < rects.length; i++) {
      const cell = puzzle.cells[i];
      if (!cell) continue;
      const img = await getDrawable(cell.url, false);
      const natW = (img as HTMLImageElement).naturalWidth || img.width;
      const natH = (img as HTMLImageElement).naturalHeight || img.height;
      const rect = rects[i];
      const geo = puzzleCellGeometry(cell, natW, natH, rect.w, rect.h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(puzzle.x + rect.x, puzzle.y + rect.y, rect.w, rect.h);
      ctx.clip();
      ctx.drawImage(img, puzzle.x + rect.x + geo.offsetX, puzzle.y + rect.y + geo.offsetY, geo.width, geo.height);
      ctx.restore();
    }
  }

  if (layer2) {
    const img = layer2Image ?? (await getDrawable(layer2.url, false));
    drawPlaced(ctx, img, layer2);
  }

  const sorted = [...layer3].sort((a, b) => a.z - b.z);
  for (const item of sorted) {
    ctx.save();
    ctx.globalAlpha = item.opacity;
    ctx.translate(item.x + item.width / 2, item.y + item.height / 2);
    ctx.rotate((item.rotation * Math.PI) / 180);
    ctx.drawImage(item.drawable, -item.width / 2, -item.height / 2, item.width, item.height);
    ctx.restore();
  }
  return c;
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
