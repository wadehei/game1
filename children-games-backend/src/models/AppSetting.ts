import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

/** 全局应用设置（键值对），后台管理可修改 */
interface AppSettingAttributes {
  key: string;
  value: string;
  updatedAt?: Date;
}

interface AppSettingCreationAttributes extends Optional<AppSettingAttributes, 'value'> {}

export class AppSetting extends Model<AppSettingAttributes, AppSettingCreationAttributes> implements AppSettingAttributes {
  public key!: string;
  public value!: string;
  public readonly updatedAt!: Date;
}

AppSetting.init(
  {
    key: {
      type: DataTypes.STRING(50),
      primaryKey: true,
      comment: '设置键',
    },
    value: {
      type: DataTypes.STRING(200),
      allowNull: false,
      comment: '设置值',
    },
  },
  {
    sequelize,
    tableName: 'app_settings',
    timestamps: true,
    updatedAt: true,
    createdAt: false,
  }
);
