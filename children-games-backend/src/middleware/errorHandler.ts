import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';
import { logError } from '../utils/logger';

/**
 * 全局错误处理中间件
 * 统一处理所有错误，区分业务错误和系统错误
 */
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction): void => {
  // 记录详细错误日志（包含堆栈）
  logError(
    'server',
    `${req.method} ${req.originalUrl} → ${err.message}`,
    err.stack
  );

  // 处理自定义应用错误（业务错误）
  if (err instanceof AppError) {
    // 业务错误：返回明确的错误信息
    res.status(err.statusCode).json({
      code: err.statusCode,
      error: err.code,
      message: err.message,
    });
    return;
  }

  // 处理 Zod 验证错误
  if (err instanceof ZodError) {
    const errors = err.issues.map(issue => ({
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

  // 处理 Sequelize 数据库错误
  if (err.name === 'SequelizeValidationError') {
    res.status(400).json({
      code: 400,
      error: 'VALIDATION_ERROR',
      message: '数据验证失败',
    });
    return;
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    res.status(409).json({
      code: 409,
      error: 'CONFLICT',
      message: '数据已存在',
    });
    return;
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    res.status(400).json({
      code: 400,
      error: 'FOREIGN_KEY_ERROR',
      message: '关联数据不存在或正在被使用',
    });
    return;
  }

  // 处理 JWT 错误
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      code: 401,
      error: 'INVALID_TOKEN',
      message: '无效的令牌',
    });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      code: 401,
      error: 'TOKEN_EXPIRED',
      message: '令牌已过期，请重新登录',
    });
    return;
  }

  // 处理系统错误（不可预期的错误）
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  // 开发环境：返回详细错误信息
  if (process.env.NODE_ENV === 'development') {
    res.status(statusCode).json({
      code: statusCode,
      error: 'INTERNAL_ERROR',
      message: err.message || '服务器内部错误',
      stack: err.stack,
    });
  } else {
    // 生产环境：只返回通用错误信息，不泄露内部细节
    res.status(statusCode).json({
      code: statusCode,
      error: 'INTERNAL_ERROR',
      message: '服务器内部错误，请稍后再试',
    });
  }
};

/**
 * 404 处理中间件
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    code: 404,
    error: 'NOT_FOUND',
    message: `接口不存在: ${req.method} ${req.originalUrl}`,
  });
};
