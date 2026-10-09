import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';

export default function Login() {
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await login(username.trim(), password);
      navigate('/');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '登录失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center">
      <form onSubmit={submit} className="w-80 space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <div>
          <h1 className="text-xl font-bold text-white">登录</h1>
          <p className="mt-1 text-xs text-zinc-500">三层无损叠加 · AI 封面设计</p>
        </div>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="用户名"
          autoComplete="username"
          className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码"
          autoComplete="current-password"
          className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
        {err && <div className="text-sm text-red-400">{err}</div>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? '登录中…' : '登录'}
        </button>
        <p className="text-center text-xs text-zinc-600">
          默认：admin/admin123 · pm/pm123 · user/user123
        </p>
      </form>
    </div>
  );
}
