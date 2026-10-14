import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface FeedbackAttributes {
  id: number;
  userId: number;
  type: string;
  content: string;
  page: string;
  status: string;
  adminNote: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface FeedbackCreationAttributes extends Optional<FeedbackAttributes, 'id' | 'page' | 'status' | 'adminNote'> {}

export class Feedback extends Model<FeedbackAttributes, FeedbackCreationAttributes> implements FeedbackAttributes {
  public id!: number;
  public userId!: number;
  public type!: string;
  public content!: string;
  public page!: string;
  public status!: string;
  public adminNote!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Feedback.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '提交反馈的角色ID',
    },
    type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: '类型 suggestion/bug/experience/other',
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: '反馈内容',
    },
    page: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: '',
      comment: '提交时所在页面',
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
      comment: '状态 pending/processing/done',
    },
    adminNote: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
      comment: '管理员备注（不展示给用户）',
    },
  },
  {
    sequelize,
    tableName: 'feedbacks',
    timestamps: true,
    indexes: [
      {
        fields: ['userId'],
      },
      {
        fields: ['status'],
      },
    ],
  }
);
