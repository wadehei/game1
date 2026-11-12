import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface AuditLogAttributes {
  id: number;
  adminId: number;
  action: string;
  targetType: string | null;
  targetId: number | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt?: Date;
}

interface AuditLogCreationAttributes extends Optional<
  AuditLogAttributes,
  'id' | 'targetType' | 'targetId' | 'details' | 'ipAddress' | 'userAgent'
> {}

export class AuditLog
  extends Model<AuditLogAttributes, AuditLogCreationAttributes>
  implements AuditLogAttributes
{
  public id!: number;
  public adminId!: number;
  public action!: string;
  public targetType!: string | null;
  public targetId!: number | null;
  public details!: Record<string, unknown> | null;
  public ipAddress!: string | null;
  public userAgent!: string | null;
  public readonly createdAt!: Date;
}

AuditLog.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    adminId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '管理员ID（预留字段，当前系统无管理员表，可为空或默认值）',
    },
    action: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment:
        '审计动作: admin.login, user.update, user.delete, user.chips.adjust, level.config.update, question.create/update/delete, feedback.reply',
    },
    targetType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
      comment: '目标类型: user, level, question, feedback, settings',
    },
    targetId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: '目标ID',
    },
    details: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      comment: '操作详情（请求参数、变更内容等）',
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      defaultValue: null,
      comment: '客户端IP地址',
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      comment: '客户端User-Agent',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: '操作时间',
    },
  },
  {
    sequelize,
    tableName: 'audit_logs',
    timestamps: true,
    updatedAt: false, // 审计日志只有创建时间，不可更新
    indexes: [
      {
        fields: ['adminId'],
        name: 'idx_admin_id',
      },
      {
        fields: ['action'],
        name: 'idx_action',
      },
      {
        fields: ['createdAt'],
        name: 'idx_created_at',
      },
    ],
  }
);
