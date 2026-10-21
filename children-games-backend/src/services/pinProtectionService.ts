import { cacheIncr, cacheExists, cacheDel, cacheGet } from '../utils/redis';
import { logInfo, logWarn } from './logger';

/**
 * PIN 防爆破服务（Redis 版，适用于多实例部署）
 *
 * 注意：当前 userController 使用内存版本（pinAttempts Map）做 PIN 防爆破，
 * 适用于单实例部署。此 Redis 版本留作未来多实例扩展使用。
 * 如需切换，修改 userController 中的 checkThrottle/recordFail/clearFails 即可。
 */

const PIN_ATTEMPT_PREFIX = 'pin:attempt:';
const PIN_LOCKOUT_PREFIX = 'pin:lockout:';

// 配置
const MAX_ATTEMPTS = 5; // 最大尝试次数
const BASE_LOCKOUT_SECONDS = 300; // 基础锁定时间（5分钟）
const ATTEMPT_WINDOW_SECONDS = 900; // 尝试计数窗口（15分钟）

interface PinAttemptResult {
  allowed: boolean;
  remainingAttempts: number;
  lockoutSeconds?: number;
}

/**
 * 检查 PIN 尝试是否允许
 */
export const checkPinAttempt = async (
  userId: number
): Promise<PinAttemptResult> => {
  const attemptKey = `${PIN_ATTEMPT_PREFIX}${userId}`;
  const lockoutKey = `${PIN_LOCKOUT_PREFIX}${userId}`;

  // 检查是否在锁定状态
  const isLockedOut = await cacheExists(lockoutKey);
  if (isLockedOut) {
    logWarn('pin-protection', `用户 ${userId} PIN 验证被拒绝（已锁定）`);
    return {
      allowed: false,
      remainingAttempts: 0,
      lockoutSeconds: BASE_LOCKOUT_SECONDS,
    };
  }

  return {
    allowed: true,
    remainingAttempts: MAX_ATTEMPTS,
  };
};

/**
 * 记录 PIN 验证失败
 * 返回是否触发锁定
 */
export const recordPinFailure = async (
  userId: number
): Promise<{ locked: boolean; remainingAttempts: number }> => {
  const attemptKey = `${PIN_ATTEMPT_PREFIX}${userId}`;
  const lockoutKey = `${PIN_LOCKOUT_PREFIX}${userId}`;

  // 递增尝试次数
  const attempts = await cacheIncr(attemptKey, ATTEMPT_WINDOW_SECONDS);

  if (attempts === null) {
    // Redis 不可用，允许尝试（降级到数据库逻辑）
    return { locked: false, remainingAttempts: MAX_ATTEMPTS - 1 };
  }

  const remainingAttempts = Math.max(0, MAX_ATTEMPTS - attempts);

  logInfo(
    'pin-protection',
    `用户 ${userId} PIN 验证失败，第 ${attempts} 次尝试，剩余 ${remainingAttempts} 次`
  );

  // 超过最大尝试次数，触发锁定
  if (attempts >= MAX_ATTEMPTS) {
    // 递增锁定时间（每次锁定翻倍，最多 1 小时）
    const lockoutTime = Math.min(
      BASE_LOCKOUT_SECONDS * Math.pow(2, Math.floor(attempts / MAX_ATTEMPTS) - 1),
      3600
    );

    await cacheIncr(lockoutKey, lockoutTime);
    logWarn(
      'pin-protection',
      `用户 ${userId} PIN 验证失败次数过多，锁定 ${lockoutTime} 秒`
    );

    return { locked: true, remainingAttempts: 0 };
  }

  return { locked: false, remainingAttempts };
};

/**
 * 清除 PIN 尝试记录
 * 在成功验证后调用
 */
export const clearPinAttempts = async (userId: number): Promise<void> => {
  const attemptKey = `${PIN_ATTEMPT_PREFIX}${userId}`;
  const lockoutKey = `${PIN_LOCKOUT_PREFIX}${userId}`;

  await cacheDel(attemptKey);
  await cacheDel(lockoutKey);
  logInfo('pin-protection', `用户 ${userId} PIN 验证成功，尝试记录已重置`);
};

/**
 * 获取当前尝试次数（用于调试）
 */
export const getPinAttemptCount = async (
  userId: number
): Promise<number> => {
  const attemptKey = `${PIN_ATTEMPT_PREFIX}${userId}`;
  const val = await cacheGet(attemptKey);
  return val ? parseInt(val, 10) || 0 : 0;
};
