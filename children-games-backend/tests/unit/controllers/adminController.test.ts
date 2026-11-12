import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Request, Response } from 'express';

// ─── Mocks ────────────────────────────────────────────────────────
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
    findAll: vi.fn(),
    findByPk: vi.fn(),
    count: vi.fn(),
    sum: vi.fn(),
    destroy: vi.fn(),
  },
  GameProgress: {
    findAll: vi.fn(),
    destroy: vi.fn(),
  },
  UserPlaytime: {
    findAll: vi.fn(),
    destroy: vi.fn(),
  },
  DailyTask: {
    destroy: vi.fn(),
  },
  AppSetting: {
    findByPk: vi.fn(),
    upsert: vi.fn(),
  },
  LevelConfig: {
    findAll: vi.fn(),
    upsert: vi.fn(),
    destroy: vi.fn(),
  },
  QuizQuestion: {
    findAndCountAll: vi.fn(),
    findOne: vi.fn(),
    findByPk: vi.fn(),
    create: vi.fn(),
  },
  Feedback: {
    destroy: vi.fn(),
  },
  FeedbackReply: {
    destroy: vi.fn(),
  },
  BattleRecord: {
    destroy: vi.fn(),
  },
  Admin: {
    findOne: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../../src/utils/transaction', () => ({
  withTransaction: vi.fn().mockImplementation(async (fn, _label?) => {
    const fakeT = {
      LOCK: { UPDATE: 'UPDATE' },
    };
    // 模拟事务：直接执行回调，确保内部逻辑真正运行
    const result = await fn(fakeT);
    return result;
  }),
}));

vi.mock('../../../src/utils/logger', () => ({
  readRecentErrors: vi.fn().mockReturnValue([]),
  clearErrors: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../../src/controllers/levelController', () => ({
  LEVEL_FIELDS: {
    memory: ['rows', 'time'],
    puzzle: ['pieces'],
  },
}));

vi.mock('../../../src/utils/date', () => ({
  formatDate: vi.fn().mockReturnValue('2024-01-15'),
}));

vi.mock('../../../src/config', () => ({
  config: { nodeEnv: 'test', jwt: { secret: 'test-secret' } },
}));

vi.mock('../../../src/utils/safeJson', async () => {
  const actual = await vi.importActual('../../../src/utils/safeJson');
  return actual;
});

vi.mock('../../../src/services/battleChips', () => ({
  adminAdjustChips: vi.fn().mockResolvedValue(1500),
}));

vi.mock('../../../src/services/backupService', () => ({
  buildBackupSql: vi.fn().mockResolvedValue('-- SQL BACKUP CONTENT'),
  listAutoBackups: vi.fn().mockReturnValue([{ name: 'backup_1.sql', size: 1024 }]),
}));

vi.mock('../../../src/ws/wsServer', () => ({
  kickUserEverywhere: vi.fn(),
}));

// Mock fs/promises 以防止真实文件操作
vi.mock('fs/promises', () => ({
  default: {
    unlink: vi.fn().mockResolvedValue(undefined),
  },
  unlink: vi.fn().mockResolvedValue(undefined),
}));

import {
  adminLogin,
  getOverview,
  getUsers,
  updateUser,
  adjustUserChips,
  resetUserProgress,
  deleteUser,
  getSettings,
  updateSettings,
  clearUserPin,
  getLevelOverrides,
  saveLevelOverride,
  deleteLevelOverride,
  getErrorLogs,
  clearErrorLogs,
  downloadBackup,
  listAutoBackups,
  quizList,
  quizCreate,
  quizUpdate,
  quizDelete,
  quizImport,
} from '../../../src/controllers/adminController';
import {
  User,
  GameProgress,
  UserPlaytime,
  DailyTask,
  AppSetting,
  LevelConfig,
  QuizQuestion,
  Feedback,
  FeedbackReply,
  BattleRecord,
} from '../../../src/models';
import { readRecentErrors, clearErrors } from '../../../src/utils/logger';
import jwt from 'jsonwebtoken';

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
    setHeader: vi.fn(),
    send: vi.fn(),
  };
  return res as any;
};

const mockNext = vi.fn();

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('adminController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_PASSWORD = 'test-admin-pwd';
  });

  // ─── adminLogin ────────────────────────────────────────────────
  describe('adminLogin', () => {
    it('should reject missing ADMIN_PASSWORD config', async () => {
      delete process.env.ADMIN_PASSWORD;
      const req = mockReq({ body: { password: 'test' } });
      const res = mockRes();
      await adminLogin(req, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(500);
    });

    it('should reject wrong password', async () => {
      const req = mockReq({ body: { password: 'wrong-pwd' } });
      const res = mockRes();
      await adminLogin(req, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(401);
    });

    it('should return JWT token on correct password', async () => {
      const req = mockReq({ body: { password: 'test-admin-pwd' } });
      const res = mockRes();
      await adminLogin(req, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data.token).toBeDefined();
      const decoded = jwt.verify(res.jsonBody.data.token, 'test-secret') as any;
      expect(decoded.role).toBe('admin');
    });
  });

  // ─── getOverview ────────────────────────────────────────────────
  describe('getOverview', () => {
    it('should return aggregated overview data', async () => {
      (User.findAll as Mock).mockResolvedValue([
        { id: 1, nickname: 'A', avatar: '😊', level: 2, totalStars: 30 },
        { id: 2, nickname: 'B', avatar: '🐶', level: 1, totalStars: 15 },
      ]);
      (UserPlaytime.findAll as Mock).mockResolvedValue([
        { userId: 1, seconds: 600 },
        { userId: 2, seconds: 300 },
      ]);
      (GameProgress.findAll as Mock).mockResolvedValue([
        {
          userId: 1,
          gameId: 'memory',
          currentLevel: 3,
          highScore: 100,
          stars: 6,
          updatedAt: new Date(),
        },
      ]);
      (User.count as Mock).mockResolvedValue(5);
      (User.sum as Mock).mockResolvedValue(100);
      (User.findAll as Mock)
        .mockResolvedValueOnce([
          { id: 1, nickname: 'A', avatar: '😊', level: 2, totalStars: 30 },
          { id: 2, nickname: 'B', avatar: '🐶', level: 1, totalStars: 15 },
        ])
        .mockResolvedValueOnce([{ id: 1, nickname: 'A', avatar: '😊' }]);

      const req = mockReq();
      const res = mockRes();
      await getOverview(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data.familyMembers).toBe(2);
      expect(res.jsonBody.data.guestUsers).toBe(3); // 5 - 2
      expect(res.jsonBody.data.totalStars).toBe(100);
      expect(res.jsonBody.data.todayPlaySeconds).toBe(900);
    });

    it('should handle empty data', async () => {
      (User.findAll as Mock).mockResolvedValue([]);
      (UserPlaytime.findAll as Mock).mockResolvedValue([]);
      (GameProgress.findAll as Mock).mockResolvedValue([]);
      (User.count as Mock).mockResolvedValue(0);
      (User.sum as Mock).mockResolvedValue(0);

      const req = mockReq();
      const res = mockRes();
      await getOverview(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data.familyMembers).toBe(0);
      expect(res.jsonBody.data.totalStars).toBe(0);
    });
  });

  // ─── getUsers ────────────────────────────────────────────────
  describe('getUsers', () => {
    it('should return users with play stats', async () => {
      (User.findAll as Mock).mockResolvedValue([
        {
          id: 1,
          openid: 'family_abc',
          nickname: 'A',
          avatar: '😊',
          level: 2,
          totalStars: 30,
          battleChips: 500,
          createdAt: new Date(),
          pinHash: 'hash',
        },
      ]);
      (UserPlaytime.findAll as Mock).mockResolvedValue([{ userId: 1, seconds: 600 }]);
      (GameProgress.findAll as Mock).mockResolvedValue([{ userId: 1, updatedAt: new Date() }]);

      const req = mockReq();
      const res = mockRes();
      await getUsers(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data).toHaveLength(1);
      expect(res.jsonBody.data[0].isFamily).toBe(true);
      expect(res.jsonBody.data[0].hasPin).toBe(true);
      expect(res.jsonBody.data[0].todaySeconds).toBe(600);
    });
  });

  // ─── updateUser ────────────────────────────────────────────────
  describe('updateUser', () => {
    it('should update nickname and avatar', async () => {
      const fakeUser = {
        id: 1,
        nickname: 'Old',
        avatar: '😊',
        save: vi.fn().mockResolvedValue(true),
      };
      (User.findByPk as Mock).mockResolvedValue(fakeUser);
      const req = mockReq({ params: { id: '1' }, body: { nickname: 'New', avatar: '🐶' } });
      const res = mockRes();
      await updateUser(req as any, res, mockNext);
      await flushPromises();
      expect(fakeUser.nickname).toBe('New');
      expect(fakeUser.avatar).toBe('🐶');
      expect(fakeUser.save).toHaveBeenCalled();
    });

    it('should throw NotFoundError when user missing', async () => {
      (User.findByPk as Mock).mockResolvedValue(null);
      const req = mockReq({ params: { id: '999' }, body: { nickname: 'x' } });
      const res = mockRes();
      await updateUser(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(404);
    });
  });

  // ─── resetUserProgress ────────────────────────────────────────────────
  describe('resetUserProgress', () => {
    it('should reset user stats and delete progress', async () => {
      const fakeUser = {
        id: 1,
        nickname: 'A',
        totalStars: 50,
        level: 4,
        achievements: '["first_win"]',
        save: vi.fn().mockResolvedValue(true),
        destroy: vi.fn().mockResolvedValue(true),
      };
      // resetUserProgress 在事务内会调用 User.findByPk（带 lock）
      // withTransaction mock 会直接执行 fn(t)，所以 findByPk 会被调用一次
      (User.findByPk as Mock).mockResolvedValue(fakeUser);
      (GameProgress.destroy as Mock).mockResolvedValue(1);
      (DailyTask.destroy as Mock).mockResolvedValue(1);

      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();
      await resetUserProgress(req as any, res, mockNext);
      await flushPromises();
      expect(fakeUser.totalStars).toBe(0);
      expect(fakeUser.level).toBe(1);
      expect(fakeUser.achievements).toBe('[]');
      expect(fakeUser.save).toHaveBeenCalled();
    });
  });

  // ─── getSettings / updateSettings ────────────────────────────────
  describe('settings', () => {
    it('getSettings should return default when no row', async () => {
      (AppSetting.findByPk as Mock).mockResolvedValue(null);
      const req = mockReq();
      const res = mockRes();
      await getSettings(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data.restIntervalMinutes).toBe(20);
    });

    it('getSettings should return stored value', async () => {
      (AppSetting.findByPk as Mock).mockResolvedValue({ value: '30' });
      const req = mockReq();
      const res = mockRes();
      await getSettings(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data.restIntervalMinutes).toBe(30);
    });

    it('updateSettings should reject invalid value', async () => {
      const req = mockReq({ body: { restIntervalMinutes: -1 } });
      const res = mockRes();
      await updateSettings(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('updateSettings should save valid value', async () => {
      (AppSetting.upsert as Mock).mockResolvedValue([]);
      const req = mockReq({ body: { restIntervalMinutes: 45 } });
      const res = mockRes();
      await updateSettings(req as any, res, mockNext);
      await flushPromises();
      expect(AppSetting.upsert).toHaveBeenCalledWith({
        key: 'rest_interval_minutes',
        value: '45',
      });
      expect(res.jsonBody.data.restIntervalMinutes).toBe(45);
    });
  });

  // ─── clearUserPin ────────────────────────────────────────────────
  describe('clearUserPin', () => {
    it('should clear user PIN', async () => {
      const fakeUser = { id: 1, pinHash: 'existing-hash', save: vi.fn().mockResolvedValue(true) };
      (User.findByPk as Mock).mockResolvedValue(fakeUser);
      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();
      await clearUserPin(req as any, res, mockNext);
      await flushPromises();
      expect(fakeUser.pinHash).toBeNull();
      expect(res.jsonBody.data.hasPin).toBe(false);
    });

    it('should throw NotFoundError when user missing', async () => {
      (User.findByPk as Mock).mockResolvedValue(null);
      const req = mockReq({ params: { id: '999' } });
      const res = mockRes();
      await clearUserPin(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(404);
    });
  });

  // ─── level overrides ────────────────────────────────────────────────
  describe('level overrides', () => {
    it('getLevelOverrides should reject unknown gameId', async () => {
      const req = mockReq({ params: { gameId: 'unknown' } });
      const res = mockRes();
      await getLevelOverrides(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('getLevelOverrides should return configs', async () => {
      (LevelConfig.findAll as Mock).mockResolvedValue([
        { level: 1, config: JSON.stringify({ rows: 4 }), updatedAt: new Date() },
      ]);
      const req = mockReq({ params: { gameId: 'memory' } });
      const res = mockRes();
      await getLevelOverrides(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data).toHaveLength(1);
    });

    it('saveLevelOverride should reject unknown gameId', async () => {
      const req = mockReq({
        params: { gameId: 'unknown', level: '1' },
        body: { config: { x: 1 } },
      });
      const res = mockRes();
      await saveLevelOverride(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('saveLevelOverride should reject invalid level', async () => {
      const req = mockReq({
        params: { gameId: 'memory', level: '0' },
        body: { config: { rows: 4 } },
      });
      const res = mockRes();
      await saveLevelOverride(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('saveLevelOverride should reject non-object config', async () => {
      const req = mockReq({ params: { gameId: 'memory', level: '1' }, body: { config: 'str' } });
      const res = mockRes();
      await saveLevelOverride(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('saveLevelOverride should reject unknown fields', async () => {
      const req = mockReq({
        params: { gameId: 'memory', level: '1' },
        body: { config: { unknownField: 1 } },
      });
      const res = mockRes();
      await saveLevelOverride(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('saveLevelOverride should save valid config', async () => {
      (LevelConfig.upsert as Mock).mockResolvedValue([]);
      const req = mockReq({
        params: { gameId: 'memory', level: '1' },
        body: { config: { rows: 4 } },
      });
      const res = mockRes();
      await saveLevelOverride(req as any, res, mockNext);
      await flushPromises();
      expect(LevelConfig.upsert).toHaveBeenCalled();
    });

    it('deleteLevelOverride should delete config', async () => {
      (LevelConfig.destroy as Mock).mockResolvedValue(1);
      const req = mockReq({ params: { gameId: 'memory', level: '1' } });
      const res = mockRes();
      await deleteLevelOverride(req as any, res, mockNext);
      await flushPromises();
      expect(LevelConfig.destroy).toHaveBeenCalledWith({
        where: { gameId: 'memory', level: 1 },
      });
    });
  });

  // ─── error logs ────────────────────────────────────────────────
  describe('error logs', () => {
    it('getErrorLogs should return errors', async () => {
      (readRecentErrors as Mock).mockReturnValue([{ message: 'err1' }, { message: 'err2' }]);
      const req = mockReq({ query: { limit: '10' } });
      const res = mockRes();
      await getErrorLogs(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data).toHaveLength(2);
    });

    it('clearErrorLogs should call clearErrors', async () => {
      const req = mockReq();
      const res = mockRes();
      await clearErrorLogs(req as any, res, mockNext);
      await flushPromises();
      expect(clearErrors).toHaveBeenCalled();
    });
  });

  // ─── quiz management ────────────────────────────────────────────────
  describe('quiz management', () => {
    it('quizList should return paginated results', async () => {
      (QuizQuestion.findAndCountAll as Mock).mockResolvedValue({
        rows: [{ id: 1, text: 'Q1' }],
        count: 1,
      });
      const req = mockReq({ query: { page: '1', category: '' } });
      const res = mockRes();
      await quizList(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data.list).toHaveLength(1);
      expect(res.jsonBody.data.total).toBe(1);
    });

    it('quizCreate should reject invalid question', async () => {
      const req = mockReq({ body: { text: '', options: [], answer: 0 } });
      const res = mockRes();
      await quizCreate(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('quizCreate should reject duplicate question', async () => {
      (QuizQuestion.findOne as Mock).mockResolvedValue({ id: 1 });
      const req = mockReq({
        body: { text: 'Q1', options: ['A', 'B', 'C', 'D'], answer: 0, category: 'Math' },
      });
      const res = mockRes();
      await quizCreate(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('quizCreate should create valid question', async () => {
      (QuizQuestion.findOne as Mock).mockResolvedValue(null);
      (QuizQuestion.create as Mock).mockResolvedValue({ id: 10, text: 'Q1' });
      const req = mockReq({
        body: {
          text: 'Q1',
          options: ['A', 'B', 'C', 'D'],
          answer: 0,
          category: 'Math',
          difficulty: 2,
        },
      });
      const res = mockRes();
      await quizCreate(req as any, res, mockNext);
      await flushPromises();
      expect(QuizQuestion.create).toHaveBeenCalled();
    });

    it('quizUpdate should reject when question not found', async () => {
      (QuizQuestion.findByPk as Mock).mockResolvedValue(null);
      const req = mockReq({
        params: { id: '999' },
        body: { text: 'Updated Q', options: ['A', 'B', 'C', 'D'], answer: 1 },
      });
      const res = mockRes();
      await quizUpdate(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(404);
    });

    it('quizUpdate should reject invalid question data', async () => {
      (QuizQuestion.findByPk as Mock).mockResolvedValue({
        id: 1,
        text: 'Old Q',
        update: vi.fn(),
      });
      const req = mockReq({
        params: { id: '1' },
        body: { text: '', options: [], answer: 0 },
      });
      const res = mockRes();
      await quizUpdate(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('quizUpdate should update valid question', async () => {
      const fakeQ = { id: 1, text: 'Old Q', update: vi.fn().mockResolvedValue({}) };
      (QuizQuestion.findByPk as Mock).mockResolvedValue(fakeQ);
      const req = mockReq({
        params: { id: '1' },
        body: { text: 'Updated Q', options: ['A', 'B', 'C', 'D'], answer: 1, category: 'Math' },
      });
      const res = mockRes();
      await quizUpdate(req as any, res, mockNext);
      await flushPromises();
      expect(fakeQ.update).toHaveBeenCalled();
    });

    it('quizDelete should reject when question not found', async () => {
      (QuizQuestion.findByPk as Mock).mockResolvedValue(null);
      const req = mockReq({ params: { id: '999' } });
      const res = mockRes();
      await quizDelete(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(404);
    });

    it('quizDelete should delete existing question', async () => {
      const fakeQ = { id: 1, destroy: vi.fn().mockResolvedValue(true) };
      (QuizQuestion.findByPk as Mock).mockResolvedValue(fakeQ);
      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();
      await quizDelete(req as any, res, mockNext);
      await flushPromises();
      expect(fakeQ.destroy).toHaveBeenCalled();
    });

    it('quizImport should reject empty list', async () => {
      const req = mockReq({ body: { questions: [] } });
      const res = mockRes();
      await quizImport(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('quizImport should import valid questions and skip duplicates', async () => {
      (QuizQuestion.findOne as Mock).mockResolvedValue(null);
      (QuizQuestion.create as Mock).mockResolvedValue({ id: 1 });
      const req = mockReq({
        body: {
          questions: [
            { text: 'Q1', options: ['A', 'B', 'C', 'D'], answer: 0, category: 'Math' },
            { text: 'Q2', options: ['A', 'B', 'C', 'D'], answer: 1, category: 'Science' },
            { text: '', options: [], answer: 0 }, // invalid, should be skipped
          ],
        },
      });
      const res = mockRes();
      await quizImport(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data.created).toBe(2);
      expect(res.jsonBody.data.skipped).toBe(1);
    });
  });

  // ─── adjustUserChips ────────────────────────────────────────────────
  describe('adjustUserChips', () => {
    it('should reject when user not found', async () => {
      (User.findByPk as Mock).mockResolvedValue(null);
      const req = mockReq({ params: { id: '999' }, body: { delta: 100 } });
      const res = mockRes();
      await adjustUserChips(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(404);
    });

    it('should reject when neither delta nor set provided', async () => {
      (User.findByPk as Mock).mockResolvedValue({ id: 1, nickname: 'A' });
      const req = mockReq({ params: { id: '1' }, body: {} });
      const res = mockRes();
      await adjustUserChips(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('should adjust chips with delta', async () => {
      (User.findByPk as Mock).mockResolvedValue({ id: 1, nickname: 'A' });
      const req = mockReq({ params: { id: '1' }, body: { delta: 100 } });
      const res = mockRes();
      await adjustUserChips(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data.battleChips).toBe(1500);
    });
  });

  // ─── deleteUser ────────────────────────────────────────────────
  describe('deleteUser', () => {
    it('should reject when user not found', async () => {
      (User.findByPk as Mock).mockResolvedValue(null);
      const req = mockReq({ params: { id: '999' } });
      const res = mockRes();
      await deleteUser(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(404);
    });

    it('should delete user and all associated data', async () => {
      const fakeUser = {
        id: 1,
        nickname: 'A',
        // 使用 emoji 头像，不触发文件删除逻辑
        avatar: '😊',
        destroy: vi.fn().mockResolvedValue(true),
      };
      // deleteUser 先调用 User.findByPk 获取用户，然后在事务内再次调用（带锁）
      (User.findByPk as Mock)
        .mockResolvedValueOnce(fakeUser) // 事务外的第一次查询
        .mockResolvedValueOnce(fakeUser); // 事务内的第二次查询（带锁）
      (FeedbackReply.destroy as Mock).mockResolvedValue(1);
      (Feedback.destroy as Mock).mockResolvedValue(1);
      (BattleRecord.destroy as Mock).mockResolvedValue(1);
      (GameProgress.destroy as Mock).mockResolvedValue(1);
      (DailyTask.destroy as Mock).mockResolvedValue(1);
      (UserPlaytime.destroy as Mock).mockResolvedValue(1);

      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();
      await deleteUser(req as any, res, mockNext);
      await flushPromises();
      expect(fakeUser.destroy).toHaveBeenCalled();
      expect(res.jsonBody.data.id).toBe(1);
    });
  });

  // ─── backup ────────────────────────────────────────────────
  describe('backup', () => {
    it('downloadBackup should return SQL file', async () => {
      const req = mockReq();
      const res = mockRes();
      await downloadBackup(req as any, res, mockNext);
      await flushPromises();
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/sql; charset=utf-8');
      expect(res.send).toHaveBeenCalledWith('-- SQL BACKUP CONTENT');
    });

    it('listAutoBackups should return backup list', async () => {
      const req = mockReq();
      const res = mockRes();
      await listAutoBackups(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data).toHaveLength(1);
    });
  });
});
