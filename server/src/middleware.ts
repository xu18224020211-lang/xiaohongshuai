import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';
import type { AuthUser, Role } from './types';

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ ...user }, config.jwtSecret, { expiresIn: '7d' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthUser;
    (req as AuthedRequest).user = {
      id: payload.id,
      username: payload.username,
      role: payload.role,
      brand_id: payload.brand_id,
    };
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const u = (req as AuthedRequest).user!;
    if (!roles.includes(u.role)) return res.status(403).json({ error: '无权限执行此操作' });
    next();
  };
}

/** 异步路由包装：把 Promise reject 交给全局错误处理器 */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);
