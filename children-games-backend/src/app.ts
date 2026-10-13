import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { sequelize, testConnection } from './config/database';
import { initModels } from './models';
import routes from './routes';
import avatarRoutes from './routes/avatar';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logError, initLogger } from './utils/logger';

const app = express();

// 中间件
app.use(helmet());
app.use(cors());
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

    // 测试数据库连接
    await testConnection();

    // 同步数据模型
    await initModels();

    // 启动 HTTP 服务器
    app.listen(config.port, () => {
      console.log(`
🚀 服务器已启动
📍 地址: http://localhost:${config.port}
🌍 环境: ${config.nodeEnv}
      `);
    });
  } catch (error) {
    console.error('启动服务器失败:', error);
    process.exit(1);
  }
};

startServer();

export default app;
