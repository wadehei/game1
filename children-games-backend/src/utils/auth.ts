// 用户认证工具函数：JWT 签发 + 用户信息序列化

import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { User } from '../models';

/** Access Token 有效期（15 分钟） */
export const ACCESS_TOKEN_EXPIRES_IN = '15m';
/** Access Token 有效期（秒），用于 Redis 黑名单 TTL */
export const ACCESS_TOKEN_EXPIRES_SECONDS = 15 * 60;
/** Refresh Token 有效期（30 天） */
export const REFRESH_TOKEN_EXPIRES_IN = '30d';
/** Refresh Token 有效期（秒） */
export const REFRESH_TOKEN_EXPIRES_SECONDS = 30 * 24 * 60 * 60;

/** Token payload 接口 */
export interface AccessTokenPayload {
  jti: string;
  userId: number;
  openid: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  jti: string;
  userId: number;
  type: 'refresh';
}

/**
 * 签发短期 Access Token（带 jti 唯一标识，支持黑名单撤销）
 * @returns { token, jti } - jti 用于黑名单追踪
 */
export function generateAccessToken(user: User): { token: string; jti: string } {
  const jti = randomUUID();
  const token = jwt.sign(
    { jti, userId: user.id, openid: user.openid, type: 'access' },
    config.jwt.secret,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
  return { token, jti };
}

/**
 * 签发 Refresh Token（长期有效，用于静默刷新）
 * @returns { token, jti } - jti 用于服务端追踪和撤销
 */
export function generateRefreshToken(user: User): { token: string; jti: string } {
  const jti = randomUUID();
  const token = jwt.sign({ jti, userId: user.id, type: 'refresh' }, config.jwt.secret, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });
  return { token, jti };
}

/**
 * 验证并解析 Refresh Token
 * @returns payload 或 null（无效/过期）
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as RefreshTokenPayload;
    if (decoded.type !== 'refresh' || !decoded.jti || !decoded.userId) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
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
