import { cleanupExpiredAuditLogs } from './auditLogService';
import { logInfo, logError } from '../utils/logger';

/**
 * 审计日志清理调度器
 * 每日凌晨 4:00 清理 90 天前的审计日志
 */

let cleanupTimer: NodeJS.Timeout | null = null;

/**
 * 计算到下一个凌晨 4:00 的毫秒数
 */
const getNextCleanupTime = (): number => {
  const now = new Date();
  const next = new Date(now);
  next.setHours(4, 0, 0, 0);

  // 如果今天的 4:00 已过，设置为明天 4:00
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  return next.getTime() - now.getTime();
};

/**
 * 执行清理任务
 */
const runCleanup = async (): Promise<void> => {
  try {
    logInfo('audit', '开始清理过期的审计日志（保留 90 天）...');
    const deletedCount = await cleanupExpiredAuditLogs();
    logInfo('audit', `✅ 已清理 ${deletedCount} 条过期审计日志`);
  } catch (error) {
    logError('audit', '清理审计日志失败', error instanceof Error ? error.stack : String(error));
  } finally {
    // 安排下一次清理（24 小时后）
    scheduleNextCleanup(24 * 60 * 60 * 1000);
  }
};

/**
 * 安排下一次清理
 */
const scheduleNextCleanup = (delayMs: number): void => {
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
  }

  cleanupTimer = setTimeout(() => {
    runCleanup();
  }, delayMs);

  // 防止定时器阻止进程退出
  cleanupTimer.unref();
};

/**
 * 初始化审计日志清理调度器
 * 在应用启动时调用
 */
export const initAuditLogCleanup = (): void => {
  const delayMs = getNextCleanupTime();
  const nextRun = new Date(Date.now() + delayMs);

  logInfo('audit', `📋 审计日志清理调度器已启动，下次清理时间: ${nextRun.toLocaleString('zh-CN')}`);

  scheduleNextCleanup(delayMs);
};

/**
 * 关闭清理调度器
 * 在应用关闭时调用
 */
export const shutdownAuditLogCleanup = (): void => {
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
    logInfo('audit', '审计日志清理调度器已关闭');
  }
};
