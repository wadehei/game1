import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface UserAttributes {
  id: number;
  openid: string;
  nickname: string;
  avatar: string;
  totalStars: number;
  level: number;
  achievements: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'totalStars' | 'level' | 'achievements'> {}

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public id!: number;
  public openid!: string;
  public nickname!: string;
  public avatar!: string;
  public totalStars!: number;
  public level!: number;
  public achievements!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    openid: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      comment: '用户唯一标识',
    },
    nickname: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: '小朋友',
      comment: '昵称',
    },
    avatar: {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: '',
      comment: '头像URL',
    },
    totalStars: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: '总星星数',
    },
    level: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 1,
      comment: '玩家等级',
    },
    achievements: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '[]',
      comment: '已解锁成就ID JSON数组',
    },
  },
  {
    sequelize,
    tableName: 'users',
    timestamps: true,
  }
);
