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
    // sync 不会给旧表补列，逐一对比真实表结构补齐缺失列（防表结构漂移）
    await syncMissingColumns(User);
    await syncMissingColumns(GameProgress);
    await syncMissingColumns(LevelConfig);
    await syncMissingColumns(DailyTask);
    console.log('✅ 数据表同步成功');
  } catch (error) {
    console.error('❌ 数据表同步失败:', error);
    throw error;
  }
};

/** 对比模型定义与数据库实际列，自动补齐缺失列 */
const syncMissingColumns = async (model: any): Promise<void> => {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = model.getTableName() as string;
  const described = await queryInterface.describeTable(tableName);
  for (const [name, attr] of Object.entries<any>(model.rawAttributes)) {
    const field = attr.field || name;
    if (described[field]) {
      continue;
    }
    await queryInterface.addColumn(tableName, field, attr);
    console.log(`✅ 已补充数据列: ${tableName}.${field}`);
  }
};
