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
  GameProgress: {
    findAll: vi.fn(),
    findOne: vi.fn(),
    findOrCreate: vi.fn(),
  },
  User: {
    findByPk: vi.fn(),
    findAll: vi.fn(),
  },
}));

vi.mock('../../../src/utils/transaction', () => ({
  withTransaction: vi.fn().mockImplementation(async (fn) => {
    const fakeT = { LOCK: { UPDATE: 'UPDATE' } };
    return fn(fakeT);
  }),
}));

vi.mock('../../../src/services/achievementService', () => ({
  GAME_RULES: {
    memory: { lowerScoreIsBetter: true },
    puzzle: { lowerScoreIsBetter: true },
    fruit: { lowerScoreIsBetter: false },
    match3: { lowerScoreIsBetter: true },
  },
  ACHIEVEMENTS: [],
  evaluateAchievements: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../src/services/dailyTaskService', () => ({
  LEVEL_STAR_THRESHOLD: 15,
  DAILY_TASK_GOAL: 3,
  DAILY_TASK_REWARD: 10,
  localDateString: vi.fn().mockReturnValue('2024-01-15'),
  countTodayPlayedGames: vi.fn().mockResolvedValue(new Set(['memory'])),
  updateDailyTask: vi.fn().mockResolvedValue({ completedGames: 1, taskReward: 0 }),
  getTotalDailyReward: vi.fn().mockResolvedValue(10),
}));

vi.mock('../../../src/services/progressService', () => ({
  parseLevelStars: vi.fn((raw) => {
    try {
      return JSON.parse(raw || '{}');
    } catch {
      return {};
    }
  }),
}));

vi.mock('../../../src/services/leaderboardCacheService', () => ({
  getCachedLeaderboard: vi.fn(),
  cacheLeaderboard: vi.fn(),
  invalidateLeaderboardCache: vi.fn(),
}));

vi.mock('../../../src/utils/safeJson', async () => {
  const actual = await vi.importActual('../../../src/utils/safeJson');
  return actual;
});

import {
  getAllProgress,
  getGameProgress,
  updateGameProgress,
  recordPlay,
  getDailyTask,
  getLeaderboard,
  getAchievements,
} from '../../../src/controllers/gameController';
import { GameProgress, User } from '../../../src/models';
import {
  getCachedLeaderboard,
  cacheLeaderboard,
  invalidateLeaderboardCache,
} from '../../../src/services/leaderboardCacheService';

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

describe('gameController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getAllProgress ────────────────────────────────────────────────
  describe('getAllProgress', () => {
    it('should return all progress for the user', async () => {
      (GameProgress.findAll as Mock).mockResolvedValue([
        {
          gameId: 'memory',
          currentLevel: 3,
          highScore: 100,
          stars: 6,
          levelStars: JSON.stringify({ 1: 2, 2: 3, 3: 1 }),
          achievements: JSON.stringify(['first_win']),
        },
      ]);
      const req = mockReq({ userId: 1 });
      const res = mockRes();
      await getAllProgress(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data).toHaveLength(1);
      expect(res.jsonBody.data[0].gameId).toBe('memory');
    });

    it('should return empty array when no progress', async () => {
      (GameProgress.findAll as Mock).mockResolvedValue([]);
      const req = mockReq({ userId: 1 });
      const res = mockRes();
      await getAllProgress(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data).toEqual([]);
    });
  });

  // ─── getGameProgress ────────────────────────────────────────────────
  describe('getGameProgress', () => {
    it('should return default progress when not found', async () => {
      (GameProgress.findOne as Mock).mockResolvedValue(null);
      const req = mockReq({ params: { gameId: 'memory' }, userId: 1 });
      const res = mockRes();
      await getGameProgress(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data.currentLevel).toBe(1);
      expect(res.jsonBody.data.highScore).toBe(0);
    });

    it('should return existing progress', async () => {
      (GameProgress.findOne as Mock).mockResolvedValue({
        gameId: 'memory',
        currentLevel: 5,
        highScore: 200,
        stars: 8,
        levelStars: JSON.stringify({ 1: 3, 2: 3, 3: 2 }),
        achievements: JSON.stringify(['first_win', 'star_10']),
      });
      const req = mockReq({ params: { gameId: 'memory' }, userId: 1 });
      const res = mockRes();
      await getGameProgress(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data.currentLevel).toBe(5);
      expect(res.jsonBody.data.highScore).toBe(200);
    });
  });

  // ─── updateGameProgress (coin settlement logic) ────────────────────
  describe('updateGameProgress', () => {
    it('should reject invalid gameId', async () => {
      const req = mockReq({ params: { gameId: 'nonexistent' }, body: { level: 1 }, userId: 1 });
      const res = mockRes();
      await updateGameProgress(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('should reject invalid level', async () => {
      const req = mockReq({ params: { gameId: 'memory' }, body: { level: 0 }, userId: 1 });
      const res = mockRes();
      await updateGameProgress(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('should create new progress for first play', async () => {
      const fakeProgress = {
        gameId: 'memory',
        currentLevel: 1,
        highScore: 50,
        stars: 2,
        levelStars: JSON.stringify({ 1: 2 }),
        achievements: JSON.stringify([]),
        playCount: 1,
        winCount: 1,
      };
      (GameProgress.findOrCreate as Mock).mockResolvedValue([fakeProgress, true]);
      (User.findByPk as Mock).mockResolvedValue({
        id: 1,
        totalStars: 0,
        level: 1,
        achievements: '[]',
        save: vi.fn().mockResolvedValue(true),
      });
      (GameProgress.findAll as Mock).mockResolvedValue([fakeProgress]);

      const req = mockReq({
        params: { gameId: 'memory' },
        body: { level: 1, score: 50, stars: 2 },
        userId: 1,
      });
      const res = mockRes();
      await updateGameProgress(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data.currentLevel).toBe(1);
      expect(invalidateLeaderboardCache).toHaveBeenCalledWith('memory');
    });

    it('should update existing progress with higher score for fruit (higher is better)', async () => {
      const fakeProgress = {
        gameId: 'fruit',
        currentLevel: 3,
        highScore: 100,
        stars: 3,
        levelStars: JSON.stringify({ 1: 2, 2: 3, 3: 3 }),
        achievements: JSON.stringify(['first_win']),
        playCount: 5,
        winCount: 4,
        save: vi.fn().mockResolvedValue(true),
      };
      (GameProgress.findOrCreate as Mock).mockResolvedValue([fakeProgress, false]);
      (User.findByPk as Mock).mockResolvedValue({
        id: 1,
        totalStars: 10,
        level: 1,
        achievements: '[]',
        save: vi.fn().mockResolvedValue(true),
      });
      (GameProgress.findAll as Mock).mockResolvedValue([fakeProgress]);

      const req = mockReq({
        params: { gameId: 'fruit' },
        body: { level: 3, score: 200, stars: 3 },
        userId: 1,
      });
      const res = mockRes();
      await updateGameProgress(req as any, res, mockNext);
      await flushPromises();
      expect(fakeProgress.highScore).toBe(200);
    });

    it('should use lower score when lowerScoreIsBetter (memory)', async () => {
      const fakeProgress = {
        gameId: 'memory',
        currentLevel: 2,
        highScore: 100,
        stars: 2,
        levelStars: JSON.stringify({ 1: 3, 2: 2 }),
        achievements: JSON.stringify([]),
        playCount: 3,
        winCount: 2,
        save: vi.fn().mockResolvedValue(true),
      };
      (GameProgress.findOrCreate as Mock).mockResolvedValue([fakeProgress, false]);
      (User.findByPk as Mock).mockResolvedValue({
        id: 1,
        totalStars: 5,
        level: 1,
        achievements: '[]',
        save: vi.fn().mockResolvedValue(true),
      });
      (GameProgress.findAll as Mock).mockResolvedValue([fakeProgress]);

      const req = mockReq({
        params: { gameId: 'memory' },
        body: { level: 2, score: 50, stars: 3 },
        userId: 1,
      });
      const res = mockRes();
      await updateGameProgress(req as any, res, mockNext);
      await flushPromises();
      // For memory, lower score is better, so 50 < 100 → should update highScore
      expect(fakeProgress.highScore).toBe(50);
    });

    it('should clamp stars to 0-3 range', async () => {
      const fakeProgress = {
        gameId: 'fruit',
        currentLevel: 1,
        highScore: 0,
        stars: 0,
        levelStars: '{}',
        achievements: JSON.stringify([]),
        playCount: 0,
        winCount: 0,
        save: vi.fn().mockResolvedValue(true),
      };
      (GameProgress.findOrCreate as Mock).mockResolvedValue([fakeProgress, false]);
      (User.findByPk as Mock).mockResolvedValue({
        id: 1,
        totalStars: 0,
        level: 1,
        achievements: '[]',
        save: vi.fn().mockResolvedValue(true),
      });
      (GameProgress.findAll as Mock).mockResolvedValue([fakeProgress]);

      const req = mockReq({
        params: { gameId: 'fruit' },
        body: { level: 1, score: 100, stars: 10 },
        userId: 1,
      });
      const res = mockRes();
      await updateGameProgress(req as any, res, mockNext);
      await flushPromises();
      // stars should be clamped to 3
      const call = (GameProgress.findOrCreate as Mock).mock.calls[0][0];
      expect(call.defaults.stars).toBeLessThanOrEqual(3);
    });
  });

  // ─── recordPlay ────────────────────────────────────────────────
  describe('recordPlay', () => {
    it('should increment playCount for existing progress', async () => {
      const fakeProgress = { playCount: 5, save: vi.fn().mockResolvedValue(true) };
      (GameProgress.findOrCreate as Mock).mockResolvedValue([fakeProgress, false]);
      const req = mockReq({ params: { gameId: 'memory' }, userId: 1 });
      const res = mockRes();
      await recordPlay(req as any, res, mockNext);
      await flushPromises();
      expect(fakeProgress.playCount).toBe(6);
      expect(fakeProgress.save).toHaveBeenCalled();
    });

    it('should reject invalid gameId', async () => {
      const req = mockReq({ params: { gameId: 'invalid' }, userId: 1 });
      const res = mockRes();
      await recordPlay(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });
  });

  // ─── getDailyTask ────────────────────────────────────────────────
  describe('getDailyTask', () => {
    it('should return daily task status', async () => {
      const req = mockReq({ userId: 1 });
      const res = mockRes();
      await getDailyTask(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data.taskGoal).toBe(3);
      expect(res.jsonBody.data.rewardStars).toBe(10);
    });
  });

  // ─── getLeaderboard ────────────────────────────────────────────────
  describe('getLeaderboard', () => {
    it('should return cached leaderboard when available', async () => {
      const cached = [
        { rank: 1, userId: 1, nickname: 'A', avatar: '', highScore: 100, level: 5 },
        { rank: 2, userId: 2, nickname: 'B', avatar: '', highScore: 90, level: 4 },
      ];
      (getCachedLeaderboard as Mock).mockResolvedValue(cached);
      const req = mockReq({ params: { gameId: 'memory' }, query: { limit: '10' } });
      const res = mockRes();
      await getLeaderboard(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data).toHaveLength(2);
      expect(res.jsonBody.data[0].rank).toBe(1);
    });

    it('should fetch from DB and cache when miss', async () => {
      (getCachedLeaderboard as Mock).mockResolvedValue(null);
      (GameProgress.findAll as Mock).mockResolvedValue([
        {
          userId: 1,
          gameId: 'fruit',
          highScore: 200,
          currentLevel: 3,
          user: { nickname: 'Alice', avatar: '😊' },
        },
        {
          userId: 2,
          gameId: 'fruit',
          highScore: 150,
          currentLevel: 2,
          user: { nickname: 'Bob', avatar: '🐶' },
        },
      ]);
      (cacheLeaderboard as Mock).mockResolvedValue(undefined);

      const req = mockReq({ params: { gameId: 'fruit' }, query: {} });
      const res = mockRes();
      await getLeaderboard(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data).toHaveLength(2);
      expect(res.jsonBody.data[0].nickname).toBe('Alice');
      expect(cacheLeaderboard).toHaveBeenCalled();
    });

    it('should reject invalid gameId', async () => {
      const req = mockReq({ params: { gameId: 'invalid' }, query: {} });
      const res = mockRes();
      await getLeaderboard(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('should respect limit parameter', async () => {
      const cached = Array.from({ length: 10 }, (_, i) => ({
        rank: i + 1,
        userId: i,
        highScore: 100 - i,
      }));
      (getCachedLeaderboard as Mock).mockResolvedValue(cached);
      const req = mockReq({ params: { gameId: 'memory' }, query: { limit: '5' } });
      const res = mockRes();
      await getLeaderboard(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data).toHaveLength(5);
    });
  });

  // ─── getAchievements ────────────────────────────────────────────────
  describe('getAchievements', () => {
    it('should return achievement list', async () => {
      (User.findByPk as Mock).mockResolvedValue({
        id: 1,
        achievements: JSON.stringify(['first_win']),
      });
      const req = mockReq({ userId: 1 });
      const res = mockRes();
      await getAchievements(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data).toEqual([]);
    });
  });
});
