/**
 * 自定义应用错误基类
 * 所有业务错误都应该继承此类
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR', isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;

    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 业务错误（可预期的错误）
 * 例如：参数错误、资源不存在、权限不足等
 */
export class BadRequestError extends AppError {
  constructor(message: string = '请求参数错误', code: string = 'BAD_REQUEST') {
    super(message, 400, code, true);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = '未授权，请先登录', code: string = 'UNAUTHORIZED') {
    super(message, 401, code, true);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = '没有权限执行此操作', code: string = 'FORBIDDEN') {
    super(message, 403, code, true);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = '资源不存在', code: string = 'NOT_FOUND') {
    super(message, 404, code, true);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = '资源冲突', code: string = 'CONFLICT') {
    super(message, 409, code, true);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message: string = '请求过于频繁，请稍后再试', code: string = 'TOO_MANY_REQUESTS') {
    super(message, 429, code, true);
  }
}

/**
 * 系统错误（不可预期的错误）
 * 例如：数据库连接失败、第三方服务错误等
 */
export class InternalError extends AppError {
  constructor(message: string = '服务器内部错误', code: string = 'INTERNAL_ERROR') {
    super(message, 500, code, false);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string = '数据库操作失败', code: string = 'DATABASE_ERROR') {
    super(message, 500, code, false);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = '服务暂时不可用，请稍后再试', code: string = 'SERVICE_UNAVAILABLE') {
    super(message, 503, code, false);
  }
}
