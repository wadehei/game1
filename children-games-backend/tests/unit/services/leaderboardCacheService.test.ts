import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────
vi.mock('../../../src/utils/redis', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
  isRedisAvailable: vi.fn(),
}));

vi.mock('../../../src/utils/logger', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../../src/services/achievementService', () => ({
  GAME_RULES: {
    memory: { lowerScoreIsBetter: true },
    puzzle: { lowerScoreIsBetter: true },
    fruit: { lowerScoreIsBetter: false },
  },
}));

vi.mock('../../../src/config/constants', () => ({
  LEADERBOARD_CACHE_TTL: 300,
}));

import { cacheGet, cacheSet, cacheDel, isRedisAvailable } from '../../../src/utils/redis';
import {
  getCachedLeaderboard,
  cacheLeaderboard,
  invalidateLeaderboardCache,
  invalidateAllLeaderboards,
} from '../../../src/services/leaderboardCacheService';

const mockIsRedisAvailable = vi.mocked(isRedisAvailable);
const mockCacheGet = vi.mocked(cacheGet);
const mockCacheSet = vi.mocked(cacheSet);
const mockCacheDel = vi.mocked(cacheDel);

describe('leaderboardCacheService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCachedLeaderboard', () => {
    it('should return null when Redis is not available', async () => {
      mockIsRedisAvailable.mockReturnValue(false);
      const result = await getCachedLeaderboard('fruit');
      expect(result).toBeNull();
      expect(mockCacheGet).not.toHaveBeenCalled();
    });

    it('should return null when cache miss', async () => {
      mockIsRedisAvailable.mockReturnValue(true);
      mockCacheGet.mockResolvedValue(null);
      const result = await getCachedLeaderboard('fruit');
      expect(result).toBeNull();
      expect(mockCacheGet).toHaveBeenCalledWith('leaderboard:fruit');
    });

    it('should return parsed data when cache hit', async () => {
      const mockData = [
        { rank: 1, userId: 1, nickname: 'Alice', avatar: '', highScore: 100, level: 5 },
      ];
      mockIsRedisAvailable.mockReturnValue(true);
      mockCacheGet.mockResolvedValue(JSON.stringify(mockData));

      const result = await getCachedLeaderboard('memory');
      expect(result).toEqual(mockData);
      expect(mockCacheGet).toHaveBeenCalledWith('leaderboard:memory');
    });

    it('should return null on JSON parse error', async () => {
      mockIsRedisAvailable.mockReturnValue(true);
      mockCacheGet.mockResolvedValue('not-valid-json');

      const result = await getCachedLeaderboard('puzzle');
      expect(result).toBeNull();
    });

    it('should return null when cacheGet throws', async () => {
      mockIsRedisAvailable.mockReturnValue(true);
      mockCacheGet.mockRejectedValue(new Error('Redis crashed'));

      const result = await getCachedLeaderboard('memory');
      expect(result).toBeNull();
    });
  });

  describe('cacheLeaderboard', () => {
    it('should skip when Redis is not available', async () => {
      mockIsRedisAvailable.mockReturnValue(false);
      await cacheLeaderboard('fruit', []);
      expect(mockCacheSet).not.toHaveBeenCalled();
    });

    it('should cache serialized data with TTL', async () => {
      mockIsRedisAvailable.mockReturnValue(true);
      const data = [{ rank: 1, userId: 2, nickname: 'Bob', avatar: '', highScore: 200, level: 3 }];
      await cacheLeaderboard('fruit', data);
      expect(mockCacheSet).toHaveBeenCalledWith('leaderboard:fruit', JSON.stringify(data), 300);
    });

    it('should cache empty array', async () => {
      mockIsRedisAvailable.mockReturnValue(true);
      await cacheLeaderboard('memory', []);
      expect(mockCacheSet).toHaveBeenCalledWith('leaderboard:memory', '[]', 300);
    });

    it('should not throw on cache set failure', async () => {
      mockIsRedisAvailable.mockReturnValue(true);
      mockCacheSet.mockRejectedValue(new Error('Redis down'));
      await expect(cacheLeaderboard('fruit', [])).resolves.toBeUndefined();
    });
  });

  describe('invalidateLeaderboardCache', () => {
    it('should skip when Redis is not available', async () => {
      mockIsRedisAvailable.mockReturnValue(false);
      await invalidateLeaderboardCache('fruit');
      expect(mockCacheDel).not.toHaveBeenCalled();
    });

    it('should delete the cache key', async () => {
      mockIsRedisAvailable.mockReturnValue(true);
      await invalidateLeaderboardCache('memory');
      expect(mockCacheDel).toHaveBeenCalledWith('leaderboard:memory');
    });

    it('should not throw on cache del failure', async () => {
      mockIsRedisAvailable.mockReturnValue(true);
      mockCacheDel.mockRejectedValue(new Error('Redis error'));
      await expect(invalidateLeaderboardCache('fruit')).resolves.toBeUndefined();
    });
  });

  describe('invalidateAllLeaderboards', () => {
    it('should skip when Redis is not available', async () => {
      mockIsRedisAvailable.mockReturnValue(false);
      await invalidateAllLeaderboards();
      expect(mockCacheDel).not.toHaveBeenCalled();
    });

    it('should invalidate all known game leaderboards', async () => {
      mockIsRedisAvailable.mockReturnValue(true);
      await invalidateAllLeaderboards();
      // GAME_RULES has memory, puzzle, fruit (from mock)
      expect(mockCacheDel).toHaveBeenCalledTimes(3);
      expect(mockCacheDel).toHaveBeenCalledWith('leaderboard:memory');
      expect(mockCacheDel).toHaveBeenCalledWith('leaderboard:puzzle');
      expect(mockCacheDel).toHaveBeenCalledWith('leaderboard:fruit');
    });

    it('should handle del failure for individual games gracefully', async () => {
      mockIsRedisAvailable.mockReturnValue(true);
      mockCacheDel.mockRejectedValueOnce(new Error('fail on memory'));
      // Should not throw; remaining games still get processed
      await expect(invalidateAllLeaderboards()).resolves.toBeUndefined();
      expect(mockCacheDel).toHaveBeenCalledTimes(3);
    });
  });
});
