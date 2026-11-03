// 用户认证工具函数：JWT 签发 + 用户信息序列化

import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { User } from '../models';

/** 签发用户 JWT（默认 7 天，家庭登录可传 '365d'） */
export function generateUserToken(
  user: User,
  expiresIn: jwt.SignOptions['expiresIn'] = '7d'
): string {
  return jwt.sign({ userId: user.id, openid: user.openid }, config.jwt.secret, { expiresIn });
}

/** 序列化用户基本信息（供登录/注册接口返回） */
export function toUserInfo(user: User) {
  return {
    id: user.id,
    nickname: user.nickname,
    avatar: user.avatar,
    level: user.level,
    totalStars: user.totalStars,
  };
}

/** 签发 2FA 临时令牌（5 分钟有效，仅用于 2FA 验证步骤） */
export function generate2faTempToken(adminId: number): string {
  return jwt.sign({ adminId, purpose: '2fa_pending' }, config.jwt.secret, { expiresIn: '5m' });
}

/** 签发管理员完整 JWT（12 小时） */
export function generateAdminToken(adminId: number, username: string): string {
  return jwt.sign({ role: 'admin', adminId, username }, config.jwt.secret, { expiresIn: '12h' });
}

/** 验证 2FA 临时令牌，返回 adminId（失败返回 null） */
export function verify2faTempToken(token: string): number | null {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as {
      adminId?: number;
      purpose?: string;
    };
    if (decoded.purpose !== '2fa_pending' || typeof decoded.adminId !== 'number') {
      return null;
    }
    return decoded.adminId;
  } catch {
    return null;
  }
}
