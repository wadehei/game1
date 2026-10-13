import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface LevelConfigAttributes {
  id: number;
  gameId: string;
  level: number;
  config: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface LevelConfigCreationAttributes extends Optional<LevelConfigAttributes, 'id'> {}

export class LevelConfig extends Model<LevelConfigAttributes, LevelConfigCreationAttributes> implements LevelConfigAttributes {
  public id!: number;
  public gameId!: string;
  public level!: number;
  public config!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

LevelConfig.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    gameId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '游戏ID',
    },
    level: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '关卡编号',
    },
    config: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: '关卡配置JSON',
    },
  },
  {
    sequelize,
    tableName: 'level_configs',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['gameId', 'level'],
      },
    ],
  }
);
