export { User } from './User';
export { GameProgress } from './GameProgress';
export { LevelConfig } from './LevelConfig';
export { DailyTask } from './DailyTask';

import { sequelize } from '../config/database';
import { User } from './User';
import { GameProgress } from './GameProgress';
import { LevelConfig } from './LevelConfig';
import { DailyTask } from './DailyTask';

// 定义模型关联关系
User.hasMany(GameProgress, { foreignKey: 'userId', as: 'gameProgress' });
GameProgress.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(DailyTask, { foreignKey: 'userId', as: 'dailyTasks' });
DailyTask.belongsTo(User, { foreignKey: 'userId', as: 'user' });

export const initModels = async (): Promise<void> => {
  try {
    await User.sync();
    await GameProgress.sync();
    await LevelConfig.sync();
    await DailyTask.sync();
    await ensureColumn('game_progress', 'levelStars', 'TEXT NULL COMMENT \'每关最佳星级JSON对象\'');
    await ensureColumn('users', 'achievements', 'TEXT NULL COMMENT \'已解锁成就ID JSON数组\'');
    console.log('✅ 数据表同步成功');
  } catch (error) {
    console.error('❌ 数据表同步失败:', error);
    throw error;
  }
};

/** 幂等加列：已存在时忽略 MySQL 1060 错误（sync 不会给旧表补列） */
const ensureColumn = async (table: string, column: string, definition: string): Promise<void> => {
  try {
    await sequelize.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`✅ 已补充数据列: ${table}.${column}`);
  } catch (error: any) {
    const isDuplicateColumn = error?.original?.errno === 1060 || error?.original?.code === 'ER_DUP_FIELDNAME';
    if (!isDuplicateColumn) {
      throw error;
    }
  }
};
