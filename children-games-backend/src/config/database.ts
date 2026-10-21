import { Sequelize } from 'sequelize';
import { config } from './index';
import { logInfo, logError } from '../utils/logger';

export const sequelize = new Sequelize(
  config.database.name,
  config.database.user,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: 'mysql',
    logging: config.nodeEnv === 'development' ? (msg) => logInfo('database', msg) : false,
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
