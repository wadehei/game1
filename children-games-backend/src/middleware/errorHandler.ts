import { Request, Response, NextFunction } from 'express';
import { logError } from '../utils/logger';

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction): void => {
  logError(
    'server',
    `${req.method} ${req.originalUrl} → ${err.message}`,
    err.stack
  );

  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  res.status(statusCode).json({
    code: statusCode,
    message: err.message || '服务器内部错误',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    code: 404,
    message: '接口不存在',
  });
};
