import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * 验证中间件工厂
 * @param schema Zod schema 定义
 * @param source 数据来源：'body' | 'query' | 'params'
 */
export const validate = (schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req[source];
      const validated = schema.parse(data);

      // 用验证后的数据替换原数据（去除未定义字段）
      req[source] = validated;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // 格式化错误信息
        const errors = error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));

        res.status(400).json({
          code: 400,
          error: 'VALIDATION_ERROR',
          message: '输入验证失败',
          details: errors,
        });
        return;
      }

      next(error);
    }
  };
};

/**
 * 验证请求体
 */
export const validateBody = (schema: ZodSchema) => validate(schema, 'body');

/**
 * 验证查询参数
 */
export const validateQuery = (schema: ZodSchema) => validate(schema, 'query');

/**
 * 验证路由参数
 */
export const validateParams = (schema: ZodSchema) => validate(schema, 'params');
