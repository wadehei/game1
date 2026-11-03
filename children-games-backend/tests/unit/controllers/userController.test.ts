import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Request, Response } from 'express';

// ─── Mocks (placed before any import of the controller) ────────────────
vi.mock('../../../src/config/database', () => ({
  sequelize: {
    transaction: vi.fn(),
    define: vi.fn(),
    query: vi.fn(),
    fn: vi.fn(),
    col: vi.fn(),
    getQueryInterface: vi.fn(() => ({
      describeTable: vi.fn(),
      showIndex: vi.fn(),
      addColumn: vi.fn(),
    })),
  },
}));

vi.mock('../../../src/models', () => ({
  User: {
    findOrCreate: vi.fn(),
    findByPk: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    sum: vi.fn(),
    update: vi.fn(),
  },
  UserPlaytime: {
    findAll: vi.fn(),
    findOrCreate: vi.fn(),
  },
  GameProgress: {
    findAll: vi.fn(),
    findOne: vi.fn(),
    findOrCreate: vi.fn(),
  },
  DailyTask: {
    findAll: vi.fn(),
  },
}));

vi.mock('../../../src/services/battleChips', () => ({
  getCareer: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../src/utils/safeJson', async () => {
  const actual = await vi.importActual('../../../src/utils/safeJson');
  return actual;
});

vi.mock('../../../src/utils/auth', () => ({
  generateAccessToken: vi
    .fn()
    .mockReturnValue({ token: 'mock-access-token', jti: 'mock-access-jti' }),
  generateRefreshToken: vi
    .fn()
    .mockReturnValue({ token: 'mock-refresh-token', jti: 'mock-refresh-jti' }),
  toUserInfo: vi.fn((u) => ({
    id: u.id,
    nickname: u.nickname,
    avatar: u.avatar,
    level: u.level,
    totalStars: u.totalStars,
  })),
}));

vi.mock('../../../src/services/tokenService', () => ({
  generateTokenPair: vi.fn().mockResolvedValue({
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresIn: 900,
  }),
  isTokenBlacklisted: vi.fn().mockResolvedValue(false),
  blacklistToken: vi.fn().mockResolvedValue(true),
  storeRefreshToken: vi.fn().mockResolvedValue(true),
  validateRefreshToken: vi.fn().mockResolvedValue(null),
  revokeRefreshToken: vi.fn().mockResolvedValue(true),
  revokeAllRefreshTokens: vi.fn().mockResolvedValue(0),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/config', () => ({
  config: { nodeEnv: 'development', jwt: { secret: 'test-secret' } },
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-pin'),
    compare: vi.fn(),
  },
  hash: vi.fn().mockResolvedValue('hashed-pin'),
  compare: vi.fn(),
}));

// Mock pinService (shared between loginController and pinController)
vi.mock('../../../src/services/pinService', async () => {
  const actual = await vi.importActual('../../../src/services/pinService');
  return actual;
});

import {
  wxLogin,
  testLogin,
  familyLogin,
  getProfiles,
} from '../../../src/controllers/loginController';
import { updateMyPin } from '../../../src/controllers/pinController';
import { getMyCareer, reportPlaytime } from '../../../src/controllers/careerController';
import { getUserInfo, updateUserInfo } from '../../../src/controllers/userController';
import { User, UserPlaytime, GameProgress, DailyTask } from '../../../src/models';
import bcrypt from 'bcrypt';

const mockUser = (overrides: Record<string, any> = {}) => ({
  id: 1,
  openid: 'family_test',
  nickname: '小朋友',
  avatar: '😊',
  level: 1,
  totalStars: 10,
  pinHash: null,
  achievements: '[]',
  avatarHistory: [],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
  save: vi.fn().mockResolvedValue(true),
  ...overrides,
});

const mockReq = (overrides: Record<string, any> = {}): Request =>
  ({
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides,
  }) as unknown as Request;

const mockRes = (): Response & { statusCode: number; jsonBody: any } => {
  const res: any = {
    statusCode: 200,
    jsonBody: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: any) {
      res.jsonBody = body;
      return res;
    },
  };
  return res as any;
};

const mockNext = vi.fn();

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('userController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // reset PIN attempts state via module reload is not needed; tests use distinct userIds
  });

  // ─── wxLogin ────────────────────────────────────────────────
  describe('wxLogin', () => {
    it('should reject wxLogin in production', async () => {
      const { config } = await import('../../../src/config');
      (config as any).nodeEnv = 'production';
      const req = mockReq({ body: { code: 'abc' } });
      const res = mockRes();
      await wxLogin(req, res, mockNext);
      await flushPromises();
      expect(mockNext).toHaveBeenCalled();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
      (config as any).nodeEnv = 'development';
    });

    it('should reject when code is missing in dev', async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();
      await wxLogin(req, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('should create user and return token in dev', async () => {
      const fakeUser = mockUser({ id: 10, openid: 'mock_xxx' });
      (User.findOrCreate as Mock).mockResolvedValue([fakeUser, true]);
      const req = mockReq({ body: { code: 'valid-code' } });
      const res = mockRes();
      await wxLogin(req, res, mockNext);
      await flushPromises();
      expect(User.findOrCreate).toHaveBeenCalled();
      expect(res.jsonBody).toMatchObject({
        code: 200,
        data: {
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
        },
      });
    });
  });

  // ─── testLogin ────────────────────────────────────────────────
  describe('testLogin', () => {
    it('should reject in production', async () => {
      const { config } = await import('../../../src/config');
      (config as any).nodeEnv = 'production';
      const req = mockReq({ body: { nickname: 't' } });
      const res = mockRes();
      await testLogin(req, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(403);
      (config as any).nodeEnv = 'development';
    });

    it('should create test user in dev', async () => {
      const fakeUser = mockUser({ id: 20 });
      (User.findOrCreate as Mock).mockResolvedValue([fakeUser, true]);
      const req = mockReq({ body: { nickname: 'Test' } });
      const res = mockRes();
      await testLogin(req, res, mockNext);
      await flushPromises();
      expect(res.jsonBody?.code).toBe(200);
      expect(res.jsonBody?.data.accessToken).toBe('mock-access-token');
      expect(res.jsonBody?.data.refreshToken).toBe('mock-refresh-token');
    });
  });

  // ─── familyLogin ────────────────────────────────────────────────
  describe('familyLogin', () => {
    it('should login existing user by uid', async () => {
      const fakeUser = mockUser({ id: 5, nickname: 'Kid' });
      (User.findByPk as Mock).mockResolvedValue(fakeUser);
      const req = mockReq({ body: { uid: '5' } });
      const res = mockRes();
      await familyLogin(req, res, mockNext);
      await flushPromises();
      expect(User.findByPk).toHaveBeenCalledWith(5);
      expect(res.jsonBody.data.accessToken).toBe('mock-access-token');
      expect(res.jsonBody.data.refreshToken).toBe('mock-refresh-token');
    });

    it('should return NotFoundError when uid does not exist', async () => {
      (User.findByPk as Mock).mockResolvedValue(null);
      const req = mockReq({ body: { uid: '999' } });
      const res = mockRes();
      await familyLogin(req, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(404);
    });

    it('should create new user when nickname provided', async () => {
      const fakeUser = mockUser({ id: 7, nickname: 'KidB' });
      (User.findOrCreate as Mock).mockResolvedValue([fakeUser, true]);
      const req = mockReq({ body: { nickname: 'KidB', avatar: '🐶' } });
      const res = mockRes();
      await familyLogin(req, res, mockNext);
      await flushPromises();
      expect(User.findOrCreate).toHaveBeenCalled();
      expect(res.jsonBody.data.userInfo.id).toBe(7);
    });

    it('should reject when neither uid nor nickname provided', async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();
      await familyLogin(req, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('should require PIN when user has pinHash set', async () => {
      (bcrypt.compare as unknown as Mock).mockResolvedValue(false);
      const fakeUser = mockUser({ id: 100, pinHash: 'hashed' });
      (User.findByPk as Mock).mockResolvedValue(fakeUser);
      const req = mockReq({ body: { uid: '100', pin: '0000' } });
      const res = mockRes();
      await familyLogin(req, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(401);
    });

    it('should login successfully with correct PIN', async () => {
      (bcrypt.compare as unknown as Mock).mockResolvedValue(true);
      const fakeUser = mockUser({ id: 101, pinHash: 'hashed' });
      (User.findByPk as Mock).mockResolvedValue(fakeUser);
      const req = mockReq({ body: { uid: '101', pin: '1234' } });
      const res = mockRes();
      await familyLogin(req, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data.accessToken).toBe('mock-access-token');
    });

    it('should reject invalid PIN format (non 4-digit)', async () => {
      const fakeUser = mockUser({ id: 102, pinHash: 'hashed' });
      (User.findByPk as Mock).mockResolvedValue(fakeUser);
      const req = mockReq({ body: { uid: '102', pin: 'abc' } });
      const res = mockRes();
      await familyLogin(req, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(401);
    });
  });

  // ─── PIN brute-force protection ────────────────────────────────
  describe('PIN brute-force protection', () => {
    it('should lock after 5 failed attempts for 60s', async () => {
      (bcrypt.compare as unknown as Mock).mockResolvedValue(false);
      const fakeUser = mockUser({ id: 200, pinHash: 'hashed' });
      (User.findByPk as Mock).mockResolvedValue(fakeUser);

      for (let i = 0; i < 5; i++) {
        const req = mockReq({ body: { uid: '200', pin: '0000' } });
        const res = mockRes();
        await familyLogin(req, res, mockNext);
        await flushPromises();
      }

      // 6th attempt should be throttled
      const req = mockReq({ body: { uid: '200', pin: '0000' } });
      const res = mockRes();
      await familyLogin(req, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[mockNext.mock.calls.length - 1][0];
      expect(err.statusCode).toBe(429);
    });
  });

  // ─── getProfiles ────────────────────────────────────────────────
  describe('getProfiles', () => {
    it('should return list of family profiles', async () => {
      (User.findAll as Mock).mockResolvedValue([
        mockUser({ id: 1, totalStars: 10 }),
        mockUser({ id: 2, totalStars: 5 }),
      ]);
      const req = mockReq();
      const res = mockRes();
      await getProfiles(req, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data).toHaveLength(2);
      expect(res.jsonBody.data[0].hasPin).toBe(false);
    });
  });

  // ─── updateMyPin ────────────────────────────────────────────────
  describe('updateMyPin', () => {
    it('should set new PIN when no existing PIN', async () => {
      const fakeUser = mockUser({ id: 300, pinHash: null });
      (User.findByPk as Mock).mockResolvedValue(fakeUser);
      const req = mockReq({ body: { newPin: '1234' }, userId: 300 });
      const res = mockRes();
      await updateMyPin(req as any, res, mockNext);
      await flushPromises();
      expect(fakeUser.pinHash).toBe('hashed-pin');
      expect(fakeUser.save).toHaveBeenCalled();
      expect(res.jsonBody.data.hasPin).toBe(true);
    });

    it('should reject invalid new PIN format', async () => {
      const fakeUser = mockUser({ id: 301, pinHash: null });
      (User.findByPk as Mock).mockResolvedValue(fakeUser);
      const req = mockReq({ body: { newPin: 'abcd' }, userId: 301 });
      const res = mockRes();
      await updateMyPin(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('should clear PIN when newPin is empty', async () => {
      // 已有 PIN 的用户需要先验证旧 PIN 才能清除
      (bcrypt.compare as unknown as Mock).mockResolvedValue(true);
      const fakeUser = mockUser({ id: 302, pinHash: 'existing-hash' });
      (User.findByPk as Mock).mockResolvedValue(fakeUser);
      // oldPin 需符合 4 位数字格式才能通过 isValidPin 校验
      const req = mockReq({ body: { oldPin: '1234', newPin: '' }, userId: 302 });
      const res = mockRes();
      await updateMyPin(req as any, res, mockNext);
      await flushPromises();
      expect(fakeUser.pinHash).toBeNull();
      expect(res.jsonBody.data.hasPin).toBe(false);
    });

    it('should require correct oldPin when changing existing PIN', async () => {
      (bcrypt.compare as unknown as Mock).mockResolvedValue(false);
      const fakeUser = mockUser({ id: 303, pinHash: 'existing-hash' });
      (User.findByPk as Mock).mockResolvedValue(fakeUser);
      const req = mockReq({ body: { oldPin: '0000', newPin: '5678' }, userId: 303 });
      const res = mockRes();
      await updateMyPin(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(401);
    });

    it('should throw NotFoundError when user does not exist', async () => {
      (User.findByPk as Mock).mockResolvedValue(null);
      const req = mockReq({ body: { newPin: '1234' }, userId: 999 });
      const res = mockRes();
      await updateMyPin(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(404);
    });
  });

  // ─── getMyCareer ────────────────────────────────────────────────
  describe('getMyCareer', () => {
    it('should return career summary with correct totals', async () => {
      const fakeUser = mockUser({ id: 400, achievements: '["first_win"]' });
      (User.findByPk as Mock).mockResolvedValue(fakeUser);
      (GameProgress.findAll as Mock).mockResolvedValue([
        {
          gameId: 'memory',
          playCount: 5,
          winCount: 3,
          currentLevel: 2,
          stars: 4,
          highScore: 100,
          updatedAt: new Date(),
        },
        {
          gameId: 'puzzle',
          playCount: 2,
          winCount: 1,
          currentLevel: 1,
          stars: 2,
          highScore: 50,
          updatedAt: new Date(),
        },
      ]);
      (UserPlaytime.findAll as Mock).mockResolvedValue([
        { date: '2024-01-01', seconds: 600 },
        { date: '2024-01-02', seconds: 300 },
      ]);
      (DailyTask.findAll as Mock).mockResolvedValue([{ taskReward: 10 }, { taskReward: 10 }]);

      const req = mockReq({ userId: 400 });
      const res = mockRes();
      await getMyCareer(req as any, res, mockNext);
      await flushPromises();

      expect(res.jsonBody.data.totals.playCount).toBe(7);
      expect(res.jsonBody.data.totals.winCount).toBe(4);
      expect(res.jsonBody.data.totals.playSeconds).toBe(900);
      expect(res.jsonBody.data.totals.rewardStars).toBe(20);
      expect(res.jsonBody.data.totals.achievementCount).toBe(1);
      expect(res.jsonBody.data.games).toHaveLength(2);
    });

    it('should throw NotFoundError when user missing', async () => {
      (User.findByPk as Mock).mockResolvedValue(null);
      const req = mockReq({ userId: 999 });
      const res = mockRes();
      await getMyCareer(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(404);
    });

    it('should produce last7 chart with 7 entries', async () => {
      (User.findByPk as Mock).mockResolvedValue(mockUser({ id: 401 }));
      (GameProgress.findAll as Mock).mockResolvedValue([]);
      (UserPlaytime.findAll as Mock).mockResolvedValue([]);
      (DailyTask.findAll as Mock).mockResolvedValue([]);

      const req = mockReq({ userId: 401 });
      const res = mockRes();
      await getMyCareer(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data.last7).toHaveLength(7);
    });
  });

  // ─── reportPlaytime ────────────────────────────────────────────────
  describe('reportPlaytime', () => {
    it('should create new playtime record', async () => {
      const row = { seconds: 0, save: vi.fn().mockResolvedValue(true) };
      (UserPlaytime.findOrCreate as Mock).mockResolvedValue([row, true]);
      const req = mockReq({ body: { seconds: 60 }, userId: 500 });
      const res = mockRes();
      await reportPlaytime(req as any, res, mockNext);
      await flushPromises();
      expect(row.save).toHaveBeenCalled();
      expect(res.jsonBody.data.ok).toBe(true);
    });

    it('should clamp seconds to MAX_PLAYTIME_SECONDS', async () => {
      const row = { seconds: 0, save: vi.fn().mockResolvedValue(true) };
      (UserPlaytime.findOrCreate as Mock).mockResolvedValue([row, true]);
      const req = mockReq({ body: { seconds: 9999 }, userId: 501 });
      const res = mockRes();
      await reportPlaytime(req as any, res, mockNext);
      await flushPromises();
      // seconds should be clamped to 180
      expect(row.seconds).toBeLessThanOrEqual(180);
    });

    it('should return early when seconds is 0', async () => {
      const req = mockReq({ body: { seconds: 0 }, userId: 502 });
      const res = mockRes();
      await reportPlaytime(req as any, res, mockNext);
      await flushPromises();
      expect(UserPlaytime.findOrCreate).not.toHaveBeenCalled();
      expect(res.jsonBody.data.ok).toBe(true);
    });
  });

  // ─── getUserInfo ────────────────────────────────────────────────
  describe('getUserInfo', () => {
    it('should return user info with defaults', async () => {
      const fakeUser = mockUser({ id: 600, battleChips: 500, avatarHistory: ['😊'] });
      (User.findByPk as Mock).mockResolvedValue(fakeUser);
      const req = mockReq({ userId: 600 });
      const res = mockRes();
      await getUserInfo(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data.battleChips).toBe(500);
      expect(res.jsonBody.data.avatarHistory).toEqual(['😊']);
    });

    it('should throw NotFoundError when user missing', async () => {
      (User.findByPk as Mock).mockResolvedValue(null);
      const req = mockReq({ userId: 999 });
      const res = mockRes();
      await getUserInfo(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(404);
    });
  });

  // ─── updateUserInfo ────────────────────────────────────────────────
  describe('updateUserInfo', () => {
    it('should update nickname', async () => {
      const fakeUser = mockUser({ id: 700, nickname: 'Old' });
      (User.findByPk as Mock).mockResolvedValue(fakeUser);
      const req = mockReq({ body: { nickname: 'NewName' }, userId: 700 });
      const res = mockRes();
      await updateUserInfo(req as any, res, mockNext);
      await flushPromises();
      expect(fakeUser.nickname).toBe('NewName');
    });

    it('should update avatar and track history', async () => {
      const fakeUser = mockUser({ id: 701, avatar: '😊', avatarHistory: [] });
      (User.findByPk as Mock).mockResolvedValue(fakeUser);
      const req = mockReq({ body: { avatar: '🐶' }, userId: 701 });
      const res = mockRes();
      await updateUserInfo(req as any, res, mockNext);
      await flushPromises();
      expect(fakeUser.avatar).toBe('🐶');
      expect(fakeUser.avatarHistory).toContain('🐶');
      expect(res.jsonBody.data.avatarHistory).toBeDefined();
    });

    it('should throw NotFoundError when user missing', async () => {
      (User.findByPk as Mock).mockResolvedValue(null);
      const req = mockReq({ body: { nickname: 'x' }, userId: 999 });
      const res = mockRes();
      await updateUserInfo(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(404);
    });
  });
});
