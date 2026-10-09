import { useEffect, type ReactNode } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './store/auth';
import { api } from './lib/api';
import TopNav from './components/TopNav';
import Footer from './components/Footer';
import Login from './pages/Login';
import Home from './pages/Home';
import Designer from './pages/Designer';
import Admin from './pages/Admin';
import Designs from './pages/Designs';

function Protected() {
  const { user, ready } = useAuth();
  if (!ready) {
    return <div className="flex h-full items-center justify-center text-zinc-500">加载中…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="flex h-full flex-col">
      <TopNav />
      <div className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}

function RoleGate({ children }: { children: ReactNode }) {
  const user = useAuth((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const init = useAuth((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);

  // 网页名称（浏览器标签）：取「后台 → 站点设置 → 网页名称」，默认「封面三层设计工具」
  useEffect(() => {
    api.getSettings()
      .then((r) => {
        const name = r.settings.page_title || r.settings.site_title;
        if (name) document.title = name;
      })
      .catch(() => {});
  }, []);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route index element={<Home />} />
        <Route path="designer" element={<Designer />} />
        <Route path="designs" element={<Designs />} />
        <Route
          path="admin"
          element={
            <RoleGate>
              <Admin />
            </RoleGate>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
