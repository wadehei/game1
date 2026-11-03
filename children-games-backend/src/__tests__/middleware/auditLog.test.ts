import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { auditLog, auditLogin } from '../../middleware/auditLog';
import { recordAuditLog, extractAuditInfo } from '../../services/auditLogService';

// Mock auditLogService
vi.mock('../../services/auditLogService', () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
  extractAuditInfo: vi.fn().mockReturnValue({
    ipAddress: '127.0.0.1',
    userAgent: 'Test Agent',
  }),
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  logError: vi.fn(),
}));

describe('auditLog middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      get: vi.fn((header: string): string | undefined => {
        if (header === 'user-agent') return 'Test Agent';
        return undefined;
      }) as unknown as Request['get'],
      ip: '127.0.0.1',
      body: { test: 'data' },
      params: { id: '123' },
      query: { page: '1' },
    };

    mockRes = {
      json: vi.fn(),
    };

    mockNext = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应该调用 next() 继续处理请求', async () => {
    const middleware = auditLog('test.action');
    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('应该记录审计日志', async () => {
    const middleware = auditLog('user.update');
    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(recordAuditLog).toHaveBeenCalledWith({
      adminId: 0,
      action: 'user.update',
      targetType: undefined,
      targetId: undefined,
      details: {
        body: { test: 'data' },
        params: { id: '123' },
        query: { page: '1' },
      },
      ipAddress: '127.0.0.1',
      userAgent: 'Test Agent',
    });
  });

  it('应该支持自定义 extractTarget', async () => {
    const middleware = auditLog('user.update', {
      extractTarget: (req) => ({
        targetType: 'user',
        targetId: Number(req.params.id),
      }),
    });

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.update',
        targetType: 'user',
        targetId: 123,
      })
    );
  });

  it('应该支持自定义 extractDetails', async () => {
    const middleware = auditLog('settings.update', {
      extractDetails: (req) => ({
        customField: 'customValue',
      }),
    });

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        details: {
          customField: 'customValue',
        },
      })
    );
  });

  it('应该在错误时也调用 next()', async () => {
    vi.mocked(extractAuditInfo).mockImplementationOnce(() => {
      throw new Error('Test error');
    });

    const middleware = auditLog('test.action');
    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('应该识别管理员请求', async () => {
    const adminReq = {
      ...mockReq,
      admin: { id: 1, username: 'admin' },
    };

    const middleware = auditLog('user.delete');
    await middleware(adminReq as any, mockRes as Response, mockNext);

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 1,
      })
    );
  });
});

describe('auditLogin middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      get: vi.fn((header: string): string | undefined => {
        if (header === 'user-agent') return 'Test Agent';
        return undefined;
      }) as unknown as Request['get'],
      ip: '127.0.0.1',
      body: { username: 'admin' },
    };

    mockRes = {
      json: vi.fn((body) => body),
    };

    mockNext = vi.fn();
  });

  it('应该调用 next()', async () => {
    const middleware = auditLogin();
    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('应该在登录成功时记录审计日志', async () => {
    const middleware = auditLogin();
    await middleware(mockReq as Request, mockRes as Response, mockNext);

    // 模拟登录成功的响应
    const originalJson = mockRes.json as any;
    originalJson({ code: 200, token: 'xxx' });

    expect(recordAuditLog).toHaveBeenCalledWith({
      adminId: 0,
      action: 'admin.login',
      targetType: undefined,
      targetId: undefined,
      details: {
        username: 'admin',
        success: true,
      },
      ipAddress: '127.0.0.1',
      userAgent: 'Test Agent',
    });
  });
});
