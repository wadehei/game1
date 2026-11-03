import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface AdminAttributes {
  id: number;
  username: string;
  passwordHash: string;
  totpSecret: string | null;
  twoFactorEnabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface AdminCreationAttributes extends Optional<
  AdminAttributes,
  'id' | 'totpSecret' | 'twoFactorEnabled'
> {}

export class Admin
  extends Model<AdminAttributes, AdminCreationAttributes>
  implements AdminAttributes
{
  public id!: number;
  public username!: string;
  public passwordHash!: string;
  public totpSecret!: string | null;
  public twoFactorEnabled!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Admin.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: '管理员用户名',
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: '密码哈希（bcrypt）',
    },
    totpSecret: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
      comment: 'TOTP 密钥（2FA 用）',
    },
    twoFactorEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '是否启用双因素认证',
    },
  },
  {
    sequelize,
    tableName: 'admins',
    timestamps: true,
  }
);
