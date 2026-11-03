import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock config with known secret
vi.mock('../../../src/config', () => ({
  config: {
    jwt: { secret: 'test_secret_key', expiresIn: '1h' },
  },
}));

import { authMiddleware, userOrAdminAuth, AuthRequest } from '../../../src/middleware/auth';

const mockResponse = () => {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
};

describe('authMiddleware', () => {
  let req: Partial<AuthRequest>;
  let res: ReturnType<typeof mockResponse>;
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    req = { headers: {} };
    res = mockResponse();
    next = vi.fn();
  });

  it('should return 401 when no token is provided', () => {
    authMiddleware(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      code: 401,
      message: '未提供认证令牌',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when authorization header is empty', () => {
    req.headers = { authorization: '' };
    authMiddleware(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for an invalid token', () => {
    req.headers = { authorization: 'Bearer invalid.token.here' };
    authMiddleware(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      code: 401,
      message: '认证令牌无效或已过期',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for an expired token', () => {
    const expiredToken = jwt.sign({ userId: 1, openid: 'test_openid' }, 'test_secret_key', {
      expiresIn: '-1s',
    });
    req.headers = { authorization: `Bearer ${expiredToken}` };
    authMiddleware(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for a token signed with wrong secret', () => {
    const wrongToken = jwt.sign({ userId: 1, openid: 'test_openid' }, 'wrong_secret', {
      expiresIn: '1h',
    });
    req.headers = { authorization: `Bearer ${wrongToken}` };
    authMiddleware(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should authenticate with a valid token and call next', () => {
    const validToken = jwt.sign({ userId: 42, openid: 'openid_123' }, 'test_secret_key', {
      expiresIn: '1h',
    });
    req.headers = { authorization: `Bearer ${validToken}` };
    authMiddleware(req as AuthRequest, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe(42);
    expect(req.openid).toBe('openid_123');
  });

  it('should handle token without Bearer prefix', () => {
    const validToken = jwt.sign({ userId: 1, openid: 'test' }, 'test_secret_key', {
      expiresIn: '1h',
    });
    req.headers = { authorization: validToken };
    authMiddleware(req as AuthRequest, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('should return 401 for a malformed token', () => {
    req.headers = { authorization: 'Bearer abc' };
    authMiddleware(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should set userId and openid on req after successful auth', () => {
    const token = jwt.sign({ userId: 99, openid: 'openid_abc' }, 'test_secret_key', {
      expiresIn: '1h',
    });
    req.headers = { authorization: `Bearer ${token}` };
    authMiddleware(req as AuthRequest, res, next);
    expect(req.userId).toBe(99);
    expect(req.openid).toBe('openid_abc');
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('userOrAdminAuth', () => {
  let req: Partial<AuthRequest>;
  let res: ReturnType<typeof mockResponse>;
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    req = { headers: {} };
    res = mockResponse();
    next = vi.fn();
  });

  it('should return 401 when no token provided', () => {
    userOrAdminAuth(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should authenticate user token with userId', () => {
    const token = jwt.sign({ userId: 10, openid: 'openid_user' }, 'test_secret_key', {
      expiresIn: '1h',
    });
    req.headers = { authorization: `Bearer ${token}` };
    userOrAdminAuth(req as AuthRequest, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe(10);
    expect(req.openid).toBe('openid_user');
  });

  it('should authenticate admin token with role=admin', () => {
    const token = jwt.sign({ role: 'admin' }, 'test_secret_key', { expiresIn: '1h' });
    req.headers = { authorization: `Bearer ${token}` };
    userOrAdminAuth(req as AuthRequest, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect((req as any).admin).toBe(true);
  });

  it('should return 403 for token without userId or admin role', () => {
    const token = jwt.sign({ role: 'user' }, 'test_secret_key', { expiresIn: '1h' });
    req.headers = { authorization: `Bearer ${token}` };
    userOrAdminAuth(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      code: 403,
      message: '凭证无效',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for invalid token', () => {
    req.headers = { authorization: 'Bearer bad.token' };
    userOrAdminAuth(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for expired token', () => {
    const expired = jwt.sign({ userId: 1, openid: 'test' }, 'test_secret_key', {
      expiresIn: '-10s',
    });
    req.headers = { authorization: `Bearer ${expired}` };
    userOrAdminAuth(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
