import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { adminMiddleware, AdminRequest } from '../../middleware/adminAuth';
import { config } from '../../config';

// Mock dependencies
vi.mock('jsonwebtoken');
vi.mock('../../config', () => ({
  config: {
    jwt: { secret: 'test-secret' },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedVerify = vi.mocked(jwt.verify) as any;

describe('adminMiddleware', () => {
  let mockReq: AdminRequest;
  let mockRes: Response;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = {
      headers: {},
    } as AdminRequest;
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    mockNext = vi.fn() as NextFunction;
  });

  describe('when no token provided', () => {
    it('should return 401', () => {
      adminMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 401,
        message: '未提供管理员凭证',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('when token is invalid', () => {
    it('should return 401 for malformed token', () => {
      mockReq.headers.authorization = 'Bearer invalid-token';
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      adminMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 401,
        message: '管理员凭证无效或已过期',
      });
    });
  });

  describe('when token is expired', () => {
    it('should return 401', () => {
      mockReq.headers.authorization = 'Bearer expired-token';
      vi.mocked(jwt.verify).mockImplementation(() => {
        const err = new Error('Token expired') as Error & { name: string };
        err.name = 'TokenExpiredError';
        throw err;
      });

      adminMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 401,
        message: '管理员凭证无效或已过期',
      });
    });
  });

  describe('when valid admin token provided', () => {
    it('should set admin fields and call next', () => {
      mockReq.headers.authorization = 'Bearer admin-token';
      mockedVerify.mockReturnValue({
        role: 'admin',
        adminId: 1,
        username: 'testadmin',
      } as Record<string, unknown>);

      adminMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.admin).toBe(true);
      expect(mockReq.adminId).toBe(1);
      expect(mockReq.adminUsername).toBe('testadmin');
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('when non-admin token provided', () => {
    it('should return 403', () => {
      mockReq.headers.authorization = 'Bearer user-token';
      mockedVerify.mockReturnValue({
        role: 'user',
        userId: 123,
      } as Record<string, unknown>);

      adminMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 403,
        message: '无管理员权限',
      });
    });
  });

  describe('when token has no role', () => {
    it('should return 403', () => {
      mockReq.headers.authorization = 'Bearer no-role-token';
      mockedVerify.mockReturnValue({
        userId: 123,
      } as Record<string, unknown>);

      adminMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 403,
        message: '无管理员权限',
      });
    });
  });

  describe('when 2fa_pending token provided', () => {
    it('should reject pending 2FA token', () => {
      mockReq.headers.authorization = 'Bearer pending-2fa-token';
      mockedVerify.mockReturnValue({
        role: 'admin',
        adminId: 1,
        purpose: '2fa_pending',
      } as Record<string, unknown>);

      adminMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 401,
        message: '请先完成 2FA 验证',
      });
    });
  });

  describe('when authorization header format is wrong', () => {
    it('should handle missing Bearer prefix', () => {
      mockReq.headers.authorization = 'token-without-bearer';
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      adminMiddleware(mockReq, mockRes, mockNext);

      // The entire string is used as token (since no 'Bearer ' to replace)
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should handle empty authorization header', () => {
      mockReq.headers.authorization = '';

      adminMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 401,
        message: '未提供管理员凭证',
      });
    });
  });
});
