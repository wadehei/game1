import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ─── Mocks ────────────────
vi.mock('../../../src/models', () => ({
  User: {
    findByPk: vi.fn(),
    findOrCreate: vi.fn(),
    findAll: vi.fn(),
  },
}));

vi.mock('../../../src/config', () => ({
  config: {
    nodeEnv: 'development',
    jwt: { secret: 'test-secret' },
  },
}));

vi.mock('../../../src/services/tokenService', () => ({
  generateTokenPair: vi.fn(),
}));

vi.mock('../../../src/services/pinService', () => ({
  isValidPin: vi.fn(),
  verifyPin: vi.fn(),
  checkThrottle: vi.fn(),
  recordFail: vi.fn(),
  clearFails: vi.fn(),
}));

vi.mock('../../../src/utils/auth', () => ({
  toUserInfo: vi.fn((u) => ({ id: u.id, nickname: u.nickname })),
}));

import {
  wxLogin,
  testLogin,
  familyLogin,
  getProfiles,
} from '../../../src/controllers/loginController';
import { User } from '../../../src/models';
import { generateTokenPair } from '../../../src/services/tokenService';
import {
  isValidPin,
  verifyPin,
  checkThrottle,
  recordFail,
  clearFails,
} from '../../../src/services/pinService';
import { config } from '../../../src/config';
import type { AppError } from '../../../src/errors/AppError';

const mockRes = (): Response =>
  ({
    statusCode: 200,
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  }) as unknown as Response;

const makeReq = (body: unknown): Request => ({ body }) as unknown as Request;

const run = async (
  fn: (req: Request, res: Response, next: NextFunction) => unknown,
  body: unknown
) => {
  const res = mockRes();
  const next: NextFunction = vi.fn();
  void fn(makeReq(body), res, next);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  return { res, next };
};

const statusCodeOf = (next: Mock): number => {
  const err = next.mock.calls[0]?.[0] as AppError | undefined;
  return err?.statusCode ?? 0;
};

describe('loginController.wxLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (config as any).nodeEnv = 'development';
  });

  it('非开发环境返回 400', async () => {
    (config as any).nodeEnv = 'production';
    const { next } = await run(wxLogin, { code: 'test' });
    expect(statusCodeOf(next)).toBe(400);
  });

  it('缺少 code 返回 400', async () => {
    const { next } = await run(wxLogin, {});
    expect(statusCodeOf(next)).toBe(400);
  });

  it('创建用户并返回 token', async () => {
    const mockUser = { id: 1, nickname: '小朋友', avatar: '', openid: 'mock_uuid' };
    (User.findOrCreate as Mock).mockResolvedValue([mockUser, true]);
    (generateTokenPair as Mock).mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 900,
    });

    const { res, next } = await run(wxLogin, { code: 'wx-code' });

    expect(next).not.toHaveBeenCalled();
    expect(generateTokenPair).toHaveBeenCalledWith(mockUser);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 200,
        data: expect.objectContaining({ accessToken: 'access' }),
      })
    );
  });
});

describe('loginController.testLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (config as any).nodeEnv = 'development';
  });

  it('非开发环境返回 403', async () => {
    (config as any).nodeEnv = 'production';
    const { next } = await run(testLogin, { nickname: 'test' });
    expect(statusCodeOf(next)).toBe(403);
  });

  it('创建测试用户并返回 token', async () => {
    const mockUser = { id: 2, nickname: '测试用户', avatar: '' };
    (User.findOrCreate as Mock).mockResolvedValue([mockUser, true]);
    (generateTokenPair as Mock).mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 900,
    });

    const { res, next } = await run(testLogin, { nickname: '测试用户' });

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });
});

describe('loginController.familyLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uid 不存在返回 404', async () => {
    (User.findByPk as Mock).mockResolvedValue(null);

    const { next } = await run(familyLogin, { uid: 999 });
    expect(statusCodeOf(next)).toBe(404);
  });

  it('有 PIN 时验证口令 - 被限流返回 429', async () => {
    const mockUser = { id: 1, pinHash: 'hash', nickname: 'test' };
    (User.findByPk as Mock).mockResolvedValue(mockUser);
    (checkThrottle as Mock).mockReturnValue(Date.now() + 60000);

    const { next } = await run(familyLogin, { uid: 1, pin: '1234' });
    expect(statusCodeOf(next)).toBe(429);
  });

  it('有 PIN 时验证口令 - 口令错误返回 401', async () => {
    const mockUser = { id: 1, pinHash: 'hash', nickname: 'test' };
    (User.findByPk as Mock).mockResolvedValue(mockUser);
    (checkThrottle as Mock).mockReturnValue(null);
    (isValidPin as Mock).mockReturnValue(true);
    (verifyPin as Mock).mockResolvedValue(false);

    const { next } = await run(familyLogin, { uid: 1, pin: '0000' });
    expect(statusCodeOf(next)).toBe(401);
    expect(recordFail).toHaveBeenCalledWith(1);
  });

  it('有 PIN 时验证口令 - 正确则清除失败计数并登录', async () => {
    const mockUser = { id: 1, pinHash: 'hash', nickname: 'test' };
    (User.findByPk as Mock).mockResolvedValue(mockUser);
    (checkThrottle as Mock).mockReturnValue(null);
    (isValidPin as Mock).mockReturnValue(true);
    (verifyPin as Mock).mockResolvedValue(true);
    (generateTokenPair as Mock).mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 900,
    });

    const { res, next } = await run(familyLogin, { uid: 1, pin: '1234' });

    expect(next).not.toHaveBeenCalled();
    expect(clearFails).toHaveBeenCalledWith(1);
    expect(generateTokenPair).toHaveBeenCalledWith(mockUser);
  });

  it('无 uid 时创建新角色 - 缺少昵称返回 400', async () => {
    const { next } = await run(familyLogin, { nickname: '' });
    expect(statusCodeOf(next)).toBe(400);
  });

  it('无 uid 时创建新角色', async () => {
    const mockUser = { id: 3, nickname: '新成员', avatar: '😊' };
    (User.findOrCreate as Mock).mockResolvedValue([mockUser, true]);
    (generateTokenPair as Mock).mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 900,
    });

    const { res, next } = await run(familyLogin, { nickname: '新成员' });

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });
});

describe('loginController.getProfiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('返回家庭成员列表', async () => {
    const mockUsers = [
      {
        id: 1,
        nickname: 'A',
        avatar: '😊',
        level: 1,
        totalStars: 10,
        pinHash: 'hash',
        createdAt: new Date(),
      },
      {
        id: 2,
        nickname: 'B',
        avatar: '🎉',
        level: 2,
        totalStars: 20,
        pinHash: null,
        createdAt: new Date(),
      },
    ];
    (User.findAll as Mock).mockResolvedValue(mockUsers);

    const { res, next } = await run(getProfiles, {});

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 200,
        data: expect.arrayContaining([
          expect.objectContaining({ id: 1, hasPin: true }),
          expect.objectContaining({ id: 2, hasPin: false }),
        ]),
      })
    );
  });
});
