import { Router } from 'express';
import { db } from '../db';
import { requireAuth, type AuthedRequest } from '../middleware';
import { isSuper } from '../scope';

export const uiTextsRouter = Router();
uiTextsRouter.use(requireAuth);

// 所有键 → 覆盖值（未覆盖的不返回，前端用默认文案兜底）
uiTextsRouter.get('/', (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM ui_texts').all() as { key: string; value: string }[];
  res.json({ texts: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
});

// 仅超管可修改：空字符串 = 恢复默认（删除覆盖）
uiTextsRouter.put('/', (req, res) => {
  const u = (req as AuthedRequest).user!;
  if (!isSuper(u)) return res.status(403).json({ error: '仅超管可修改提示语' });
  const { texts } = (req.body || {}) as { texts?: Record<string, string> };
  if (!texts || typeof texts !== 'object') return res.status(400).json({ error: '参数不正确' });
  for (const [key, value] of Object.entries(texts)) {
    const v = String(value ?? '');
    if (!v.trim()) db.prepare('DELETE FROM ui_texts WHERE key = ?').run(key);
    else db.prepare("INSERT INTO ui_texts (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')").run(key, v);
  }
  const rows = db.prepare('SELECT key, value FROM ui_texts').all() as { key: string; value: string }[];
  res.json({ ok: true, texts: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
});
