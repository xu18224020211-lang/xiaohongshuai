import type { ReactNode } from 'react';

export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 'md',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** 弹窗宽度：sm=28rem md=32rem lg=48rem xl=64rem(1024px) 2xl=80rem(1280px) */
  width?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}) {
  if (!open) return null;
  const w =
    width === 'sm'
      ? 'max-w-sm'
      : width === '2xl'
      ? 'max-w-[80rem]'
      : width === 'xl'
      ? 'max-w-[64rem]'
      : width === 'lg'
      ? 'max-w-3xl'
      : 'max-w-md';
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className={`flex max-h-[88vh] w-full ${w} flex-col rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded bg-zinc-800 text-zinc-400 transition hover:bg-zinc-700 hover:text-white"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="mt-5 flex shrink-0 justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
