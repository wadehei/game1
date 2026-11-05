export { User } from './User';
export { GameProgress } from './GameProgress';
export { LevelConfig } from './LevelConfig';
export { DailyTask } from './DailyTask';
export { AppSetting } from './AppSetting';
export { UserPlaytime } from './UserPlaytime';
export { Feedback } from './Feedback';
export { FeedbackReply } from './FeedbackReply';
export { QuizQuestion } from './QuizQuestion';
export { BattleRecord } from './BattleRecord';
export { AuditLog } from './AuditLog';
export { Admin } from './Admin';

import { ModelStatic, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { User } from './User';
import { GameProgress } from './GameProgress';
import { LevelConfig } from './LevelConfig';
import { DailyTask } from './DailyTask';
import { AppSetting } from './AppSetting';
import { UserPlaytime } from './UserPlaytime';
import { Feedback } from './Feedback';
import { FeedbackReply } from './FeedbackReply';
import { QuizQuestion } from './QuizQuestion';
import { BattleRecord } from './BattleRecord';
import { AuditLog } from './AuditLog';
import { Admin } from './Admin';
import { logInfo, logError } from '../utils/logger';

// 定义模型关联关系
User.hasMany(GameProgress, { foreignKey: 'userId', as: 'gameProgress' });
GameProgress.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(DailyTask, { foreignKey: 'userId', as: 'dailyTasks' });
DailyTask.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Feedback, { foreignKey: 'userId', as: 'feedbacks' });
Feedback.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Feedback.hasMany(FeedbackReply, { foreignKey: 'feedbackId', as: 'replies' });
FeedbackReply.belongsTo(Feedback, { foreignKey: 'feedbackId', as: 'feedback' });
FeedbackReply.belongsTo(User, { foreignKey: 'userId', as: 'user' });

export const initModels = async (): Promise<void> => {
  try {
    await User.sync();
    await GameProgress.sync();
    await LevelConfig.sync();
    await DailyTask.sync();
    await AppSetting.sync();
    await UserPlaytime.sync();
    await Feedback.sync();
    await FeedbackReply.sync();
    await QuizQuestion.sync();
    await BattleRecord.sync();
    await AuditLog.sync();
    await Admin.sync();
    // sync 不会给旧表补列，逐一对比真实表结构补齐缺失列（防表结构漂移）
    await syncMissingColumns(User);
    await syncMissingColumns(GameProgress);
    await syncMissingColumns(LevelConfig);
    await syncMissingColumns(DailyTask);
    await syncMissingColumns(AppSetting);
    await syncMissingColumns(UserPlaytime);
    await syncMissingColumns(Feedback);
    await syncMissingColumns(FeedbackReply);
    await syncMissingColumns(QuizQuestion);
    await syncMissingColumns(BattleRecord);
    await syncMissingColumns(AuditLog);
    await syncMissingColumns(Admin);
    // sync 也不会给旧表补索引，手动检查并补齐缺失索引
    await syncMissingIndexes();
    logInfo('database', '✅ 数据表同步成功');
  } catch (error) {
    logError('database', '❌ 数据表同步失败', error instanceof Error ? error.stack : String(error));
    throw error;
  }
};

/** 对比模型定义与数据库实际索引，自动补齐缺失索引 */
const syncMissingIndexes = async (): Promise<void> => {
  const queryInterface = sequelize.getQueryInterface();

  interface IndexDefinition {
    fields: string[];
    name?: string;
    unique?: boolean;
  }

  interface ModelWithIndexes<M extends Model> extends ModelStatic<M> {
    _indexes?: IndexDefinition[];
  }

  const models: Array<{ model: ModelWithIndexes<Model>; tableName: string }> = [
    { model: GameProgress, tableName: 'game_progress' },
    { model: UserPlaytime, tableName: 'user_playtime' },
    { model: FeedbackReply, tableName: 'feedback_replies' },
    { model: AuditLog, tableName: 'audit_logs' },
  ];

  for (const { model, tableName } of models) {
    const indexes = model._indexes || [];
    const existingIndexes = (await queryInterface.showIndex(tableName)) as Array<{ name: string }>;
    const existingNames = new Set(existingIndexes.map((idx) => idx.name));

    for (const idx of indexes) {
      const indexName = idx.name || `${tableName}_${idx.fields.join('_')}`;
      if (existingNames.has(indexName)) continue;

      const cols = idx.fields.map((f: string) => `\`${f}\``).join(', ');
      const uq = idx.unique ? 'UNIQUE ' : '';
      await sequelize.query(
        `ALTER TABLE \`${tableName}\` ADD ${uq}INDEX \`${indexName}\` (${cols})`
      );
      logInfo('database', `✅ 已补充索引: ${tableName}.${indexName}`);
    }
  }
};

/** 对比模型定义与数据库实际列，自动补齐缺失列 */
const syncMissingColumns = async <M extends Model>(model: ModelStatic<M>): Promise<void> => {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = model.getTableName() as string;
  const described = await queryInterface.describeTable(tableName);
  for (const [name, attr] of Object.entries(model.rawAttributes)) {
    const field = attr.field || name;
    if (described[field]) {
      continue;
    }
    await queryInterface.addColumn(tableName, field, attr);
    logInfo('database', `✅ 已补充数据列: ${tableName}.${field}`);
  }
};

/** 确保默认管理员账号存在（从 ADMIN_USERNAME / ADMIN_PASSWORD 环境变量） */
export const seedDefaultAdmin = async (): Promise<void> => {
  const bcrypt = await import('bcrypt');
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    return; // 未配置密码，跳过（开发环境可能不需要）
  }

  const existing = await Admin.findOne({ where: { username } });
  if (existing) {
    return; // 已存在
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await Admin.create({ username, passwordHash });
  logInfo('database', `✅ 默认管理员账号已创建: ${username}`);
};
