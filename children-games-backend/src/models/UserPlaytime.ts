import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

/** 每日游玩时长（客户端心跳上报，供后台看板统计） */
interface UserPlaytimeAttributes {
  id: number;
  userId: number;
  date: string;
  seconds: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserPlaytimeCreationAttributes extends Optional<UserPlaytimeAttributes, 'id' | 'seconds'> {}

export class UserPlaytime extends Model<UserPlaytimeAttributes, UserPlaytimeCreationAttributes> implements UserPlaytimeAttributes {
  public id!: number;
  public userId!: number;
  public date!: string;
  public seconds!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

UserPlaytime.init(
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
    seconds: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: '当日累计游玩秒数',
    },
  },
  {
    sequelize,
    tableName: 'user_playtime',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['userId', 'date'],
      },
    ],
  }
);
