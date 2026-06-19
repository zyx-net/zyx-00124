import { Router, type Request, type Response } from 'express';
import { getDB, saveDB } from '../data/store.js';
import { createSession, destroySession, authMiddleware, logAudit } from '../middleware/auth.js';
import type { User } from '../../shared/types.js';

const router = Router();

function omitPassword(user: User): Omit<User, 'password'> {
  const { password, ...rest } = user;
  return rest;
}

router.post('/login', (req: Request, res: Response): void => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: '请输入用户名和密码' });
    return;
  }

  const db = getDB();
  const user = db.users.find((u) => u.username === username && u.password === password);

  if (!user) {
    logAudit('unknown', undefined, '登录失败', undefined, false, `用户名或密码错误: ${username}`);
    res.status(401).json({ error: '用户名或密码错误' });
    return;
  }

  const token = createSession(user);
  logAudit(user.id, user.name, '登录成功', undefined, true);
  res.json({ token, user: omitPassword(user) });
});

router.post('/logout', authMiddleware, (req: Request, res: Response): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    destroySession(token);
  }
  if (req.currentUser) {
    logAudit(req.currentUser.id, req.currentUser.name, '退出登录', undefined, true);
  }
  res.json({ message: '已退出登录' });
});

router.get('/me', authMiddleware, (req: Request, res: Response): void => {
  if (!req.currentUser) {
    res.status(401).json({ error: '未登录' });
    return;
  }
  res.json({ user: omitPassword(req.currentUser), config: getDB().config });
});

export default router;
