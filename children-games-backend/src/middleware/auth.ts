import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthRequest extends Request {
  userId?: number;
  openid?: string;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ code: 401, message: '未提供认证令牌' });
      return;
    }

    const decoded = jwt.verify(token, config.jwt.secret) as { userId: number; openid: string };
    req.userId = decoded.userId;
    req.openid = decoded.openid;
    next();
  } catch (error) {
    res.status(401).json({ code: 401, message: '认证令牌无效或已过期' });
  }
};

/** 用户或管理员任一凭证通过：角色 JWT → req.userId；管理员 JWT → req.admin */
export const userOrAdminAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ code: 401, message: '未提供认证令牌' });
    return;
  }
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as { userId?: number; openid?: string; role?: string };
    if (typeof decoded.userId === 'number') {
      req.userId = decoded.userId;
      req.openid = decoded.openid;
      next();
      return;
    }
    if (decoded.role === 'admin') {
      (req as AuthRequest & { admin?: boolean }).admin = true;
      next();
      return;
    }
    res.status(403).json({ code: 403, message: '凭证无效' });
  } catch {
    res.status(401).json({ code: 401, message: '认证令牌无效或已过期' });
  }
};
