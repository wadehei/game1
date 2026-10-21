import { createClient, RedisClientType } from 'redis';
import { config } from '../config';
import { logError, logInfo } from './logger';

let redisClient: RedisClientType | null = null;
let isConnected = false;

/**
 * 初始化 Redis 连接
 */
export const initRedis = async (): Promise<RedisClientType | null> => {
  // 如果 Redis 未配置（host 为空），返回 null
  if (!config.redis.host || config.redis.host === '') {
    logInfo('redis', '⚠️  Redis 未配置，将使用内存缓存');
    return null;
  }

  try {
    redisClient = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
      },
      password: config.redis.password || undefined,
    });

    redisClient.on('error', (err) => {
      logError('redis', 'Redis 连接错误', err instanceof Error ? err.stack : String(err));
      isConnected = false;
    });

    redisClient.on('connect', () => {
      logInfo('redis', '✅ Redis 已连接');
      isConnected = true;
    });

    redisClient.on('end', () => {
      logInfo('redis', '🔌 Redis 连接已关闭');
      isConnected = false;
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    logError('redis', 'Redis 连接失败，将使用内存缓存', error instanceof Error ? error.stack : String(error));
    redisClient = null;
    isConnected = false;
    return null;
  }
};

/**
 * 关闭 Redis 连接
 */
export const closeRedis = async (): Promise<void> => {
  if (redisClient && isConnected) {
    await redisClient.quit();
    redisClient = null;
    isConnected = false;
  }
};

/**
 * 获取 Redis 客户端
 */
export const getRedis = (): RedisClientType | null => {
  return redisClient;
};

/**
 * 检查 Redis 是否可用
 */
export const isRedisAvailable = (): boolean => {
  return redisClient !== null && isConnected;
};

// ─── 缓存操作封装 ───────────────────────────────────────

/**
 * 设置缓存
 */
export const cacheSet = async (
  key: string,
  value: string,
  ttlSeconds?: number
): Promise<boolean> => {
  if (!redisClient || !isConnected) return false;

  try {
    if (ttlSeconds) {
      await redisClient.set(key, value, { EX: ttlSeconds });
    } else {
      await redisClient.set(key, value);
    }
    return true;
  } catch (error) {
    logError('redis', `缓存设置失败: ${key}`, error instanceof Error ? error.stack : String(error));
    return false;
  }
};

/**
 * 获取缓存
 */
export const cacheGet = async (key: string): Promise<string | null> => {
  if (!redisClient || !isConnected) return null;

  try {
    return await redisClient.get(key);
  } catch (error) {
    logError('redis', `缓存获取失败: ${key}`, error instanceof Error ? error.stack : String(error));
    return null;
  }
};

/**
 * 删除缓存
 */
export const cacheDel = async (key: string): Promise<boolean> => {
  if (!redisClient || !isConnected) return false;

  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    logError('redis', `缓存删除失败: ${key}`, error instanceof Error ? error.stack : String(error));
    return false;
  }
};

/**
 * 递增计数器（用于限流）
 */
export const cacheIncr = async (key: string, ttlSeconds?: number): Promise<number | null> => {
  if (!redisClient || !isConnected) return null;

  try {
    const count = await redisClient.incr(key);
    if (ttlSeconds && count === 1) {
      await redisClient.expire(key, ttlSeconds);
    }
    return count;
  } catch (error) {
    logError('redis', `计数器递增失败: ${key}`, error instanceof Error ? error.stack : String(error));
    return null;
  }
};

/**
 * 检查键是否存在
 */
export const cacheExists = async (key: string): Promise<boolean> => {
  if (!redisClient || !isConnected) return false;

  try {
    const exists = await redisClient.exists(key);
    return exists === 1;
  } catch (error) {
    logError('redis', `键存在性检查失败: ${key}`, error instanceof Error ? error.stack : String(error));
    return false;
  }
};
