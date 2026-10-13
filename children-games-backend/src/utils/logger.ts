import fs from 'fs';
import path from 'path';

/**
 * 轻量错误日志（零依赖）：
 * - 按天写文件 logs/error-YYYY-MM-DD.log（JSON Lines，每行一条）
 * - 启动时清理 14 天前的旧日志
 * - 内存缓冲 + 定时刷盘，避免高频错误拖慢请求
 */

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const RETENTION_DAYS = 14;
const FLUSH_INTERVAL_MS = 2000;

interface LogEntry {
  time: string;
  source: string;   // server / client / process
  message: string;
  detail?: string;
}

let buffer: LogEntry[] = [];
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
    const file = path.join(LOG_DIR, `error-${dateStr()}.log`);
    fs.appendFileSync(file, pending.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  } catch {
    // 磁盘问题不能拖垮服务，丢弃即可
  }
};

/** 记录一条错误（进缓冲，2 秒内落盘） */
export const logError = (source: string, message: string, detail?: string): void => {
  const entry: LogEntry = {
    time: new Date().toISOString(),
    source,
    message: String(message || 'unknown').slice(0, 500),
    detail: detail ? String(detail).slice(0, 2000) : undefined,
  };
  buffer.push(entry);
  console.error(`[${source}]`, entry.message, detail || '');

  if (!flushTimer) {
    flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
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
          return { time: '', source: 'raw', message: line };
        }
      })
      .reverse();
  } catch {
    return [];
  }
};

/** 清空全部错误日志 */
export const clearErrors = (): void => {
  buffer = [];
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
      .filter((f) => f.startsWith('error-') && f.endsWith('.log'))
      .forEach((f) => {
        const match = f.match(/error-(\d{4}-\d{2}-\d{2})\.log/);
        if (match && new Date(match[1]).getTime() < cutoff) {
          fs.unlinkSync(path.join(LOG_DIR, f));
        }
      });
  } catch {
    // ignore
  }
};
