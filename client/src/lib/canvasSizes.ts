/**
 * 画布比例（前端只展示比例，不展示像素）。
 * 像素值仅用于实际画布分辨率与导出，保证清晰度与 AI 出图尺寸合法。
 */
export interface CanvasRatio {
  /** 比例标识，如 '3:4' */
  ratio: string;
  w: number;
  h: number;
  /** 比例的中文用途说明 */
  hint: string;
}

export const CANVAS_RATIOS: CanvasRatio[] = [
  { ratio: '3:4', w: 1080, h: 1440, hint: '小红书封面（默认）' },
  { ratio: '1:1', w: 1080, h: 1080, hint: '方形' },
  { ratio: '16:9', w: 1920, h: 1080, hint: '横版' },
  { ratio: '9:16', w: 1080, h: 1920, hint: '手机全屏竖版' },
];

/** 由画布像素尺寸反推比例标识（容差比较，取最接近的一项） */
export function ratioForSize(w: number, h: number): string {
  if (!w || !h) return CANVAS_RATIOS[0].ratio;
  const target = w / h;
  let best = CANVAS_RATIOS[0];
  let bestDiff = Infinity;
  for (const r of CANVAS_RATIOS) {
    const diff = Math.abs(r.w / r.h - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r;
    }
  }
  return best.ratio;
}

/** 比例 → 像素尺寸 */
export function sizeForRatio(ratio: string): { w: number; h: number } {
  const hit = CANVAS_RATIOS.find((r) => r.ratio === ratio);
  return hit ? { w: hit.w, h: hit.h } : { w: CANVAS_RATIOS[0].w, h: CANVAS_RATIOS[0].h };
}

/** 所有已知比例标识（用于在提示词里定位并替换比例文字） */
export const ALL_RATIO_TOKENS = ['3:4', '4:3', '1:1', '16:9', '9:16', '2:3', '3:2', '4:5', '5:4'];

/**
 * 把提示词里出现的「画面比例 / 比例」文字替换为当前画布比例。
 * 例如内置提示词含 '3:4'，前端选 1:1 时替换为 '1:1'。
 * 返回替换后的文本以及是否发生过替换（用于颜色区分）。
 */
export function replaceRatioInPrompt(text: string, ratio: string): { text: string; replaced: boolean } {
  if (!text) return { text: '', replaced: false };
  let replaced = false;
  let out = text;
  for (const token of ALL_RATIO_TOKENS) {
    if (token === ratio) continue;
    const escaped = token.replace(':', '\\s*[:：]\\s*');
    const re = new RegExp(escaped, 'g');
    if (re.test(out)) {
      replaced = true;
      out = out.replace(re, ratio);
    }
  }
  return { text: out, replaced };
}

/** 在文本里找出当前比例出现的位置（用于高亮显示） */
export function splitByRatio(text: string, ratio: string): { part: string; isRatio: boolean }[] {
  if (!text) return [];
  const escaped = ratio.replace(':', '\\s*[:：]\\s*');
  const re = new RegExp(`(${escaped})`, 'g');
  return text
    .split(re)
    .filter((s) => s !== '')
    .map((s) => ({ part: s, isRatio: re.test(s) && new RegExp(`^${escaped}$`).test(s) }));
}

/**
 * 从提示词里找出第一个比例（如「画面比例 3:4」里的 3:4）。
 * 找不到返回 null —— 用于「文字样式生图比例以内置文字提示词为准」：
 * 提示词里没写比例就不传固定尺寸，交给 AI 自行决定。
 */
export function findRatioInPrompt(text: string): { w: number; h: number; ratio: string } | null {
  if (!text) return null;
  // 支持 3:4 / 3：4 / 3 : 4，也支持「9x16」这种写法
  const m = text.match(/(\d{1,2})\s*[:：x×]\s*(\d{1,2})/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!a || !b) return null;
  return { w: a, h: b, ratio: `${a}:${b}` };
}

/**
 * 按任意比例算出合法的 AI 出图尺寸（16 的倍数、边长 ≤3840、总像素在合理区间）。
 * 用于「文字样式生图比例以内置提示词为准」——不写死像素，只按提示词比例推算。
 * 做法：以短边为基准向上取 16 的倍数，再推出长边，尽量贴近原始比例。
 */
export function aiSizeForRatio(rw: number, rh: number): string {
  const a = Math.max(1, Math.round(rw));
  const b = Math.max(1, Math.round(rh));
  const MAX = 3840;
  const MIN_SHORT = 720; // 短边下限，保证清晰度
  const round16 = (v: number) => Math.max(16, Math.round(v / 16) * 16);

  const short = Math.min(a, b);
  const long = Math.max(a, b);
  // 先按「长边 ≈ 1600」估，再按短边下限兜底
  let shortPx = round16(1600 * (short / long));
  if (shortPx < MIN_SHORT) shortPx = round16(MIN_SHORT);
  let longPx = round16(shortPx * (long / short));
  if (longPx > MAX) {
    longPx = round16(MAX);
    shortPx = round16(longPx * (short / long));
  }
  // 还原方向：a 是宽、b 是高
  const w = a >= b ? longPx : shortPx;
  const h = a >= b ? shortPx : longPx;
  return `${w}x${h}`;
}
