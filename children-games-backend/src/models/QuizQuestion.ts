import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface QuizQuestionAttributes {
  id: number;
  category: string;
  difficulty: number;
  text: string;
  options: string[]; // 四选一
  answer: number; // 正确下标 0~3
  createdAt?: Date;
  updatedAt?: Date;
}

interface QuizQuestionCreationAttributes extends Optional<QuizQuestionAttributes, 'id'> {}

export class QuizQuestion extends Model<QuizQuestionAttributes, QuizQuestionCreationAttributes> implements QuizQuestionAttributes {
  public id!: number;
  public category!: string;
  public difficulty!: number;
  public text!: string;
  public options!: string[];
  public answer!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

QuizQuestion.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    category: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: '综合',
      comment: '分类',
    },
    difficulty: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 1,
      comment: '难度 1~3',
    },
    text: {
      type: DataTypes.STRING(500),
      allowNull: false,
      comment: '题干',
    },
    options: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: '选项数组（4 个）',
    },
    answer: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      comment: '正确选项下标 0~3',
    },
  },
  {
    sequelize,
    tableName: 'quiz_questions',
    timestamps: true,
    indexes: [
      {
        fields: ['category'],
      },
    ],
  }
);
