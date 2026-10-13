import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { sequelize, testConnection } from './config/database';
import { initModels } from './models';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app = express();

// 中间件
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 路由
app.use('/api', routes);

// 错误处理
app.use(notFoundHandler);
app.use(errorHandler);

// 启动服务器
const startServer = async () => {
  try {
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
