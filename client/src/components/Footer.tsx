import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function Footer() {
  const [title, setTitle] = useState('小红书素材设计');
  const [extra, setExtra] = useState('');
  useEffect(() => {
    api.getSettings().then((r) => {
      setTitle(r.settings.site_title || '小红书素材设计');
      setExtra(r.settings.footer_text || '');
    }).catch(() => {});
  }, []);
  const year = new Date().getFullYear();
  return (
    <footer className="shrink-0 border-t border-zinc-800 bg-zinc-900 px-4 py-3 text-center text-xs text-zinc-500">
      <div>© {year} {title} · 三层无损叠加 AI 封面设计工具</div>
      {extra && <div className="mt-1">{extra}</div>}
    </footer>
  );
}
