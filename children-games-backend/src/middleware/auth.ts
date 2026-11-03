import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { isTokenBlacklisted } from '../services/tokenService';

export interface AuthRequest extends Request {
  userId?: number;
  openid?: string;
  /** Access Token 的 jti，用于登出时黑名单追踪 */
  tokenJti?: string;
  /** Token 过期时间戳（毫秒），用于黑名单 TTL */
  tokenExp?: number;
}

/**
 * 从 JWT payload 中提取信息到 request
 * 支持新版 access token（带 jti/type）和旧版 token（兼容）
 */
function extractPayload(decoded: Record<string, unknown>): {
  userId: number | null;
  openid: string | null;
  jti: string | null;
  exp: number | null;
  isAdmin: boolean;
} {
  const isAdmin = decoded.role === 'admin';
  return {
    userId: typeof decoded.userId === 'number' ? decoded.userId : null,
    openid: typeof decoded.openid === 'string' ? decoded.openid : null,
    jti: typeof decoded.jti === 'string' ? decoded.jti : null,
    exp: typeof decoded.exp === 'number' ? decoded.exp : null,
    isAdmin,
  };
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ code: 401, message: '未提供认证令牌' });
      return;
    }

    const decoded = jwt.verify(token, config.jwt.secret) as Record<string, unknown>;
    // 新版 token 必须为 access 类型：refresh token 不得作为访问凭证（SP-05 类型混淆）
    // 旧版长期令牌无 type 字段，走兼容路径
    if (decoded.type !== undefined && decoded.type !== 'access') {
      res.status(401).json({ code: 401, message: '认证令牌无效或已过期' });
      return;
    }
    const payload = extractPayload(decoded);

    // 检查 access token 是否在黑名单中
    if (payload.jti && decoded.type === 'access') {
      const blacklisted = await isTokenBlacklisted(payload.jti);
      if (blacklisted) {
        res.status(401).json({ code: 401, message: '认证令牌已被撤销' });
        return;
      }
      // 附加 jti 和 exp 到 request，供登出时使用
      req.tokenJti = payload.jti;
      if (payload.exp) {
        req.tokenExp = payload.exp * 1000; // 秒转毫秒
      }
    }

    if (payload.userId) {
      req.userId = payload.userId;
      req.openid = payload.openid ?? undefined;
      next();
      return;
    }

    res.status(401).json({ code: 401, message: '认证令牌无效或已过期' });
  } catch (error) {
    res.status(401).json({ code: 401, message: '认证令牌无效或已过期' });
  }
};

/** 用户或管理员任一凭证通过：角色 JWT → req.userId；管理员 JWT → req.admin */
export const userOrAdminAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ code: 401, message: '未提供认证令牌' });
    return;
  }
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as Record<string, unknown>;
    // 新版 token 必须为 access 类型（refresh token 不得作为访问凭证）；旧版无 type 兼容
    if (decoded.type !== undefined && decoded.type !== 'access') {
      res.status(401).json({ code: 401, message: '认证令牌无效或已过期' });
      return;
    }
    const payload = extractPayload(decoded);

    // 检查 access token 是否在黑名单中
    if (payload.jti && decoded.type === 'access') {
      const blacklisted = await isTokenBlacklisted(payload.jti);
      if (blacklisted) {
        res.status(401).json({ code: 401, message: '认证令牌已被撤销' });
        return;
      }
      req.tokenJti = payload.jti;
      if (payload.exp) {
        req.tokenExp = payload.exp * 1000;
      }
    }

    if (payload.userId) {
      req.userId = payload.userId;
      req.openid = payload.openid ?? undefined;
      next();
      return;
    }
    if (payload.isAdmin) {
      (req as AuthRequest & { admin?: boolean }).admin = true;
      next();
      return;
    }
    res.status(403).json({ code: 403, message: '凭证无效' });
  } catch {
    res.status(401).json({ code: 401, message: '认证令牌无效或已过期' });
  }
};
