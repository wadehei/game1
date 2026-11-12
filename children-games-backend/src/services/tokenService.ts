// Token Service：JWT 黑名单 + Refresh Token 管理
// 解决 STRIDE SP-05：JWT 长期令牌无撤销问题

import { getRedis, isRedisAvailable } from '../utils/redis';
import { logError } from '../utils/logger';
import {
  ACCESS_TOKEN_EXPIRES_SECONDS,
  REFRESH_TOKEN_EXPIRES_SECONDS,
  generateAccessToken,
  generateRefreshToken,
} from '../utils/auth';
import type { User } from '../models';

/** Redis key 前缀 */
const BLACKLIST_PREFIX = 'token:blacklist:';
const REFRESH_PREFIX = 'token:refresh:';
/** 按用户聚合的 refresh token jti 集合，用于"登出所有设备" */
const REFRESH_USER_PREFIX = 'token:refresh-user:';

/**
 * 内存 Fallback 存储
 * 当 Redis 不可用时使用（开发环境/Redis 宕机）
 * 注意：进程重启后会丢失，仅作为降级方案
 */
const memoryBlacklist = new Map<string, number>(); // jti -> expiresAt
const memoryRefreshTokens = new Map<string, { userId: number; expiresAt: number }>(); // jti -> data

// 定期清理过期的内存数据（每 10 分钟）
const cleanupInterval = setInterval(
  () => {
    const now = Date.now();
    for (const [jti, expiresAt] of memoryBlacklist) {
      if (expiresAt < now) memoryBlacklist.delete(jti);
    }
    for (const [jti, data] of memoryRefreshTokens) {
      if (data.expiresAt < now) memoryRefreshTokens.delete(jti);
    }
  },
  10 * 60 * 1000
);
cleanupInterval.unref();

// ─── Access Token 黑名单 ───────────────────────────────────

/**
 * 将 Access Token 加入黑名单
 * @param jti Token 唯一标识
 * @param expiresAt Token 过期时间戳（毫秒），黑名单 TTL 与 Token 有效期一致
 */
export async function blacklistToken(jti: string, expiresAt: number): Promise<boolean> {
  const ttlSeconds = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));

  // 优先使用 Redis
  if (isRedisAvailable()) {
    try {
      const redis = getRedis();
      if (redis) {
        await redis.set(`${BLACKLIST_PREFIX}${jti}`, '1', { EX: ttlSeconds });
        return true;
      }
    } catch (error) {
      logError(
        'tokenService',
        'Redis 黑名单失败，降级到内存',
        error instanceof Error ? error.stack : String(error)
      );
    }
  }

  // Fallback: 内存存储
  memoryBlacklist.set(jti, expiresAt);
  return true;
}

/**
 * 检查 Access Token 是否已被加入黑名单
 * @param jti Token 唯一标识
 */
export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  // 优先使用 Redis
  if (isRedisAvailable()) {
    try {
      const redis = getRedis();
      if (redis) {
        const exists = await redis.exists(`${BLACKLIST_PREFIX}${jti}`);
        return exists === 1;
      }
    } catch (error) {
      logError(
        'tokenService',
        'Redis 黑名单检查失败，降级到内存',
        error instanceof Error ? error.stack : String(error)
      );
    }
  }

  // Fallback: 内存检查
  const expiresAt = memoryBlacklist.get(jti);
  if (!expiresAt) return false;

  // 检查是否已过期
  if (expiresAt < Date.now()) {
    memoryBlacklist.delete(jti);
    return false;
  }
  return true;
}

// ─── Refresh Token 管理 ───────────────────────────────────

/** Refresh Token 存储结构 */
export interface StoredRefreshToken {
  userId: number;
  jti: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * 存储 Refresh Token
 * @param jti Token 唯一标识
 * @param userId 用户 ID
 */
export async function storeRefreshToken(jti: string, userId: number): Promise<boolean> {
  const expiresAt = Date.now() + REFRESH_TOKEN_EXPIRES_SECONDS * 1000;
  const data = { userId, expiresAt };

  // 优先使用 Redis
  if (isRedisAvailable()) {
    try {
      const redis = getRedis();
      if (redis) {
        await redis.set(`${REFRESH_PREFIX}${jti}`, JSON.stringify(data), {
          EX: REFRESH_TOKEN_EXPIRES_SECONDS,
        });
        // 维护按用户聚合的 jti 集合，供 logout-all 使用（SADD 无 TTL，用 EXPIRE 兜底防集合无限增长）
        await redis.sAdd(`${REFRESH_USER_PREFIX}${userId}`, jti);
        await redis.expire(`${REFRESH_USER_PREFIX}${userId}`, REFRESH_TOKEN_EXPIRES_SECONDS);
        return true;
      }
    } catch (error) {
      logError(
        'tokenService',
        'Redis 存储 refresh token 失败，降级到内存',
        error instanceof Error ? error.stack : String(error)
      );
    }
  }

  // Fallback: 内存存储
  memoryRefreshTokens.set(jti, data);
  return true;
}

/**
 * 验证 Refresh Token 是否有效
 * @returns userId 或 null（无效/已撤销/已过期）
 */
export async function validateRefreshToken(jti: string): Promise<number | null> {
  // 优先使用 Redis
  if (isRedisAvailable()) {
    try {
      const redis = getRedis();
      if (redis) {
        const raw = await redis.get(`${REFRESH_PREFIX}${jti}`);
        if (!raw || typeof raw !== 'string') return null;
        const data = JSON.parse(raw) as StoredRefreshToken;
        return data.userId;
      }
    } catch (error) {
      logError(
        'tokenService',
        'Redis 验证 refresh token 失败，降级到内存',
        error instanceof Error ? error.stack : String(error)
      );
    }
  }

  // Fallback: 内存检查
  const data = memoryRefreshTokens.get(jti);
  if (!data) return null;

  // 检查是否已过期
  if (data.expiresAt < Date.now()) {
    memoryRefreshTokens.delete(jti);
    return null;
  }
  return data.userId;
}

/**
 * 撤销 Refresh Token（登出时调用）
 * @param jti Token 唯一标识
 */
export async function revokeRefreshToken(jti: string): Promise<boolean> {
  // 优先使用 Redis
  if (isRedisAvailable()) {
    try {
      const redis = getRedis();
      if (redis) {
        const raw = await redis.get(`${REFRESH_PREFIX}${jti}`);
        await redis.del(`${REFRESH_PREFIX}${jti}`);
        // 同步从用户集合中移除，避免 logout-all 误计数
        if (raw) {
          try {
            const data = JSON.parse(raw) as StoredRefreshToken;
            if (typeof data?.userId === 'number') {
              await redis.sRem(`${REFRESH_USER_PREFIX}${data.userId}`, jti);
            }
          } catch {
            /* JSON 损坏不影响登出主流程 */
          }
        }
        return true;
      }
    } catch (error) {
      logError(
        'tokenService',
        'Redis 撤销 refresh token 失败，降级到内存',
        error instanceof Error ? error.stack : String(error)
      );
    }
  }

  // Fallback: 内存删除
  return memoryRefreshTokens.delete(jti);
}

/**
 * 撤销用户的所有 Refresh Token
 * 用于"退出所有设备"或安全事件响应
 *
 * Redis 模式：通过按用户聚合的 jti 集合（REFRESH_USER_PREFIX）定位并逐个删除
 * 内存 Fallback：遍历内存 Map
 * 两个存储都清理（登录时 Redis 宕机会产生内存降级数据）
 */
export async function revokeAllRefreshTokens(userId: number): Promise<number> {
  let revoked = 0;

  // 内存中遍历撤销（含 Redis 宕机期间的降级数据）
  for (const [jti, data] of memoryRefreshTokens) {
    if (data.userId === userId) {
      memoryRefreshTokens.delete(jti);
      revoked++;
    }
  }

  // Redis：按用户集合批量撤销
  if (isRedisAvailable()) {
    try {
      const redis = getRedis();
      if (redis) {
        const userSetKey = `${REFRESH_USER_PREFIX}${userId}`;
        const jties = await redis.sMembers(userSetKey);
        if (jties.length > 0) {
          await redis.del(jties.map((jti) => `${REFRESH_PREFIX}${jti}`));
          revoked = Math.max(revoked, jties.length);
        }
        await redis.del(userSetKey);
      }
    } catch (error) {
      logError(
        'tokenService',
        `用户 ${userId} Redis 全量撤销 refresh token 失败`,
        error instanceof Error ? error.stack : String(error)
      );
    }
  }

  return revoked;
}

// ─── 完整登出流程 ───────────────────────────────────

/**
 * 完整登出：撤销 Refresh Token + 黑名单 Access Token
 * @param accessJti Access Token 的 jti
 * @param accessExpiresAt Access Token 的过期时间戳
 * @param refreshJti Refresh Token 的 jti
 */
export async function logout(
  accessJti: string | undefined,
  accessExpiresAt: number,
  refreshJti: string
): Promise<void> {
  const promises: Promise<boolean>[] = [];

  // 黑名单 Access Token
  if (accessJti) {
    promises.push(blacklistToken(accessJti, accessExpiresAt));
  }

  // 撤销 Refresh Token
  promises.push(revokeRefreshToken(refreshJti));

  await Promise.all(promises);
}

// ─── Token 签发（服务层职责，供登录/刷新复用） ───────────────────────────────────

/**
 * 为用户签发 access + refresh token 对
 * refresh token 同步存储到服务端以支持撤销
 */
export async function generateTokenPair(user: User): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const { token: accessToken } = generateAccessToken(user);
  const { token: refreshToken, jti: refreshJti } = generateRefreshToken(user);
  await storeRefreshToken(refreshJti, user.id);
  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_EXPIRES_SECONDS };
}

/**
 * 获取内存存储统计（用于监控/测试）
 */
export function getMemoryStats(): { blacklist: number; refreshTokens: number } {
  return {
    blacklist: memoryBlacklist.size,
    refreshTokens: memoryRefreshTokens.size,
  };
}
