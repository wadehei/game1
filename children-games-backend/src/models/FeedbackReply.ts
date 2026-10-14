import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface FeedbackReplyAttributes {
  id: number;
  feedbackId: number;
  userId: number | null;
  isAdmin: boolean;
  content: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface FeedbackReplyCreationAttributes extends Optional<FeedbackReplyAttributes, 'id' | 'userId' | 'isAdmin'> {}

export class FeedbackReply extends Model<FeedbackReplyAttributes, FeedbackReplyCreationAttributes> implements FeedbackReplyAttributes {
  public id!: number;
  public feedbackId!: number;
  public userId!: number | null;
  public isAdmin!: boolean;
  public content!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

FeedbackReply.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    feedbackId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '所属反馈ID',
    },
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '回复人角色ID（官方回复为NULL；FK 约束要求非0值必须真实存在）',
    },
    isAdmin: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '是否官方回复（控制台发出，展示给所有用户）',
    },
    content: {
      type: DataTypes.STRING(500),
      allowNull: false,
      comment: '回复内容',
    },
  },
  {
    sequelize,
    tableName: 'feedback_replies',
    timestamps: true,
    indexes: [
      {
        fields: ['feedbackId'],
      },
    ],
  }
);
