import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { requireAuth, signToken, type AuthedRequest } from '../middleware';
import type { AuthUser } from '../types';

export const authRouter = Router();

interface UserRow {
  id: number;
  username: string;
  display_name: string | null;
  email: string | null;
  role: AuthUser['role'];
  brand_id: number | null;
}

function publicUser(u: UserRow) {
  return { id: u.id, username: u.username, display_name: u.display_name, email: u.email, role: u.role, brand_id: u.brand_id };
}

authRouter.post('/login', (req, res) => {
  const { username, password } = (req.body || {}) as { username?: string; password?: string };
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username || '') as
    | (UserRow & { password_hash: string })
    | undefined;
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const auth: AuthUser = { id: user.id, username: user.username, role: user.role, brand_id: user.brand_id };
  res.json({ token: signToken(auth), user: publicUser(user) });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const uid = (req as AuthedRequest).user!.id;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid) as UserRow | undefined;
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ user: publicUser(user) });
});

// 个人资料修改（任何角色都能改自己的昵称 / 用户名 / 密码）
authRouter.patch('/profile', requireAuth, (req, res) => {
  const uid = (req as AuthedRequest).user!.id;
  const { username, password, display_name } = (req.body || {}) as {
    username?: string;
    password?: string;
    display_name?: string;
  };
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (username !== undefined && username.trim()) {
    const dup = db.prepare('SELECT id FROM users WHERE username = ? AND id <> ?').get(username.trim(), uid);
    if (dup) return res.status(409).json({ error: '该用户名已被占用' });
    sets.push('username = ?');
    vals.push(username.trim());
  }
  if (display_name !== undefined && display_name) { sets.push('display_name = ?'); vals.push(display_name); }
  if (password) {
    if (String(password).length < 6) return res.status(400).json({ error: '密码至少 6 位' });
    sets.push('password_hash = ?');
    vals.push(bcrypt.hashSync(String(password), 10));
  }
  if (!sets.length) return res.json({ ok: true });
  vals.push(uid);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid) as unknown as UserRow;
  res.json({ ok: true, user: publicUser(user) });
});
