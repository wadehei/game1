import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware, userOrAdminAuth, AuthRequest } from '../../middleware/auth';
import { config } from '../../config';
import * as tokenService from '../../services/tokenService';

// Mock dependencies
vi.mock('jsonwebtoken');
vi.mock('../../config', () => ({
  config: {
    jwt: { secret: 'test-secret' },
  },
}));
vi.mock('../../services/tokenService', () => ({
  isTokenBlacklisted: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedVerify = vi.mocked(jwt.verify) as any;

describe('authMiddleware', () => {
  let mockReq: AuthRequest;
  let mockRes: Response;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = {
      headers: {},
    } as AuthRequest;
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    mockNext = vi.fn() as NextFunction;
    vi.mocked(tokenService.isTokenBlacklisted).mockResolvedValue(false);
  });

  describe('when no token provided', () => {
    it('should return 401', async () => {
      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 401,
        message: '未提供认证令牌',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('when token is invalid', () => {
    it('should return 401 for malformed token', async () => {
      mockReq.headers.authorization = 'Bearer invalid-token';
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 401,
        message: '认证令牌无效或已过期',
      });
    });
  });

  describe('when token is expired', () => {
    it('should return 401', async () => {
      mockReq.headers.authorization = 'Bearer expired-token';
      vi.mocked(jwt.verify).mockImplementation(() => {
        const err = new Error('Token expired') as Error & { name: string };
        err.name = 'TokenExpiredError';
        throw err;
      });

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 401,
        message: '认证令牌无效或已过期',
      });
    });
  });

  describe('when valid access token provided', () => {
    it('should extract userId and call next', async () => {
      mockReq.headers.authorization = 'Bearer valid-token';
      mockedVerify.mockReturnValue({
        userId: 123,
        openid: 'test-openid',
        type: 'access',
        jti: 'token-jti',
        exp: Math.floor(Date.now() / 1000) + 900,
      } as Record<string, unknown>);

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.userId).toBe(123);
      expect(mockReq.openid).toBe('test-openid');
      expect(mockReq.tokenJti).toBe('token-jti');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle legacy token without type field', async () => {
      mockReq.headers.authorization = 'Bearer legacy-token';
      mockedVerify.mockReturnValue({
        userId: 456,
        openid: 'legacy-openid',
        // No type field - legacy token
      } as Record<string, unknown>);

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.userId).toBe(456);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('when refresh token provided', () => {
    it('should reject refresh token', async () => {
      mockReq.headers.authorization = 'Bearer refresh-token';
      mockedVerify.mockReturnValue({
        userId: 123,
        type: 'refresh', // Wrong type
      } as Record<string, unknown>);

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 401,
        message: '认证令牌无效或已过期',
      });
    });
  });

  describe('when token is blacklisted', () => {
    it('should return 401 for blacklisted token', async () => {
      mockReq.headers.authorization = 'Bearer blacklisted-token';
      mockedVerify.mockReturnValue({
        userId: 123,
        type: 'access',
        jti: 'blacklisted-jti',
        exp: Math.floor(Date.now() / 1000) + 900,
      } as Record<string, unknown>);
      vi.mocked(tokenService.isTokenBlacklisted).mockResolvedValue(true);

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 401,
        message: '认证令牌已被撤销',
      });
    });
  });

  describe('when token has no userId', () => {
    it('should return 401', async () => {
      mockReq.headers.authorization = 'Bearer no-userid-token';
      mockedVerify.mockReturnValue({
        openid: 'some-openid',
        type: 'access',
      } as Record<string, unknown>);

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 401,
        message: '认证令牌无效或已过期',
      });
    });
  });
});

describe('userOrAdminAuth', () => {
  let mockReq: AuthRequest & { admin?: boolean };
  let mockRes: Response;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = {
      headers: {},
    } as AuthRequest & { admin?: boolean };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    mockNext = vi.fn() as NextFunction;
    vi.mocked(tokenService.isTokenBlacklisted).mockResolvedValue(false);
  });

  describe('when no token provided', () => {
    it('should return 401', async () => {
      await userOrAdminAuth(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 401,
        message: '未提供认证令牌',
      });
    });
  });

  describe('when valid user token provided', () => {
    it('should set userId and call next', async () => {
      mockReq.headers.authorization = 'Bearer user-token';
      mockedVerify.mockReturnValue({
        userId: 123,
        openid: 'user-openid',
        type: 'access',
        jti: 'user-jti',
        exp: Math.floor(Date.now() / 1000) + 900,
      } as Record<string, unknown>);

      await userOrAdminAuth(mockReq, mockRes, mockNext);

      expect(mockReq.userId).toBe(123);
      expect(mockReq.openid).toBe('user-openid');
      expect(mockReq.admin).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('when valid admin token provided', () => {
    it('should set admin flag and call next', async () => {
      mockReq.headers.authorization = 'Bearer admin-token';
      mockedVerify.mockReturnValue({
        role: 'admin',
        adminId: 1,
        username: 'admin',
        type: 'access',
        jti: 'admin-jti',
        exp: Math.floor(Date.now() / 1000) + 900,
      } as Record<string, unknown>);

      await userOrAdminAuth(mockReq, mockRes, mockNext);

      expect(mockReq.admin).toBe(true);
      expect(mockReq.userId).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('when token has neither userId nor admin role', () => {
    it('should return 403', async () => {
      mockReq.headers.authorization = 'Bearer invalid-token';
      mockedVerify.mockReturnValue({
        someOtherField: 'value',
        type: 'access',
      } as Record<string, unknown>);

      await userOrAdminAuth(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 403,
        message: '凭证无效',
      });
    });
  });

  describe('when refresh token provided', () => {
    it('should reject refresh token', async () => {
      mockReq.headers.authorization = 'Bearer refresh-token';
      mockedVerify.mockReturnValue({
        userId: 123,
        type: 'refresh',
      } as Record<string, unknown>);

      await userOrAdminAuth(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });
  });

  describe('when token is blacklisted', () => {
    it('should return 401', async () => {
      mockReq.headers.authorization = 'Bearer blacklisted-token';
      mockedVerify.mockReturnValue({
        userId: 123,
        type: 'access',
        jti: 'blacklisted-jti',
        exp: Math.floor(Date.now() / 1000) + 900,
      } as Record<string, unknown>);
      vi.mocked(tokenService.isTokenBlacklisted).mockResolvedValue(true);

      await userOrAdminAuth(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 401,
        message: '认证令牌已被撤销',
      });
    });
  });
});
