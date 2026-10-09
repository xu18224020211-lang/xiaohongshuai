import { useState } from 'react';
import { api } from '../lib/api';
import { reloadUiTexts, UI_TEXT_DEFAULTS, uiText, useUiTexts } from '../lib/uiTexts';
import { useAuth } from '../store/auth';

/**
 * 可直接就地修改的提示语：
 * - 只有超管能看到「修改」
 * - 鼠标悬停在文案上时出现「修改」，点开后变输入框，右侧小「✓」保存
 * - 保存后前后端所有用到这句提示语的地方立即同步（ui_texts）
 */
export default function EditableHint({
  k, className = '', inputClassName = 'input !py-0.5 !px-2 text-xs !w-64', fallback,
}: {
  k: string;
  className?: string;
  inputClassName?: string;
  /** key 未登记时的兜底文案（避免显示成 key） */
  fallback?: string;
}) {
  const T = useUiTexts();
  const user = useAuth((s) => s.user);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState('');

  const registered = Object.prototype.hasOwnProperty.call(UI_TEXT_DEFAULTS, k);
  const text = registered || T(k) !== k ? T(k) : (fallback ?? k);
  const canEdit = user?.role === 'super_admin';

  async function save() {
    try {
      await api.saveUiTexts({ [k]: draft.trim() });
      await reloadUiTexts();
      setEditing(false);
      setMsg('已保存');
      window.setTimeout(() => setMsg(''), 1600);
    } catch {
      setMsg('保存失败');
    }
  }

  if (!canEdit) return <span className={className}>{text}</span>;

  if (editing) {
    return (
      <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
        <input
          autoFocus
          className={inputClassName}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
            if (e.key === 'Escape') setEditing(false);
          }}
          placeholder={uiText(k)}
        />
        <button type="button" title="保存" className="grid h-5 w-5 place-items-center rounded bg-emerald-600 text-[11px] font-bold text-white transition hover:bg-emerald-500" onClick={() => void save()}>✓</button>
        <button type="button" title="取消" className="text-[11px] text-zinc-500 transition hover:text-zinc-300" onClick={() => setEditing(false)}>×</button>
        {msg && <span className="text-[10px] text-emerald-300">{msg}</span>}
      </span>
    );
  }

  return (
    <span className={`group inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <span>{text}</span>
      <button
        type="button"
        title="修改这句提示语（前后端同步）"
        className="hidden text-[10px] text-indigo-300 transition hover:text-indigo-200 group-hover:inline"
        onClick={() => { setDraft(text); setEditing(true); }}
      >修改</button>
      {msg && <span className="text-[10px] text-emerald-300">{msg}</span>}
    </span>
  );
}
