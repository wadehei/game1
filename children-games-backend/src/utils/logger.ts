import fs from 'fs';
import path from 'path';

/**
 * 完整的日志系统（零依赖）：
 * - 按天写文件 logs/app-YYYY-MM-DD.log（JSON Lines，每行一条）
 * - 错误日志单独记录 logs/error-YYYY-MM-DD.log
 * - 启动时清理 14 天前的旧日志
 * - 内存缓冲 + 定时刷盘，避免高频日志拖慢请求
 * - 支持不同级别：debug、info、warn、error
 */

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const RETENTION_DAYS = 14;
const FLUSH_INTERVAL_MS = 2000;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  time: string;
  level: LogLevel;
  source: string;
  message: string;
  detail?: string;
}

let appBuffer: LogEntry[] = [];
let errorBuffer: LogEntry[] = [];
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
  if (appBuffer.length === 0 && errorBuffer.length === 0) return;

  const pendingApp = appBuffer;
  const pendingError = errorBuffer;
  appBuffer = [];
  errorBuffer = [];

  try {
    ensureDir();
    const date = dateStr();

    // 写应用日志
    if (pendingApp.length > 0) {
      const appFile = path.join(LOG_DIR, `app-${date}.log`);
      fs.appendFileSync(appFile, pendingApp.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
    }

    // 写错误日志
    if (pendingError.length > 0) {
      const errorFile = path.join(LOG_DIR, `error-${date}.log`);
      fs.appendFileSync(errorFile, pendingError.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
    }
  } catch {
    // 磁盘问题不能拖垮服务，丢弃即可
  }
};

const createLogEntry = (level: LogLevel, source: string, message: string, detail?: string): LogEntry => {
  return {
    time: new Date().toISOString(),
    level,
    source,
    message: String(message || 'unknown').slice(0, 500),
    detail: detail ? String(detail).slice(0, 2000) : undefined,
  };
};

/** 记录 debug 级别日志 */
export const logDebug = (source: string, message: string, detail?: string): void => {
  if (process.env.NODE_ENV === 'production') return; // 生产环境不记录 debug

  const entry = createLogEntry('debug', source, message, detail);
  appBuffer.push(entry);

  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[DEBUG][${source}]`, message, detail || '');
  }

  if (!flushTimer) {
    flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
    flushTimer.unref();
  }
};

/** 记录 info 级别日志 */
export const logInfo = (source: string, message: string, detail?: string): void => {
  const entry = createLogEntry('info', source, message, detail);
  appBuffer.push(entry);

  console.log(`[INFO][${source}]`, message, detail || '');

  if (!flushTimer) {
    flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
    flushTimer.unref();
  }
};

/** 记录 warn 级别日志 */
export const logWarn = (source: string, message: string, detail?: string): void => {
  const entry = createLogEntry('warn', source, message, detail);
  appBuffer.push(entry);

  console.warn(`[WARN][${source}]`, message, detail || '');

  if (!flushTimer) {
    flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
    flushTimer.unref();
  }
};

/** 记录 error 级别日志 */
export const logError = (source: string, message: string, detail?: string): void => {
  const entry = createLogEntry('error', source, message, detail);
  appBuffer.push(entry);
  errorBuffer.push(entry);

  console.error(`[ERROR][${source}]`, message, detail || '');

  if (!flushTimer) {
    flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
    flushTimer.unref();
  }
};

/** 读取最近的错误（按时间倒序，跨最近几个日志文件） */
export const readRecentErrors = (limit = 100): LogEntry[] => {
  try {
    ensureDir();
    const files = fs
      .readdirSync(LOG_DIR)
      .filter((f) => f.startsWith('error-') && f.endsWith('.log'))
      .sort()
      .reverse()
      .slice(0, 3);
    const lines: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(path.join(LOG_DIR, file), 'utf8');
      lines.push(...content.split('\n').filter(Boolean));
    }
    return lines
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line) as LogEntry;
        } catch {
          return { time: '', level: 'error' as const, source: 'raw', message: line };
        }
      })
      .reverse();
  } catch {
    return [];
  }
};

/** 清空全部错误日志 */
export const clearErrors = (): void => {
  errorBuffer = [];
  try {
    ensureDir();
    fs.readdirSync(LOG_DIR)
      .filter((f) => f.startsWith('error-') && f.endsWith('.log'))
      .forEach((f) => fs.unlinkSync(path.join(LOG_DIR, f)));
  } catch {
    // ignore
  }
};

/** 启动时清理过期日志 */
export const initLogger = (): void => {
  try {
    ensureDir();
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 3600 * 1000;
    fs.readdirSync(LOG_DIR)
      .filter((f) => f.startsWith('app-') || f.startsWith('error-'))
      .forEach((f) => {
        const match = f.match(/(?:app|error)-(\d{4}-\d{2}-\d{2})\.log/);
        if (match && new Date(match[1]).getTime() < cutoff) {
          fs.unlinkSync(path.join(LOG_DIR, f));
        }
      });
  } catch {
    // ignore
  }
};
