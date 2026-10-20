import rateLimit from 'express-rate-limit';

/** 全局限速：每 IP 每 15 分钟最多 300 次请求 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '请求过于频繁，请稍后再试' },
});

/** 登录限速：每 IP 每 15 分钟最多 20 次（防爆破） */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '登录尝试过多，请 15 分钟后再试' },
});

/** 管理员登录限速：每 IP 每 15 分钟最多 10 次 */
export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '管理员登录尝试过多，请 15 分钟后再试' },
});
