import { loadImage } from './image';

export interface ProductMask {
  original: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  display: HTMLCanvasElement;
  width: number;
  height: number;
}

let current: ProductMask | null = null;
/** 蒙版修改计数（用于判断是否有未保存的擦除/还原） */
let version = 0;
export function setCurrentMask(m: ProductMask | null) {
  current = m;
  version++;
}
export function getCurrentMask(): ProductMask | null {
  return current;
}
export function getMaskVersion(): number {
  return version;
}

function recompute(pm: ProductMask) {
  const ctx = pm.display.getContext('2d')!;
  ctx.clearRect(0, 0, pm.width, pm.height);
  ctx.drawImage(pm.original, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(pm.mask, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}

export async function createProductMask(url: string): Promise<ProductMask> {
  const img = await loadImage(url);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const original = document.createElement('canvas');
  original.width = w;
  original.height = h;
  original.getContext('2d')!.drawImage(img, 0, 0);
  const mask = document.createElement('canvas');
  mask.width = w;
  mask.height = h;
  const mctx = mask.getContext('2d')!;
  mctx.fillStyle = '#ffffff';
  mctx.fillRect(0, 0, w, h);
  const display = document.createElement('canvas');
  display.width = w;
  display.height = h;
  const pm: ProductMask = { original, mask, display, width: w, height: h };
  recompute(pm);
  return pm;
}

/** 平滑柔边衰减：d/r 从 0→1，强度 1→0（二次缓动） */
function softStops(mode: 'erase' | 'restore') {
  const stops: { pos: number; alpha: number }[] = [];
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const t = i / n; // 0=中心 1=边缘
    const falloff = Math.pow(Math.max(0, 1 - t * t), 1.6); // 中心1 → 边缘0，边缘段更平缓
    stops.push({ pos: t, alpha: Math.round(falloff * 1000) / 1000 });
  }
  return stops;
}

/** 在蒙版上画一笔（平滑柔边），mode=erase 擦除 / restore 还原 */
export function brushStroke(pm: ProductMask, x: number, y: number, radius: number, mode: 'erase' | 'restore') {
  const ctx = pm.mask.getContext('2d')!;
  const r = Math.max(1, radius);
  ctx.save();
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  const color = (a: number) => (mode === 'erase' ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`);
  if (mode === 'erase') {
    ctx.globalCompositeOperation = 'destination-out';
  } else {
    ctx.globalCompositeOperation = 'source-over';
  }
  for (const s of softStops(mode)) {
    grad.addColorStop(s.pos, color(s.alpha));
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  recompute(pm);
  version++;
}
