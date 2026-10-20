import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { sequelize, testConnection } from './config/database';
import { initModels } from './models';
import routes from './routes';
import avatarRoutes from './routes/avatar';
import { initWsServer } from './ws/wsServer';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logError, initLogger } from './utils/logger';
import { globalLimiter } from './middleware/rateLimiter';

const app = express();

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
app.use(express.urlencoded({ extended: true }));

// 路由
app.use(avatarRoutes); // 头像上传/静态（自带完整路径）
app.use('/api', routes);

// 错误处理
app.use(notFoundHandler);
app.use(errorHandler);

// 进程级兜底：未捕获的异常/拒绝也落盘
process.on('unhandledRejection', (reason) => {
  logError('process', `未处理的 Promise 拒绝: ${reason instanceof Error ? reason.message : String(reason)}`, reason instanceof Error ? reason.stack : undefined);
});
process.on('uncaughtException', (err) => {
  logError('process', `未捕获异常: ${err.message}`, err.stack);
});

// 启动服务器
const startServer = async () => {
  try {
    // 初始化错误日志（清理过期文件）
    initLogger();

    // 每日自动备份到磁盘（03:05，保留最近 7 份），启动时补一份当天
    const { initBackupScheduler } = await import('./services/backupService');
    initBackupScheduler();

    // 测试数据库连接
    await testConnection();

    // 同步数据模型
    await initModels();

    // WebSocket（对战房间），挂在同一个 HTTP server 的 /ws 路径
    const server = app.listen(config.port, () => {
      console.log(`
🚀 服务器已启动
📍 地址: http://localhost:${config.port}
🌍 环境: ${config.nodeEnv}
      `);
    });
    initWsServer(server);
  } catch (error) {
    console.error('启动服务器失败:', error);
    process.exit(1);
  }
};

startServer();

export default app;
