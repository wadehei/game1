import rateLimit from 'express-rate-limit';

/** 上限从环境变量读取（回归测试需连续登录数十次，启动测试服时调高；
 *  生产不设该变量，保持默认值） */
const envMax = (name: string, fallback: number): number => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
};

/** 全局限速：每 IP 每 15 分钟最多 300 次请求 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: envMax('GLOBAL_RATE_MAX', 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '请求过于频繁，请稍后再试' },
});

/** 登录限速：每 IP 每 15 分钟最多 20 次（防爆破） */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: envMax('LOGIN_RATE_MAX', 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '登录尝试过多，请 15 分钟后再试' },
});

/** 管理员登录限速：每 IP 每 15 分钟最多 10 次 */
export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: envMax('ADMIN_LOGIN_RATE_MAX', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '管理员登录尝试过多，请 15 分钟后再试' },
});
