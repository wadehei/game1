import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AdminRequest extends Request {
  admin?: boolean;
}

/** 管理员鉴权：校验带 role=admin 的 JWT */
export const adminMiddleware = (req: AdminRequest, res: Response, next: NextFunction): void => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ code: 401, message: '未提供管理员凭证' });
      return;
    }
    const decoded = jwt.verify(token, config.jwt.secret) as { role?: string };
    if (decoded.role !== 'admin') {
      res.status(403).json({ code: 403, message: '无管理员权限' });
      return;
    }
    req.admin = true;
    next();
  } catch {
    res.status(401).json({ code: 401, message: '管理员凭证无效或已过期' });
  }
};
