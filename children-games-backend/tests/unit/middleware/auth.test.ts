import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock config with known secret
vi.mock('../../../src/config', () => ({
  config: {
    jwt: { secret: 'test_secret_key', expiresIn: '1h' },
  },
}));

// Mock tokenService
vi.mock('../../../src/services/tokenService', () => ({
  isTokenBlacklisted: vi.fn().mockResolvedValue(false),
}));

import { authMiddleware, userOrAdminAuth, AuthRequest } from '../../../src/middleware/auth';
import { isTokenBlacklisted } from '../../../src/services/tokenService';

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

  it('should return 401 when no token is provided', async () => {
    await authMiddleware(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      code: 401,
      message: '未提供认证令牌',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when authorization header is empty', async () => {
    req.headers = { authorization: '' };
    await authMiddleware(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for an invalid token', async () => {
    req.headers = { authorization: 'Bearer invalid.token.here' };
    await authMiddleware(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      code: 401,
      message: '认证令牌无效或已过期',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for an expired token', async () => {
    const expiredToken = jwt.sign({ userId: 1, openid: 'test_openid' }, 'test_secret_key', {
      expiresIn: '-1s',
    });
    req.headers = { authorization: `Bearer ${expiredToken}` };
    await authMiddleware(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for a token signed with wrong secret', async () => {
    const wrongToken = jwt.sign({ userId: 1, openid: 'test_openid' }, 'wrong_secret', {
      expiresIn: '1h',
    });
    req.headers = { authorization: `Bearer ${wrongToken}` };
    await authMiddleware(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should authenticate with a valid token and call next', async () => {
    const validToken = jwt.sign({ userId: 42, openid: 'openid_123' }, 'test_secret_key', {
      expiresIn: '1h',
    });
    req.headers = { authorization: `Bearer ${validToken}` };
    await authMiddleware(req as AuthRequest, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe(42);
    expect(req.openid).toBe('openid_123');
  });

  it('should handle token without Bearer prefix', async () => {
    const validToken = jwt.sign({ userId: 1, openid: 'test' }, 'test_secret_key', {
      expiresIn: '1h',
    });
    req.headers = { authorization: validToken };
    await authMiddleware(req as AuthRequest, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('should return 401 for a malformed token', async () => {
    req.headers = { authorization: 'Bearer abc' };
    await authMiddleware(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should set userId and openid on req after successful auth', async () => {
    const token = jwt.sign({ userId: 99, openid: 'openid_abc' }, 'test_secret_key', {
      expiresIn: '1h',
    });
    req.headers = { authorization: `Bearer ${token}` };
    await authMiddleware(req as AuthRequest, res, next);
    expect(req.userId).toBe(99);
    expect(req.openid).toBe('openid_abc');
    expect(res.json).not.toHaveBeenCalled();
  });

  it('should return 401 for a blacklisted access token', async () => {
    (isTokenBlacklisted as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    const token = jwt.sign(
      { jti: 'blacklisted-jti', userId: 1, openid: 'test', type: 'access' },
      'test_secret_key',
      { expiresIn: '1h' }
    );
    req.headers = { authorization: `Bearer ${token}` };
    await authMiddleware(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      code: 401,
      message: '认证令牌已被撤销',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should set tokenJti on req for access tokens', async () => {
    const token = jwt.sign(
      { jti: 'my-jti', userId: 1, openid: 'test', type: 'access' },
      'test_secret_key',
      { expiresIn: '1h' }
    );
    req.headers = { authorization: `Bearer ${token}` };
    await authMiddleware(req as AuthRequest, res, next);
    expect(req.tokenJti).toBe('my-jti');
  });

  it('should return 401 when a refresh token is used as a Bearer credential', async () => {
    const refreshToken = jwt.sign(
      { jti: 'refresh-jti', userId: 1, type: 'refresh' },
      'test_secret_key',
      { expiresIn: '30d' }
    );
    req.headers = { authorization: `Bearer ${refreshToken}` };
    await authMiddleware(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      code: 401,
      message: '认证令牌无效或已过期',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for a token carrying an unknown type', async () => {
    const weirdToken = jwt.sign({ jti: 'x', userId: 1, type: 'service' }, 'test_secret_key', {
      expiresIn: '1h',
    });
    req.headers = { authorization: `Bearer ${weirdToken}` };
    await authMiddleware(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
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

  it('should return 401 when no token provided', async () => {
    await userOrAdminAuth(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should authenticate user token with userId', async () => {
    const token = jwt.sign({ userId: 10, openid: 'openid_user' }, 'test_secret_key', {
      expiresIn: '1h',
    });
    req.headers = { authorization: `Bearer ${token}` };
    await userOrAdminAuth(req as AuthRequest, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe(10);
    expect(req.openid).toBe('openid_user');
  });

  it('should authenticate admin token with role=admin', async () => {
    const token = jwt.sign({ role: 'admin' }, 'test_secret_key', { expiresIn: '1h' });
    req.headers = { authorization: `Bearer ${token}` };
    await userOrAdminAuth(req as AuthRequest, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect((req as any).admin).toBe(true);
  });

  it('should return 403 for token without userId or admin role', async () => {
    const token = jwt.sign({ role: 'user' }, 'test_secret_key', { expiresIn: '1h' });
    req.headers = { authorization: `Bearer ${token}` };
    await userOrAdminAuth(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      code: 403,
      message: '凭证无效',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for invalid token', async () => {
    req.headers = { authorization: 'Bearer bad.token' };
    await userOrAdminAuth(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for expired token', async () => {
    const expired = jwt.sign({ userId: 1, openid: 'test' }, 'test_secret_key', {
      expiresIn: '-10s',
    });
    req.headers = { authorization: `Bearer ${expired}` };
    await userOrAdminAuth(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for blacklisted access token', async () => {
    (isTokenBlacklisted as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    const token = jwt.sign(
      { jti: 'blacklisted-jti', userId: 1, openid: 'test', type: 'access' },
      'test_secret_key',
      { expiresIn: '1h' }
    );
    req.headers = { authorization: `Bearer ${token}` };
    await userOrAdminAuth(req as AuthRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      code: 401,
      message: '认证令牌已被撤销',
    });
  });
});
