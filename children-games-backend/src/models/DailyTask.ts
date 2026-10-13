import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface DailyTaskAttributes {
  id: number;
  userId: number;
  date: string;
  completedGames: number;
  taskReward: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface DailyTaskCreationAttributes extends Optional<DailyTaskAttributes, 'id' | 'completedGames' | 'taskReward'> {}

export class DailyTask extends Model<DailyTaskAttributes, DailyTaskCreationAttributes> implements DailyTaskAttributes {
  public id!: number;
  public userId!: number;
  public date!: string;
  public completedGames!: number;
  public taskReward!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

DailyTask.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '用户ID',
    },
    date: {
      type: DataTypes.STRING(10),
      allowNull: false,
      comment: '日期 YYYY-MM-DD',
    },
    completedGames: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: '已完成游戏数',
    },
    taskReward: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: '已领取奖励',
    },
  },
  {
    sequelize,
    tableName: 'daily_tasks',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['userId', 'date'],
      },
    ],
  }
);
