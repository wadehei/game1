import { cacheGet, cacheSet, cacheDel, isRedisAvailable } from '../utils/redis';
import { logInfo } from '../utils/logger';

/**
 * 排行榜缓存服务
 * 使用 Redis 缓存排行榜数据，减少数据库查询
 */

const LEADERBOARD_CACHE_PREFIX = 'leaderboard:';
const LEADERBOARD_CACHE_TTL = 300; // 5 分钟缓存

interface LeaderboardEntry {
  rank: number;
  userId: number;
  nickname: string;
  avatar: string;
  highScore: number;
  level: number;
}

/**
 * 获取缓存的排行榜
 */
export const getCachedLeaderboard = async (gameId: string): Promise<LeaderboardEntry[] | null> => {
  if (!isRedisAvailable()) return null;

  try {
    const cacheKey = `${LEADERBOARD_CACHE_PREFIX}${gameId}`;
    const cached = await cacheGet(cacheKey);

    if (!cached) return null;

    const data = JSON.parse(cached);
    logInfo('leaderboard-cache', `✅ 排行榜缓存命中: ${gameId}`);
    return data;
  } catch (error) {
    return null;
  }
};

/**
 * 缓存排行榜数据
 */
export const cacheLeaderboard = async (gameId: string, data: LeaderboardEntry[]): Promise<void> => {
  if (!isRedisAvailable()) return;

  try {
    const cacheKey = `${LEADERBOARD_CACHE_PREFIX}${gameId}`;
    await cacheSet(cacheKey, JSON.stringify(data), LEADERBOARD_CACHE_TTL);
    logInfo('leaderboard-cache', `💾 排行榜已缓存: ${gameId}`);
  } catch (error) {
    // 缓存失败不影响主流程
  }
};

/**
 * 清除排行榜缓存
 * 在用户更新游戏进度后调用
 */
export const invalidateLeaderboardCache = async (gameId: string): Promise<void> => {
  if (!isRedisAvailable()) return;

  try {
    const cacheKey = `${LEADERBOARD_CACHE_PREFIX}${gameId}`;
    await cacheDel(cacheKey);
    logInfo('leaderboard-cache', `🗑️  排行榜缓存已清除: ${gameId}`);
  } catch (error) {
    // 清除失败不影响主流程
  }
};

/**
 * 批量清除所有排行榜缓存
 */
export const invalidateAllLeaderboards = async (): Promise<void> => {
  if (!isRedisAvailable()) return;

  // 由于 Redis 没有直接的模式删除（在生产环境中 SCAN 更安全），
  // 这里我们只清除已知的游戏排行榜
  const knownGames = [
    'memory',
    'puzzle',
    'fruit',
    'balloon',
    'tank',
    'mole',
    'simon',
    'math',
    'match',
    'match3',
    'brick',
  ];
  for (const gameId of knownGames) {
    await invalidateLeaderboardCache(gameId);
  }
};
