import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('../../../src/config', () => ({
  config: {
    jwt: { secret: 'test_secret_key', expiresIn: '1h' },
  },
}));

import { adminMiddleware, AdminRequest } from '../../../src/middleware/adminAuth';

const mockResponse = () => {
  const res: any = {
    statusCode: 200,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
};

describe('adminMiddleware', () => {
  let req: Partial<AdminRequest>;
  let res: ReturnType<typeof mockResponse>;
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    req = { headers: {} };
    res = mockResponse();
    next = vi.fn();
  });

  it('should return 401 when no token is provided', () => {
    adminMiddleware(req as AdminRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      code: 401,
      message: '未提供管理员凭证',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for an empty authorization header', () => {
    req.headers = { authorization: '' };
    adminMiddleware(req as AdminRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for an invalid token', () => {
    req.headers = { authorization: 'Bearer not.a.real.token' };
    adminMiddleware(req as AdminRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      code: 401,
      message: '管理员凭证无效或已过期',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for an expired admin token', () => {
    const expired = jwt.sign({ role: 'admin' }, 'test_secret_key', { expiresIn: '-5s' });
    req.headers = { authorization: `Bearer ${expired}` };
    adminMiddleware(req as AdminRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 for a valid token without admin role', () => {
    const token = jwt.sign({ role: 'user' }, 'test_secret_key', { expiresIn: '1h' });
    req.headers = { authorization: `Bearer ${token}` };
    adminMiddleware(req as AdminRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      code: 403,
      message: '无管理员权限',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 for a token with no role claim', () => {
    const token = jwt.sign({ userId: 1 }, 'test_secret_key', { expiresIn: '1h' });
    req.headers = { authorization: `Bearer ${token}` };
    adminMiddleware(req as AdminRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should authenticate a valid admin token and call next', () => {
    const token = jwt.sign({ role: 'admin' }, 'test_secret_key', { expiresIn: '1h' });
    req.headers = { authorization: `Bearer ${token}` };
    adminMiddleware(req as AdminRequest, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.admin).toBe(true);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('should return 401 for a token signed with wrong secret', () => {
    const token = jwt.sign({ role: 'admin' }, 'wrong_secret', { expiresIn: '1h' });
    req.headers = { authorization: `Bearer ${token}` };
    adminMiddleware(req as AdminRequest, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
