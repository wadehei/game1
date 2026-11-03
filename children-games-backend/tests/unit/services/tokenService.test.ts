import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock redis
vi.mock('../../../src/utils/redis', () => ({
  getRedis: vi.fn(),
  isRedisAvailable: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../src/utils/logger', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

import {
  blacklistToken,
  isTokenBlacklisted,
  storeRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  logout,
  getMemoryStats,
} from '../../../src/services/tokenService';
import { isRedisAvailable, getRedis } from '../../../src/utils/redis';

describe('tokenService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认 Redis 不可用（使用内存 fallback）
    (isRedisAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  describe('Access Token 黑名单（内存模式）', () => {
    it('should blacklist a token and verify it is blacklisted', async () => {
      const jti = 'test-jti-123';
      const expiresAt = Date.now() + 15 * 60 * 1000; // 15 分钟后

      await blacklistToken(jti, expiresAt);
      const isBlacklisted = await isTokenBlacklisted(jti);

      expect(isBlacklisted).toBe(true);
    });

    it('should return false for non-blacklisted token', async () => {
      const isBlacklisted = await isTokenBlacklisted('unknown-jti');
      expect(isBlacklisted).toBe(false);
    });

    it('should clean up expired tokens from memory', async () => {
      const jti = 'expired-jti';
      const expiresAt = Date.now() - 1000; // 已过期

      await blacklistToken(jti, expiresAt);

      // 过期的 token 应该返回 false
      const isBlacklisted = await isTokenBlacklisted(jti);
      expect(isBlacklisted).toBe(false);
    });
  });

  describe('Refresh Token 存储（内存模式）', () => {
    it('should store and validate refresh token', async () => {
      const jti = 'refresh-jti-456';
      const userId = 42;

      await storeRefreshToken(jti, userId);
      const storedUserId = await validateRefreshToken(jti);

      expect(storedUserId).toBe(userId);
    });

    it('should return null for unknown refresh token', async () => {
      const storedUserId = await validateRefreshToken('unknown-jti');
      expect(storedUserId).toBeNull();
    });

    it('should revoke refresh token', async () => {
      const jti = 'refresh-jti-789';
      const userId = 100;

      await storeRefreshToken(jti, userId);
      expect(await validateRefreshToken(jti)).toBe(userId);

      await revokeRefreshToken(jti);
      expect(await validateRefreshToken(jti)).toBeNull();
    });

    it('should revoke all refresh tokens for a user', async () => {
      const userId = 55;
      const jti1 = 'jti-1';
      const jti2 = 'jti-2';

      await storeRefreshToken(jti1, userId);
      await storeRefreshToken(jti2, userId);
      await storeRefreshToken('other-jti', 99); // 其他用户的 token

      const revoked = await revokeAllRefreshTokens(userId);

      expect(revoked).toBe(2);
      expect(await validateRefreshToken(jti1)).toBeNull();
      expect(await validateRefreshToken(jti2)).toBeNull();
      expect(await validateRefreshToken('other-jti')).toBe(99); // 不受影响
    });
  });

  describe('logout 流程', () => {
    it('should blacklist access token and revoke refresh token', async () => {
      const accessJti = 'access-jti';
      const accessExpiresAt = Date.now() + 15 * 60 * 1000;
      const refreshJti = 'refresh-jti';
      const userId = 42;

      // 先存储 refresh token
      await storeRefreshToken(refreshJti, userId);

      // 执行登出
      await logout(accessJti, accessExpiresAt, refreshJti);

      // 验证 access token 被黑名单
      expect(await isTokenBlacklisted(accessJti)).toBe(true);

      // 验证 refresh token 被撤销
      expect(await validateRefreshToken(refreshJti)).toBeNull();
    });
  });

  describe('getMemoryStats', () => {
    it('should return memory storage stats', async () => {
      // 添加一些数据
      await blacklistToken('jti-1', Date.now() + 60000);
      await storeRefreshToken('jti-2', 1);

      const stats = getMemoryStats();

      expect(stats.blacklist).toBeGreaterThanOrEqual(1);
      expect(stats.refreshTokens).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Redis 模式', () => {
    const makeMockRedis = () => ({
      set: vi.fn().mockResolvedValue('OK'),
      get: vi.fn().mockResolvedValue(null),
      exists: vi.fn().mockResolvedValue(0),
      del: vi.fn().mockResolvedValue(1),
      sAdd: vi.fn().mockResolvedValue(1),
      sRem: vi.fn().mockResolvedValue(1),
      sMembers: vi.fn().mockResolvedValue([] as string[]),
      expire: vi.fn().mockResolvedValue(1),
    });

    it('should use Redis when available', async () => {
      const mockRedis = makeMockRedis();

      (isRedisAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(mockRedis);

      await blacklistToken('redis-jti', Date.now() + 60000);

      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should maintain per-user jti set when storing refresh tokens', async () => {
      const mockRedis = makeMockRedis();

      (isRedisAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(mockRedis);

      await storeRefreshToken('redis-refresh-jti', 7);

      expect(mockRedis.sAdd).toHaveBeenCalledWith('token:refresh-user:7', 'redis-refresh-jti');
      expect(mockRedis.expire).toHaveBeenCalledWith('token:refresh-user:7', expect.any(Number));
    });

    it('should revoke all refresh tokens via the per-user set in Redis mode', async () => {
      const mockRedis = makeMockRedis();
      // 模拟用户 7 名下有两个 refresh token
      mockRedis.sMembers.mockResolvedValue(['jti-a', 'jti-b']);

      (isRedisAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(mockRedis);

      const revoked = await revokeAllRefreshTokens(7);

      expect(revoked).toBe(2);
      // 撤销所有 jti 对应的 refresh token 记录
      expect(mockRedis.del).toHaveBeenCalledWith(['token:refresh:jti-a', 'token:refresh:jti-b']);
      // 清空用户集合
      expect(mockRedis.del).toHaveBeenCalledWith('token:refresh-user:7');
    });

    it('should return 0 when the user set is empty in Redis mode', async () => {
      const mockRedis = makeMockRedis();

      (isRedisAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (getRedis as ReturnType<typeof vi.fn>).mockReturnValue(mockRedis);

      const revoked = await revokeAllRefreshTokens(404);

      expect(revoked).toBe(0);
    });
  });
});
