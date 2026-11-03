// PIN 口令服务：哈希、校验、防爆破（内存 Map + 递增锁定）
import bcrypt from 'bcrypt';
import { RATE_LIMIT_MAX_SIZE, RATE_LIMIT_CLEANUP_THRESHOLD } from '../config/constants';

const PIN_HASH_ROUNDS = 12;

export const hashPin = async (pin: string): Promise<string> => bcrypt.hash(pin, PIN_HASH_ROUNDS);

export const verifyPin = async (pin: string, hash: string): Promise<boolean> =>
  bcrypt.compare(pin, hash);

export const isValidPin = (pin: unknown): pin is string =>
  typeof pin === 'string' && /^\d{4}$/.test(pin);

// 防爆破：同一角色 1 分钟内错 5 次锁定 60 秒，递增惩罚
const pinAttempts = new Map<number, { count: number; lockedUntil: number }>();

const evictOldestPinAttempts = (targetSize: number): void => {
  if (pinAttempts.size <= targetSize) return;
  const entries = [...pinAttempts.entries()].sort((a, b) => a[1].lockedUntil - b[1].lockedUntil);
  const toDelete = pinAttempts.size - targetSize;
  for (let i = 0; i < toDelete && i < entries.length; i++) {
    pinAttempts.delete(entries[i][0]);
  }
};

// 定期清理过期条目，防止内存泄漏（每 2 分钟扫描一次）
setInterval(() => {
  const now = Date.now();
  for (const [uid, rec] of pinAttempts) {
    if (rec.lockedUntil < now) {
      pinAttempts.delete(uid);
    }
  }
}, 120_000).unref();

export const checkThrottle = (userId: number): number | null => {
  const rec = pinAttempts.get(userId);
  if (rec && rec.lockedUntil > Date.now()) return rec.lockedUntil;
  return null;
};

export const recordFail = (userId: number): void => {
  const rec = pinAttempts.get(userId) || { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= 5) {
    const lockDuration = rec.count >= 15 ? 30 * 60_000 : rec.count >= 10 ? 5 * 60_000 : 60_000;
    rec.lockedUntil = Date.now() + lockDuration;
    rec.count = 0;
  }
  if (!pinAttempts.has(userId) && pinAttempts.size >= RATE_LIMIT_MAX_SIZE) {
    evictOldestPinAttempts(RATE_LIMIT_CLEANUP_THRESHOLD);
  }
  pinAttempts.set(userId, rec);
};

export const clearFails = (userId: number): void => {
  pinAttempts.delete(userId);
};
