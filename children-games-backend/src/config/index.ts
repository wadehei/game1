import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// 生产环境安全检查
if (isProduction) {
  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET === 'your_jwt_secret_key_change_this_in_production_2024'
  ) {
    throw new Error('生产环境必须设置安全的 JWT_SECRET！');
  }
  if (!process.env.DB_PASSWORD || process.env.DB_PASSWORD === '') {
    throw new Error('生产环境必须设置数据库密码！');
  }
  if (!process.env.CORS_ALLOWED_ORIGINS || process.env.CORS_ALLOWED_ORIGINS === '') {
    // fail-fast：生产默认白名单为空（安全优先），忘配 env 必须在部署时立刻爆炸，
    // 而不是上线后浏览器（带 Origin 头）全员 500（2026-11-17 建房 500 事故教训：
    // 当时只有 console.warn，雷在 develop 躃了近一个月才被部署引爆）
    throw new Error('生产环境必须设置 CORS_ALLOWED_ORIGINS（逗号分隔的站点入口白名单）！');
  }
}

export const config = {
  // 服务器配置
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv,
  isProduction,

  // 数据库配置
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    name: process.env.DB_NAME || 'children_games',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  },

  // Redis 配置
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
  },

  // JWT 配置
  jwt: {
    secret: process.env.JWT_SECRET || 'default_secret_change_me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // CORS 配置
  cors: {
    allowedOrigins: process.env.CORS_ALLOWED_ORIGINS
      ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
      : isProduction
        ? // 生产默认空数组（安全优先）：白名单必须经 CORS_ALLOWED_ORIGINS 配置，
          // 且启动检查强制要求已配置（见上方 fail-fast）——双保险防 2026-11-17
          // 建房 500 事故复发（当时默认[]+仅warn，雷躺近一个月才引爆）
          []
        : ['http://localhost:5173', 'http://localhost:3002'],
  },

  // 速率限制配置
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 分钟
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  // 微信小程序配置
  wechat: {
    appId: process.env.WX_APPID || '',
    secret: process.env.WX_SECRET || '',
  },
};
