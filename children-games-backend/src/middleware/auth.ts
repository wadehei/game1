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
