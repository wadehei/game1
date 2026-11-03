import fs from 'fs';
import path from 'path';

/**
 * 慢查询日志记录器
 * - 按天写文件 logs/slow-query-YYYY-MM-DD.log
 * - 内存缓冲 + 定时刷盘，避免高频写入拖慢服务
 * - 仅在查询执行时间超过阈值（默认 1000ms）时记录
 */

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const FLUSH_INTERVAL_MS = 2000;
const SLOW_QUERY_THRESHOLD_MS = 1000;

interface SlowQueryEntry {
  time: string;
  level: 'warn';
  source: 'slow-query';
  duration: number;
  sql: string;
}

let buffer: SlowQueryEntry[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

const dateStr = (d = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const ensureDir = (): void => {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
};

const flush = (): void => {
  if (buffer.length === 0) return;

  const pending = buffer;
  buffer = [];

  try {
    ensureDir();
    const date = dateStr();
    const file = path.join(LOG_DIR, `slow-query-${date}.log`);
    fs.appendFileSync(file, pending.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  } catch {
    // 磁盘问题不能拖垮服务，丢弃即可
  }
};

/**
 * 记录慢查询
 * @param duration 查询执行时间（ms）
 * @param sql 查询 SQL 语句
 */
export const recordSlowQuery = (duration: number, sql: string): void => {
  if (duration < SLOW_QUERY_THRESHOLD_MS) return;

  const entry: SlowQueryEntry = {
    time: new Date().toISOString(),
    level: 'warn',
    source: 'slow-query',
    duration: Math.round(duration),
    sql: String(sql).slice(0, 2000),
  };

  buffer.push(entry);

  // 同时输出到控制台（WARN 级别）
  console.warn(`[Slow Query] ${entry.duration}ms | ${entry.sql}`);

  if (!flushTimer) {
    flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
    flushTimer.unref();
  }
};

/**
 * 获取慢查询阈值（ms）
 */
export const getSlowQueryThreshold = (): number => {
  return SLOW_QUERY_THRESHOLD_MS;
};

/**
 * 初始化慢查询日志器（清理过期日志）
 */
export const initSlowQueryLogger = (retentionDays = 14): void => {
  try {
    ensureDir();
    const cutoff = Date.now() - retentionDays * 24 * 3600 * 1000;
    fs.readdirSync(LOG_DIR)
      .filter((f) => f.startsWith('slow-query-') && f.endsWith('.log'))
      .forEach((f) => {
        const match = f.match(/slow-query-(\d{4}-\d{2}-\d{2})\.log/);
        if (match && new Date(match[1]).getTime() < cutoff) {
          fs.unlinkSync(path.join(LOG_DIR, f));
        }
      });
  } catch {
    // ignore
  }
};

/**
 * 关闭慢查询日志器（刷盘并停止定时器）
 */
export const shutdownSlowQueryLogger = (): void => {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flush();
};
