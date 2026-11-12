import { Sequelize } from 'sequelize';
import { config } from './index';
import { logInfo, logError } from '../utils/logger';
import { recordSlowQuery } from '../services/slowQueryLogger';

export const sequelize = new Sequelize(
  config.database.name,
  config.database.user,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: 'mysql',
    benchmark: true,
    logging: (msg, timing) => {
      // 开发环境输出全部 SQL 到 info 日志
      if (config.nodeEnv === 'development') {
        logInfo('database', msg);
      }
      // 超过 1000ms 的查询记录为慢查询
      if (typeof timing === 'number' && timing >= 1000) {
        recordSlowQuery(timing, msg);
      }
    },
    pool: {
      max: 20,
      min: 2,
      acquire: 30000,
      idle: 30000,
    },
  }
);

export const testConnection = async (): Promise<void> => {
  try {
    await sequelize.authenticate();
    logInfo('database', '✅ 数据库连接成功');
  } catch (error) {
    logError('database', '❌ 数据库连接失败', error instanceof Error ? error.stack : String(error));
    throw error;
  }
};
