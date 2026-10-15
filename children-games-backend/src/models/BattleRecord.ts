import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface BattleRecordAttributes {
  id: number;
  userId: number;
  gameType: string;
  /** win / lose / draw / rank:N（N=名次） */
  result: string;
  /** 本局积分变动（正赢负输） */
  chipsDelta: number;
  /** 结算后积分快照 */
  chipsAfter: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface BattleRecordCreationAttributes extends Optional<BattleRecordAttributes, 'id'> {}

export class BattleRecord extends Model<BattleRecordAttributes, BattleRecordCreationAttributes> implements BattleRecordAttributes {
  public id!: number;
  public userId!: number;
  public gameType!: string;
  public result!: string;
  public chipsDelta!: number;
  public chipsAfter!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

BattleRecord.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '玩家 ID',
    },
    gameType: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: '游戏类型（gomoku/quiz/draw/spy/uno/blackjack/zjh）',
    },
    result: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'draw',
      comment: '结果：win/lose/draw/rank:N',
    },
    chipsDelta: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '本局积分变动',
    },
    chipsAfter: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: '结算后积分',
    },
  },
  {
    sequelize,
    tableName: 'battle_records',
    timestamps: true,
    indexes: [{ fields: ['userId', 'createdAt'] }],
  }
);
