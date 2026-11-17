import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

/** 轻量行为埋点（产品决策数据：游戏游玩/3D 模式切换/低帧回退等） */
export type GameEventType =
  | 'game_start'
  | 'game_end'
  | 'mode_switch'
  | 'parent_set_default'
  | 'fps_fallback'
  | 'battle_room_open';

interface GameEventAttributes {
  id: number;
  userId: number;
  type: GameEventType;
  gameId: string | null;
  mode: string | null; // '2d' | '3d'（3D 相关事件用）
  level: number | null;
  meta: string | null; // 附加聚合信息 JSON（如 fps 值、stars）
  createdAt?: Date;
  updatedAt?: Date;
}

interface GameEventCreationAttributes extends Optional<
  GameEventAttributes,
  'id' | 'gameId' | 'mode' | 'level' | 'meta'
> {}

export class GameEvent
  extends Model<GameEventAttributes, GameEventCreationAttributes>
  implements GameEventAttributes
{
  public id!: number;
  public userId!: number;
  public type!: GameEventType;
  public gameId!: string | null;
  public mode!: string | null;
  public level!: number | null;
  public meta!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

GameEvent.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    gameId: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    mode: {
      type: DataTypes.STRING(8),
      allowNull: true,
    },
    level: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    meta: {
      type: DataTypes.TEXT,
      allowNull: true, // JSON 字符串
    },
  },
  {
    sequelize,
    modelName: 'GameEvent',
    tableName: 'game_events',
    indexes: [{ fields: ['type'] }, { fields: ['gameId'] }, { fields: ['createdAt'] }],
  }
);
