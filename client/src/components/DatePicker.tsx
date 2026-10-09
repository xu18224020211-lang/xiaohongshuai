import { useEffect, useMemo, useRef, useState } from 'react';

/** 把 'YYYY-MM-DD' 解析为 Date（本地时区，避免 UTC 偏移） */
function parseDate(v: string): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * 日历选择器：点击输入框弹出日历，点某一天即选中并关闭。
 * value / onChange 使用 'YYYY-MM-DD' 字符串（空串表示未设置）。
 */
export default function DatePicker({
  value, onChange, placeholder = '点击选择日期', clearable = true, className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = parseDate(value);
  const [view, setView] = useState(() => selected || new Date());

  useEffect(() => {
    if (open) setView(parseDate(value) || new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const grid = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [view]);

  const today = fmt(new Date());

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input flex w-full items-center justify-between gap-2 text-left"
      >
        <span className={value ? 'text-zinc-100' : 'text-zinc-500'}>{value || placeholder}</span>
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-current text-zinc-500" strokeWidth="1.8">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[80] mt-1.5 w-[268px] rounded-xl border border-zinc-700 bg-zinc-900 p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 transition hover:bg-zinc-800 hover:text-white" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}>‹</button>
            <span className="text-sm font-semibold text-zinc-100">{view.getFullYear()} 年 {view.getMonth() + 1} 月</span>
            <button type="button" className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 transition hover:bg-zinc-800 hover:text-white" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}>›</button>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] text-zinc-500">
            {WEEK.map((w) => <span key={w}>{w}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((d, i) => {
              if (!d) return <span key={`p${i}`} />;
              const v = fmt(d);
              const isSel = v === value;
              const isToday = v === today;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => { onChange(v); setOpen(false); }}
                  className={`h-8 rounded-lg text-xs transition ${
                    isSel ? 'bg-indigo-600 font-semibold text-white'
                      : isToday ? 'bg-zinc-800 text-indigo-300 hover:bg-zinc-700'
                        : 'text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-zinc-800 pt-2">
            <button type="button" className="text-[11px] text-zinc-400 transition hover:text-white" onClick={() => { const t = new Date(); setView(t); onChange(fmt(t)); setOpen(false); }}>今天</button>
            {clearable && value && (
              <button type="button" className="text-[11px] text-zinc-400 transition hover:text-red-300" onClick={() => { onChange(''); setOpen(false); }}>清除</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
