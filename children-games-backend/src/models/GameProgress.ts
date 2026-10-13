import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface GameProgressAttributes {
  id: number;
  userId: number;
  gameId: string;
  currentLevel: number;
  highScore: number;
  stars: number;
  levelStars: string;
  achievements: string;
  playCount: number;
  winCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface GameProgressCreationAttributes extends Optional<GameProgressAttributes, 'id' | 'currentLevel' | 'highScore' | 'stars' | 'levelStars' | 'achievements' | 'playCount' | 'winCount'> {}

export class GameProgress extends Model<GameProgressAttributes, GameProgressCreationAttributes> implements GameProgressAttributes {
  public id!: number;
  public userId!: number;
  public gameId!: string;
  public currentLevel!: number;
  public highScore!: number;
  public stars!: number;
  public levelStars!: string;
  public achievements!: string;
  public playCount!: number;
  public winCount!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

GameProgress.init(
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
    gameId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '游戏ID: memory/fruit/puzzle/balloon/tank',
    },
    currentLevel: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 1,
      comment: '当前关卡',
    },
    highScore: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: '最高分',
    },
    stars: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: '该游戏获得的星星总数（各关星级之和）',
    },
    levelStars: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '{}',
      comment: '每关最佳星级JSON对象，如 {"1":3,"2":2}',
    },
    playCount: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: '总游玩局数（含失败）',
    },
    winCount: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: '通关局数',
    },
    achievements: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '[]',
      comment: '成就JSON数组',
    },
  },
  {
    sequelize,
    tableName: 'game_progress',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['userId', 'gameId'],
      },
    ],
  }
);
