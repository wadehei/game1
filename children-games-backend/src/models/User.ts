import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface UserAttributes {
  id: number;
  openid: string;
  nickname: string;
  avatar: string;
  avatarHistory: string[];
  totalStars: number;
  level: number;
  achievements: string;
  /** 4 位数字口令的哈希（sha256(pin:secret)），空=无口令 */
  pinHash: string | null;
  /** 好友对战积分（账号资产，初始 1000，随账号永久跟随） */
  battleChips: number;
  /** 最近一次积分救济的日期（YYYY-M-D），同日只救济一次 */
  chipsReliefDate: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'totalStars' | 'level' | 'achievements' | 'pinHash' | 'avatarHistory' | 'battleChips' | 'chipsReliefDate'> {}

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public id!: number;
  public openid!: string;
  public nickname!: string;
  public avatar!: string;
  public avatarHistory!: string[];
  public totalStars!: number;
  public level!: number;
  public achievements!: string;
  public pinHash!: string | null;
  public battleChips!: number;
  public chipsReliefDate!: string | null;
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
    avatarHistory: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      comment: '历史头像（emoji/照片URL），最多 12 个',
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
    pinHash: {
      type: DataTypes.STRING(128),
      allowNull: true,
      defaultValue: null,
      comment: '4位数字口令哈希，NULL=未设置',
    },
    battleChips: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 1000,
      comment: '好友对战积分（初始1000，随账号永久跟随）',
    },
    chipsReliefDate: {
      type: DataTypes.STRING(10),
      allowNull: true,
      defaultValue: null,
      comment: '最近积分救济日期（每日一次）',
    },
  },
  {
    sequelize,
    tableName: 'users',
    timestamps: true,
  }
);
