import type { Request, Response, NextFunction } from 'express';
import { getDB, saveDB, generateId } from '../data/store.js';
import type { User, UserRole } from '../../shared/types.js';

declare module 'express-serve-static-core' {
  interface Request {
    currentUser?: User;
  }
}

const SESSIONS = new Map<string, User>();

export function createSession(user: User): string {
  const token = generateId();
  SESSIONS.set(token, user);
  return token;
}

export function destroySession(token: string): void {
  SESSIONS.delete(token);
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: '未登录' });
    return;
  }

  const user = SESSIONS.get(token);
  if (!user) {
    res.status(401).json({ error: '登录已过期' });
    return;
  }

  req.currentUser = user;
  next();
}

export function roleMiddleware(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.currentUser;
    if (!user) {
      res.status(401).json({ error: '未登录' });
      return;
    }
    if (!roles.includes(user.role)) {
      logAudit(user.id, user.name, `尝试执行权限不足的操作: ${req.method} ${req.path}`, undefined, false, '权限不足');
      res.status(403).json({ error: '权限不足' });
      return;
    }
    next();
  };
}

export function logAudit(
  userId: string,
  userName: string | undefined,
  action: string,
  targetId: string | undefined,
  success: boolean,
  reason?: string,
): void {
  const db = getDB();
  db.auditLogs.unshift({
    id: generateId(),
    userId,
    userName,
    action,
    targetId,
    success,
    reason,
    createdAt: new Date().toISOString(),
  });
  saveDB(db);
}
