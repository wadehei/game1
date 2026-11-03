import { describe, it, expect, vi, beforeEach } from 'vitest';
import { errorHandler, notFoundHandler } from '../../../src/middleware/errorHandler';
import { AppError } from '../../../src/errors/AppError';
import { ZodError, z } from 'zod';

vi.mock('../../../src/utils/logger', () => ({
  logError: vi.fn(),
}));

const mockRequest = () => {
  const req: any = {
    method: 'GET',
    originalUrl: '/api/test',
  };
  return req;
};

const mockResponse = () => {
  const res: any = {
    statusCode: 200,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
};

const mockNext = vi.fn();

describe('errorHandler', () => {
  let req: ReturnType<typeof mockRequest>;
  let res: ReturnType<typeof mockResponse>;
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    req = mockRequest();
    res = mockResponse();
    next = vi.fn();
  });

  it('should handle AppError with correct status code', () => {
    const err = new AppError('资源不存在', 404, 'NOT_FOUND');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      code: 404,
      error: 'NOT_FOUND',
      message: '资源不存在',
    });
  });

  it('should handle ZodError with 400 status', () => {
    const schema = z.object({ name: z.string() });
    let zodErr: ZodError | undefined;
    try {
      schema.parse({ name: 123 });
    } catch (e) {
      zodErr = e as ZodError;
    }
    errorHandler(zodErr!, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe(400);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.details).toBeDefined();
    expect(body.details.length).toBeGreaterThan(0);
    expect(body.details[0].field).toBe('name');
  });

  it('should handle SequelizeValidationError', () => {
    const err = new Error('validation failed');
    err.name = 'SequelizeValidationError';
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      code: 400,
      error: 'VALIDATION_ERROR',
      message: '数据验证失败',
    });
  });

  it('should handle SequelizeUniqueConstraintError with 409', () => {
    const err = new Error('unique constraint');
    err.name = 'SequelizeUniqueConstraintError';
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      code: 409,
      error: 'CONFLICT',
      message: '数据已存在',
    });
  });

  it('should handle SequelizeForeignKeyConstraintError', () => {
    const err = new Error('fk constraint');
    err.name = 'SequelizeForeignKeyConstraintError';
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      code: 400,
      error: 'FOREIGN_KEY_ERROR',
      message: '关联数据不存在或正在被使用',
    });
  });

  it('should handle JsonWebTokenError', () => {
    const err = new Error('invalid token');
    err.name = 'JsonWebTokenError';
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      code: 401,
      error: 'INVALID_TOKEN',
      message: '无效的令牌',
    });
  });

  it('should handle TokenExpiredError', () => {
    const err = new Error('token expired');
    err.name = 'TokenExpiredError';
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      code: 401,
      error: 'TOKEN_EXPIRED',
      message: '令牌已过期，请重新登录',
    });
  });

  it('should return 500 for unknown errors in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const err = new Error('something broke');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('INTERNAL_ERROR');
    expect(body.message).toBe('服务器内部错误，请稍后再试');
    expect(body.stack).toBeUndefined();
    process.env.NODE_ENV = originalEnv;
  });

  it('should return stack trace for unknown errors in development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const err = new Error('dev error');
    errorHandler(err, req, res, next);
    const body = res.json.mock.calls[0][0];
    expect(body.stack).toBeDefined();
    expect(body.message).toBe('dev error');
    process.env.NODE_ENV = originalEnv;
  });
});

describe('notFoundHandler', () => {
  it('should return 404 with method and path', () => {
    const req = { method: 'POST', originalUrl: '/api/missing' } as any;
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    notFoundHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      code: 404,
      error: 'NOT_FOUND',
      message: '接口不存在: POST /api/missing',
    });
  });
});
