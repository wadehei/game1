import { cacheGet, cacheSet, cacheDel, isRedisAvailable } from '../utils/redis';
import { logInfo } from '../utils/logger';
import { GAME_RULES } from './achievementService';
import { LEADERBOARD_CACHE_TTL } from '../config/constants';

/**
 * 排行榜缓存服务
 * 使用 Redis 缓存排行榜数据，减少数据库查询
 */

const LEADERBOARD_CACHE_PREFIX = 'leaderboard:';

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
 * 从 GAME_RULES 动态读取所有游戏 ID，新增游戏无需修改此处
 */
export const invalidateAllLeaderboards = async (): Promise<void> => {
  if (!isRedisAvailable()) return;

  // 从 achievementService 的 GAME_RULES 动态获取所有游戏 ID
  const knownGames = Object.keys(GAME_RULES);
  for (const gameId of knownGames) {
    await invalidateLeaderboardCache(gameId);
  }
  logInfo('leaderboard-cache', `🗑️  已清除 ${knownGames.length} 个游戏的排行榜缓存`);
};
