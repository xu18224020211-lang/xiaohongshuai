import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Modal from './Modal';
import { useAuth } from '../store/auth';
import { api } from '../lib/api';
import { isDesignDirty, saveDesignNow } from '../lib/autosave';
import { ROLE_LABEL, isGlobalRole } from '../lib/types';
import type { DesignMeta, SiteSettings } from '../lib/types';

export default function TopNav() {
  const user = useAuth((s) => s.user)!;
  const logout = useAuth((s) => s.logout);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pf, setPf] = useState({ password: '', display_name: '', username: '' });
  const [pfMsg, setPfMsg] = useState('');
  const [brandName, setBrandName] = useState('');
  const [myProjects, setMyProjects] = useState<string[]>([]);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const [leaveMsg, setLeaveMsg] = useState('');
  // 历史记录：自己权限内的设计稿
  const [historyOpen, setHistoryOpen] = useState(false);
  const [designs, setDesigns] = useState<DesignMeta[]>([]);
  const [historyMsg, setHistoryMsg] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    api.getSettings().then((r) => setSettings(r.settings)).catch(() => {});
  }, []);

  // 个人资料里展示的只读信息：所属品牌 / 所属项目
  useEffect(() => {
    if (user.brand_id) {
      api.listBrands().then((r) => setBrandName(r.brands.find((b) => b.id === user.brand_id)?.name || '')).catch(() => {});
    } else {
      setBrandName('');
    }
    if (isGlobalRole(user.role)) {
      setMyProjects(['全部项目']);
    } else {
      api.listProjects().then((r) => setMyProjects(r.projects.map((p) => p.name))).catch(() => setMyProjects([]));
    }
  }, [user.id, user.role, user.brand_id]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // 离开画布前若画布上有未保存内容 → 弹出保存提示（与画布内返回一致）
  function guardLeave(go: () => void) {
    if (location.pathname === '/designer' && isDesignDirty()) {
      setLeaveMsg('');
      setPendingLeave(() => go); // 用 updater 包裹，避免 React 把函数当作 setState 回调执行
      return;
    }
    go();
  }

  async function saveThenLeave() {
    const go = pendingLeave;
    setLeaveMsg('');
    const r = await saveDesignNow();
    if (!r.ok) {
      setLeaveMsg(r.msg || '保存失败');
      return;
    }
    setPendingLeave(null);
    go?.();
  }

  function leaveWithoutSaving() {
    const go = pendingLeave;
    setPendingLeave(null);
    go?.();
  }

  async function loadDesigns() {
    setHistoryMsg('');
    try {
      const r = await api.listDesigns();
      setDesigns(r.designs);
    } catch {
      setDesigns([]);
    }
  }

  const items = [
    // 所有角色都可进入后台：普通用户仅「个人信息 + 权限内素材/模板（只读）」
    { label: '管理后台', onClick: () => guardLeave(() => navigate('/admin')) },
    { label: '历史记录', onClick: () => { setHistoryOpen(true); void loadDesigns(); } },
    { label: '个人资料', onClick: () => setProfileOpen(true) },
    { label: '退出登录', onClick: () => guardLeave(() => { logout(); navigate('/login'); }) },
  ];

  return (
    <>
    <header className="relative z-[70] flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-3 backdrop-blur md:px-5">
      <button onClick={() => guardLeave(() => navigate('/'))} className="flex min-w-0 items-center gap-2">
        {settings?.logo_url ? (
          <img src={settings.logo_url} alt="logo" className="h-8 max-w-[140px] object-contain" />
        ) : (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#ff2442] text-sm text-white">✦</span>
        )}
        <span className="truncate text-sm font-bold text-white">{settings?.site_title || '小红书素材设计'}</span>
      </button>

      <div className="flex shrink-0 items-center gap-2">
        <div className="relative" ref={menuRef}>
          <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-200 transition hover:bg-zinc-800">
            <span data-user-avatar className="grid h-6 w-6 place-items-center rounded-full bg-[#ff2442] text-xs font-semibold text-white">
              {(user.username[0] || 'U').toUpperCase()}
            </span>
            <span className="hidden md:inline">{user.display_name || user.username}</span>
            <svg viewBox="0 0 16 16" className="h-3 w-3 fill-current text-zinc-500"><path d="M4 6l4 4 4-4z" /></svg>
          </button>
          {open && (
            <div className="absolute right-0 top-full z-[90] mt-1.5 w-44 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 py-1 shadow-2xl shadow-black/80">
              {items.map((it) => (
                <button key={it.label} onClick={() => { setOpen(false); it.onClick(); }} className="block w-full px-4 py-2.5 text-left text-sm text-zinc-200 transition hover:bg-zinc-800 hover:text-white">
                  {it.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>

      {/* 个人资料（放在 header 外：header 的 backdrop-blur 会成为 fixed 定位的包含块，导致弹窗无法真正居中） */}
      {profileOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={() => setProfileOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-base font-semibold text-white">个人资料</h3>
            <p className="mb-4 text-xs text-zinc-500">可修改昵称、用户名（登录账号）与密码；角色与权限由上级管理员分配，不可自行修改。</p>
            <div className="grid gap-3">
              <label className="label">昵称<input className="input mt-1" value={pf.display_name} onChange={(e) => setPf({ ...pf, display_name: e.target.value })} placeholder={user.display_name || user.username} /></label>
              <label className="label">用户名（登录账号）<input className="input mt-1" value={pf.username} onChange={(e) => setPf({ ...pf, username: e.target.value })} placeholder={user.username} /></label>
              <label className="label">修改密码（留空不改）<input className="input mt-1" type="password" value={pf.password} onChange={(e) => setPf({ ...pf, password: e.target.value })} placeholder="至少 6 位" /></label>

              {/* 只读信息 */}
              <div className="mt-1 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <div className="mb-2 text-xs font-semibold text-zinc-400">以下信息不可自行修改</div>
                <div className="grid gap-1.5 text-xs">
                  <div className="flex justify-between gap-3"><span className="text-zinc-500">角色</span><span className="text-zinc-200">{ROLE_LABEL[user.role]}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-zinc-500">所属品牌</span><span className="truncate text-zinc-200">{user.brand_id ? (brandName || `品牌 ${user.brand_id}`) : '—'}</span></div>
                  <div className="flex justify-between gap-3">
                    <span className="shrink-0 text-zinc-500">所属项目</span>
                    <span className="truncate text-right text-zinc-200">{myProjects.length ? myProjects.join('、') : '—'}</span>
                  </div>
                </div>
              </div>

              {pfMsg && <div className="text-xs text-amber-400">{pfMsg}</div>}
              <div className="mt-1 flex justify-end gap-2">
                <button className="btn-soft" onClick={() => setProfileOpen(false)}>取消</button>
                <button className="btn-primary" onClick={async () => {
                  try {
                    await api.updateProfile({ display_name: pf.display_name, username: pf.username, password: pf.password || undefined });
                    setPfMsg('已保存 ✓');
                    await useAuth.getState().init();
                    setTimeout(() => { setProfileOpen(false); setPfMsg(''); setPf({ password: '', display_name: '', username: '' }); }, 800);
                  } catch (e) {
                    setPfMsg(e instanceof Error ? e.message : '保存失败');
                  }
                }}>保存</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 历史记录：自己权限内的设计稿（保存的设计稿在此查看） */}
      <Modal
        open={historyOpen}
        title="历史记录（我的设计稿）"
        width="xl"
        onClose={() => setHistoryOpen(false)}
        footer={<button className="btn-soft" onClick={() => setHistoryOpen(false)}>关闭</button>}
      >
        {designs.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">当前权限内还没有设计稿，在画布中点「保存」即可保存为设计稿</p>
        ) : (
          <div className="space-y-1.5">
            {designs.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-zinc-200">
                  <span className="truncate">{d.name}</span>
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">{d.project_name || '—'}</span>
                  <span className="text-[11px] text-zinc-500">{d.canvas_width}×{d.canvas_height}</span>
                  <span className="text-[11px] text-zinc-600">{d.updated_at || ''}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <button className="btn-soft !px-2.5 !py-1 text-[11px]" onClick={() => guardLeave(() => navigate(`/designer?design_id=${d.id}`))}>打开</button>
                  <button className="btn-danger !px-2.5 !py-1 text-[11px]" onClick={async () => {
                    try { await api.deleteDesign(d.id); await loadDesigns(); } catch (e) { setHistoryMsg(e instanceof Error ? e.message : '删除失败'); }
                  }}>删除</button>
                </span>
              </div>
            ))}
          </div>
        )}
        {historyMsg && <p className="mt-2 text-xs text-amber-400">{historyMsg}</p>}
      </Modal>

      <Modal
        open={pendingLeave !== null}
        title="离开画布？"
        onClose={() => setPendingLeave(null)}
        footer={
          <>
            <button className="btn-soft" onClick={() => setPendingLeave(null)}>取消</button>
            <button className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-500" onClick={leaveWithoutSaving}>不保存，直接离开</button>
            <button className="btn-primary" onClick={saveThenLeave}>保存并离开</button>
          </>
        }
      >
        <p className="text-sm text-zinc-400">当前画布有未保存的内容，是否在离开前保存？</p>
        {leaveMsg && <p className="mt-2 text-xs text-amber-500">{leaveMsg}</p>}
      </Modal>

          </>
  );
}
