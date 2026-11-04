import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response, type RequestHandler } from 'express';
import { getMyCareer, reportPlaytime, getBattleCareer } from '../../controllers/careerController';
import { AuthRequest } from '../../middleware/auth';
import { User, UserPlaytime, GameProgress, DailyTask } from '../../models';

// Mock dependencies - explicit factory to avoid Sequelize class auto-mock issues
vi.mock('../../models', () => ({
  User: { findByPk: vi.fn() },
  UserPlaytime: { findAll: vi.fn(), findOrCreate: vi.fn() },
  GameProgress: { findAll: vi.fn() },
  DailyTask: { findAll: vi.fn() },
}));
vi.mock('../../utils/response', () => ({
  success: vi.fn((res: Response, data: unknown) => {
    res.status(200).json({ code: 200, message: 'success', data });
  }),
  asyncHandler: (fn: RequestHandler) => fn,
}));
vi.mock('../../utils/safeJson', () => ({
  safeJsonParse: vi.fn((raw: string | null | undefined, fallback: unknown) => {
    if (raw == null || raw === '') return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }),
}));
vi.mock('../../errors/AppError', () => ({
  NotFoundError: class NotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'NotFoundError';
    }
  },
}));
vi.mock('../../config/constants', () => ({
  MAX_PLAYTIME_SECONDS: 180,
  RECENT_DAYS: 7,
}));

// Mock battleChips dynamic import
vi.mock('../../services/battleChips', () => ({
  getCareer: vi.fn(),
}));

describe('careerController', () => {
  let mockReq: AuthRequest;
  let mockRes: Response;
  let mockJson: ReturnType<typeof vi.fn>;
  let mockStatus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJson = vi.fn();
    mockStatus = vi.fn().mockReturnValue({ json: mockJson });
    mockRes = {
      status: mockStatus,
      json: mockJson,
    } as unknown as Response;
    mockReq = {
      userId: 123,
    } as AuthRequest;
  });

  describe('getMyCareer', () => {
    it('should return complete career data when all data exists', async () => {
      const mockUser = {
        id: 123,
        nickname: 'TestUser',
        avatar: 'avatar.png',
        level: 5,
        totalStars: 100,
        createdAt: new Date('2024-01-01'),
        achievements: '["badge1","badge2"]',
      };
      const mockProgresses = [
        {
          gameId: 'gomoku',
          currentLevel: 10,
          stars: 30,
          highScore: 500,
          playCount: 20,
          winCount: 15,
          updatedAt: new Date('2024-06-01'),
        },
        {
          gameId: 'quiz',
          currentLevel: 5,
          stars: 15,
          highScore: 300,
          playCount: 10,
          winCount: 8,
          updatedAt: new Date('2024-06-02'),
        },
      ];
      const mockTimeRows = [
        { date: '2024-06-01', seconds: 120 },
        { date: '2024-06-02', seconds: 60 },
      ];
      const mockRewardRows = [{ taskReward: 5 }, { taskReward: 3 }];

      vi.mocked(User.findByPk).mockResolvedValue(mockUser as any);
      vi.mocked(GameProgress.findAll).mockResolvedValue(mockProgresses as any);
      vi.mocked(UserPlaytime.findAll).mockResolvedValue(mockTimeRows as any);
      vi.mocked(DailyTask.findAll).mockResolvedValue(mockRewardRows as any);

      await getMyCareer(mockReq, mockRes, () => {});

      expect(User.findByPk).toHaveBeenCalledWith(123);
      expect(GameProgress.findAll).toHaveBeenCalledWith({ where: { userId: 123 } });
      expect(UserPlaytime.findAll).toHaveBeenCalledWith({
        where: { userId: 123 },
        attributes: ['date', 'seconds'],
      });
      expect(DailyTask.findAll).toHaveBeenCalledWith({
        where: { userId: 123 },
        attributes: ['taskReward'],
      });
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 200,
          data: expect.objectContaining({
            user: expect.objectContaining({
              id: 123,
              nickname: 'TestUser',
              avatar: 'avatar.png',
              level: 5,
              totalStars: 100,
            }),
            totals: expect.objectContaining({
              playSeconds: 180,
              playDays: 2,
              playCount: 30,
              winCount: 23,
              achievementCount: 2,
              rewardStars: 8,
            }),
            games: expect.arrayContaining([
              expect.objectContaining({ gameId: 'gomoku' }),
              expect.objectContaining({ gameId: 'quiz' }),
            ]),
          }),
        })
      );
    });

    it('should throw NotFoundError when user does not exist', async () => {
      vi.mocked(User.findByPk).mockResolvedValue(null);

      await expect(getMyCareer(mockReq, mockRes, () => {})).rejects.toThrow('用户不存在');
    });

    it('should return empty games array when no game progress exists', async () => {
      const mockUser = {
        id: 123,
        nickname: 'TestUser',
        avatar: 'avatar.png',
        level: 1,
        totalStars: 0,
        createdAt: new Date('2024-01-01'),
        achievements: '[]',
      };

      vi.mocked(User.findByPk).mockResolvedValue(mockUser as any);
      vi.mocked(GameProgress.findAll).mockResolvedValue([]);
      vi.mocked(UserPlaytime.findAll).mockResolvedValue([]);
      vi.mocked(DailyTask.findAll).mockResolvedValue([]);

      await getMyCareer(mockReq, mockRes, () => {});

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            games: [],
            totals: expect.objectContaining({
              playCount: 0,
              winCount: 0,
              playSeconds: 0,
              playDays: 0,
            }),
          }),
        })
      );
    });

    it('should return empty achievements when JSON is corrupted', async () => {
      const mockUser = {
        id: 123,
        nickname: 'TestUser',
        avatar: 'avatar.png',
        level: 1,
        totalStars: 0,
        createdAt: new Date('2024-01-01'),
        achievements: 'corrupted json{[',
      };

      vi.mocked(User.findByPk).mockResolvedValue(mockUser as any);
      vi.mocked(GameProgress.findAll).mockResolvedValue([]);
      vi.mocked(UserPlaytime.findAll).mockResolvedValue([]);
      vi.mocked(DailyTask.findAll).mockResolvedValue([]);

      await getMyCareer(mockReq, mockRes, () => {});

      // safeJsonParse should return fallback [] for corrupted JSON
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totals: expect.objectContaining({
              achievementCount: 0,
            }),
          }),
        })
      );
    });

    it('should sort games by lastPlayedAt descending', async () => {
      const mockUser = {
        id: 123,
        nickname: 'TestUser',
        avatar: 'avatar.png',
        level: 1,
        totalStars: 0,
        createdAt: new Date('2024-01-01'),
        achievements: '[]',
      };
      const mockProgresses = [
        {
          gameId: 'old_game',
          currentLevel: 1,
          stars: 0,
          highScore: 0,
          playCount: 0,
          winCount: 0,
          updatedAt: new Date('2024-01-01'),
        },
        {
          gameId: 'new_game',
          currentLevel: 1,
          stars: 0,
          highScore: 0,
          playCount: 0,
          winCount: 0,
          updatedAt: new Date('2024-06-01'),
        },
      ];

      vi.mocked(User.findByPk).mockResolvedValue(mockUser as any);
      vi.mocked(GameProgress.findAll).mockResolvedValue(mockProgresses as any);
      vi.mocked(UserPlaytime.findAll).mockResolvedValue([]);
      vi.mocked(DailyTask.findAll).mockResolvedValue([]);

      await getMyCareer(mockReq, mockRes, () => {});

      const callData = mockJson.mock.calls[0][0].data;
      expect(callData.games[0].gameId).toBe('new_game');
      expect(callData.games[1].gameId).toBe('old_game');
    });

    it('should build last7 chart with correct structure', async () => {
      const mockUser = {
        id: 123,
        nickname: 'TestUser',
        avatar: 'avatar.png',
        level: 1,
        totalStars: 0,
        createdAt: new Date('2024-01-01'),
        achievements: '[]',
      };

      vi.mocked(User.findByPk).mockResolvedValue(mockUser as any);
      vi.mocked(GameProgress.findAll).mockResolvedValue([]);
      vi.mocked(UserPlaytime.findAll).mockResolvedValue([]);
      vi.mocked(DailyTask.findAll).mockResolvedValue([]);

      await getMyCareer(mockReq, mockRes, () => {});

      const callData = mockJson.mock.calls[0][0].data;
      expect(callData.last7).toHaveLength(7);
      // Each entry should have date, label, and seconds
      callData.last7.forEach((entry: any) => {
        expect(entry).toHaveProperty('date');
        expect(entry).toHaveProperty('label');
        expect(entry).toHaveProperty('seconds');
        expect(entry.label).toMatch(/^周[一二三四五六日]$/);
      });
    });

    it('should handle null playCount and winCount in progress', async () => {
      const mockUser = {
        id: 123,
        nickname: 'TestUser',
        avatar: 'avatar.png',
        level: 1,
        totalStars: 0,
        createdAt: new Date('2024-01-01'),
        achievements: '[]',
      };
      const mockProgresses = [
        {
          gameId: 'gomoku',
          currentLevel: 1,
          stars: 0,
          highScore: 100,
          playCount: null,
          winCount: null,
          updatedAt: new Date('2024-06-01'),
        },
      ];

      vi.mocked(User.findByPk).mockResolvedValue(mockUser as any);
      vi.mocked(GameProgress.findAll).mockResolvedValue(mockProgresses as any);
      vi.mocked(UserPlaytime.findAll).mockResolvedValue([]);
      vi.mocked(DailyTask.findAll).mockResolvedValue([]);

      await getMyCareer(mockReq, mockRes, () => {});

      const callData = mockJson.mock.calls[0][0].data;
      // playCount and winCount should default to 0
      expect(callData.games[0].playCount).toBe(0);
      expect(callData.games[0].winCount).toBe(0);
      // totals should also reflect 0
      expect(callData.totals.playCount).toBe(0);
      expect(callData.totals.winCount).toBe(0);
    });
  });

  describe('reportPlaytime', () => {
    beforeEach(() => {
      mockReq.body = {};
    });

    it('should create new playtime record when none exists for today', async () => {
      const mockRow = { seconds: 30, save: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(UserPlaytime.findOrCreate).mockResolvedValue([mockRow as any, true]);

      mockReq.body = { seconds: 30 };
      await reportPlaytime(mockReq, mockRes, () => {});

      expect(UserPlaytime.findOrCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 123 }),
          defaults: expect.objectContaining({ seconds: 30 }),
        })
      );
      expect(mockRow.save).toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalledWith({
        code: 200,
        message: 'success',
        data: { ok: true },
      });
    });

    it('should accumulate seconds when record already exists for today', async () => {
      const mockRow = { seconds: 60, save: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(UserPlaytime.findOrCreate).mockResolvedValue([mockRow as any, false]);

      mockReq.body = { seconds: 30 };
      await reportPlaytime(mockReq, mockRes, () => {});

      // seconds should be accumulated: 60 + 30 = 90
      expect(mockRow.seconds).toBe(90);
      expect(mockRow.save).toHaveBeenCalled();
    });

    it('should return early when seconds is 0', async () => {
      mockReq.body = { seconds: 0 };
      await reportPlaytime(mockReq, mockRes, () => {});

      expect(UserPlaytime.findOrCreate).not.toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalledWith({
        code: 200,
        message: 'success',
        data: { ok: true },
      });
    });

    it('should cap seconds at MAX_PLAYTIME_SECONDS (180) when exceeding limit', async () => {
      const mockRow = { seconds: 0, save: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(UserPlaytime.findOrCreate).mockResolvedValue([mockRow as any, true]);

      mockReq.body = { seconds: 300 };
      await reportPlaytime(mockReq, mockRes, () => {});

      // Should be capped at 180
      expect(UserPlaytime.findOrCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          defaults: expect.objectContaining({ seconds: 180 }),
        })
      );
    });

    it('should treat negative seconds as 0', async () => {
      mockReq.body = { seconds: -10 };
      await reportPlaytime(mockReq, mockRes, () => {});

      // Negative seconds should become 0, which triggers early return
      expect(UserPlaytime.findOrCreate).not.toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalledWith({
        code: 200,
        message: 'success',
        data: { ok: true },
      });
    });

    it('should handle missing seconds in body gracefully', async () => {
      mockReq.body = {};
      await reportPlaytime(mockReq, mockRes, () => {});

      // Missing seconds → NaN → || 0 → 0, early return
      expect(UserPlaytime.findOrCreate).not.toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalledWith({
        code: 200,
        message: 'success',
        data: { ok: true },
      });
    });

    it('should use correct date format (YYYY-MM-DD)', async () => {
      const mockRow = { seconds: 0, save: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(UserPlaytime.findOrCreate).mockResolvedValue([mockRow as any, true]);

      mockReq.body = { seconds: 30 };
      await reportPlaytime(mockReq, mockRes, () => {});

      const callArgs = (UserPlaytime.findOrCreate as any).mock.calls[0][0];
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      expect(callArgs.where.date).toMatch(datePattern);
      expect(callArgs.defaults.date).toMatch(datePattern);
    });
  });

  describe('getBattleCareer', () => {
    it('should call getCareer with userId and return result', async () => {
      const mockCareerData = {
        currentChips: 1500,
        games: [
          { gameId: 'gomoku', wins: 10, losses: 5 },
          { gameId: 'quiz', wins: 20, losses: 8 },
        ],
        recentGames: [],
      };

      // Dynamic import mock
      const { getCareer } = await import('../../services/battleChips');
      vi.mocked(getCareer).mockResolvedValue(mockCareerData as any);

      await getBattleCareer(mockReq, mockRes, () => {});

      expect(getCareer).toHaveBeenCalledWith(123);
      expect(mockJson).toHaveBeenCalledWith({
        code: 200,
        message: 'success',
        data: mockCareerData,
      });
    });

    it('should use dynamic import for battleChips service', async () => {
      const mockCareerData = { currentChips: 1000, games: [], recentGames: [] };
      const { getCareer } = await import('../../services/battleChips');
      vi.mocked(getCareer).mockResolvedValue(mockCareerData as any);

      await getBattleCareer(mockReq, mockRes, () => {});

      // Verify the function was called - dynamic import is handled by vi.mock
      expect(getCareer).toHaveBeenCalledTimes(1);
      expect(mockJson).toHaveBeenCalled();
    });
  });
});
