import { Router } from 'express';
import { db } from '../db';
import { requireAuth, requireRole } from '../middleware';

export const settingsRouter = Router();

/** 网页名称（浏览器标签）默认值 */
const DEFAULT_PAGE_TITLE = '封面三层设计工具';

function getSettings() {
  const row = db.prepare('SELECT site_title, page_title, logo_url, footer_text FROM settings WHERE id = 1').get() as
    | { site_title: string; page_title: string | null; logo_url: string | null; footer_text: string | null }
    | undefined;
  if (row) return { ...row, page_title: row.page_title || DEFAULT_PAGE_TITLE };
  return { site_title: '小红书素材设计', page_title: DEFAULT_PAGE_TITLE, logo_url: null, footer_text: null };
}

// 公开读取（网页名称 / 首页标题 / logo / 备案）
settingsRouter.get('/', (_req, res) => {
  res.json({ settings: getSettings() });
});

// 超管更新
settingsRouter.put('/', requireAuth, requireRole('super_admin'), (req, res) => {
  const { site_title, page_title, logo_url, footer_text } = (req.body || {}) as {
    site_title?: string;
    page_title?: string;
    logo_url?: string;
    footer_text?: string;
  };
  db.prepare(
    `INSERT INTO settings (id, site_title, page_title, logo_url, footer_text, updated_at)
     VALUES (1, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       site_title = excluded.site_title,
       page_title = excluded.page_title,
       logo_url = excluded.logo_url,
       footer_text = excluded.footer_text,
       updated_at = datetime('now')`
  ).run(site_title || '小红书素材设计', page_title || DEFAULT_PAGE_TITLE, logo_url || null, footer_text || null);
  res.json({ ok: true });
});
