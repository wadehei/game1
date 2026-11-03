import { initSentry } from './utils/sentry';

// Sentry 必须第一个初始化（在任何其他模块加载之前），以便捕获启动期错误
initSentry();

import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { config } from './config';
import { sequelize, testConnection } from './config/database';
import { initModels, seedDefaultAdmin } from './models';
import routes from './routes';
import avatarRoutes from './routes/avatar';
import { initWsServer } from './ws/wsServer';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logError, logInfo, initLogger } from './utils/logger';
import { initSlowQueryLogger, shutdownSlowQueryLogger } from './services/slowQueryLogger';
import { globalLimiter } from './middleware/rateLimiter';
import { swaggerSpec } from './config/swagger';
import { initRedis, closeRedis } from './utils/redis';
import { Sentry } from './utils/sentry';
import { initAuditLogCleanup, shutdownAuditLogCleanup } from './services/auditLogCleanup';

const app = express();

// 信任代理（Nginx 后获取真实客户端 IP）
app.set('trust proxy', true);

// 安全中间件
app.use(helmet());

// CORS 配置：生产环境使用白名单，开发环境允许本地地址
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // 允许没有 origin 的请求（如服务端请求、Postman）
    if (!origin) {
      callback(null, true);
      return;
    }

    const allowedOrigins = config.cors.allowedOrigins;

    // 生产环境：严格白名单
    if (config.isProduction) {
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS 策略不允许来源 ${origin}`));
      }
    } else {
      // 开发环境：允许配置的来源（默认包含 localhost）
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));

// 速率限制：全局应用
app.use(globalLimiter);

// 请求体解析
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: true, limit: '64kb' }));

// 路由
app.use(avatarRoutes); // 头像上传/静态（自带完整路径）
app.use('/api', routes);

// Swagger API 文档
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: '儿童游戏乐园 API',
  })
);

// 提供 OpenAPI JSON 规范文件
app.get('/api-docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

logInfo('server', `📚 API 文档已加载: http://localhost:${config.port}/api-docs`);

// 错误处理
app.use(notFoundHandler);
// Sentry 错误处理中间件：放在所有路由之后、自定义 errorHandler 之前
Sentry.setupExpressErrorHandler(app);
app.use(errorHandler);

// 进程级兜底：未捕获的异常/拒绝同时上报 Sentry 并落盘
process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  logError('process', `未处理的 Promise 拒绝: ${message}`, stack);
  Sentry.captureException(reason);
});
process.on('uncaughtException', (err) => {
  logError('process', `未捕获异常: ${err.message}`, err.stack);
  Sentry.captureException(err);
});

// 启动服务器
let server: http.Server | null = null;

const gracefulShutdown = async (signal: string) => {
  logInfo('server', `\n🛑 收到 ${signal}，开始优雅关闭...`);
  // 1. 停止接受新连接
  if (server) {
    server.close(() => {
      logInfo('server', '✅ HTTP 服务器已关闭');
    });
  }
  // 2. 关闭 Redis 连接
  await closeRedis();
  // 2.5 关闭慢查询日志（刷盘）
  shutdownSlowQueryLogger();
  // 2.6 关闭审计日志清理调度器
  shutdownAuditLogCleanup();
  // 3. 关闭数据库连接池
  try {
    await sequelize.close();
    logInfo('server', '✅ 数据库连接已关闭');
  } catch (err) {
    logError('server', '关闭数据库连接失败', err instanceof Error ? err.stack : String(err));
  }
  // 4. 给正在处理的请求最多 10 秒完成
  setTimeout(() => {
    logInfo('server', '⏰ 强制退出');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const startServer = async () => {
  try {
    // 初始化错误日志（清理过期文件）
    initLogger();

    // 初始化慢查询日志（清理过期文件）
    initSlowQueryLogger();

    // 初始化审计日志清理调度器（每日凌晨 4:00 清理 90 天前的日志）
    initAuditLogCleanup();

    // 每日自动备份到磁盘（03:05，保留最近 7 份），启动时补一份当天
    const { initBackupScheduler } = await import('./services/backupService');
    initBackupScheduler();

    // 初始化 Redis 连接（可选，失败不影响启动）
    await initRedis();

    // 测试数据库连接
    await testConnection();

    // 同步数据模型
    await initModels();

    // 确保默认管理员账号存在（从环境变量创建）
    await seedDefaultAdmin();

    // WebSocket（对战房间），挂在同一个 HTTP server 的 /ws 路径
    server = app.listen(config.port, () => {
      logInfo(
        'server',
        `
🚀 服务器已启动
📍 地址: http://localhost:${config.port}
🌍 环境: ${config.nodeEnv}
📚 API 文档: http://localhost:${config.port}/api-docs
      `
      );
    });
    initWsServer(server);
  } catch (error) {
    logError('server', '启动服务器失败', error instanceof Error ? error.stack : String(error));
    process.exit(1);
  }
};

startServer();

export default app;
