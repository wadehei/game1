import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AdminRequest extends Request {
  admin?: boolean;
  adminId?: number;
  adminUsername?: string;
}

/** 管理员鉴权：校验带 role=admin 的 JWT */
export const adminMiddleware = (req: AdminRequest, res: Response, next: NextFunction): void => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ code: 401, message: '未提供管理员凭证' });
      return;
    }
    const decoded = jwt.verify(token, config.jwt.secret) as {
      role?: string;
      adminId?: number;
      username?: string;
      purpose?: string;
    };

    // 拒绝临时令牌（purpose === '2fa_pending'）访问管理接口
    if (decoded.purpose === '2fa_pending') {
      res.status(401).json({ code: 401, message: '请先完成 2FA 验证' });
      return;
    }

    if (decoded.role !== 'admin') {
      res.status(403).json({ code: 403, message: '无管理员权限' });
      return;
    }

    req.admin = true;
    req.adminId = decoded.adminId;
    req.adminUsername = decoded.username;
    next();
  } catch {
    res.status(401).json({ code: 401, message: '管理员凭证无效或已过期' });
  }
};
