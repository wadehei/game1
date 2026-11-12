import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Op } from 'sequelize';
import {
  localDateString,
  countTodayPlayedGames,
  updateDailyTask,
  getTotalDailyReward,
  DAILY_TASK_GOAL,
  DAILY_TASK_REWARD,
} from '../../services/dailyTaskService';
import { GameProgress, DailyTask } from '../../models';
import { sequelize } from '../../config/database';
import { formatDate } from '../../utils/date';

// Mock models
vi.mock('../../models', () => ({
  GameProgress: {
    findAll: vi.fn(),
  },
  DailyTask: {
    findOrCreate: vi.fn(),
    findAll: vi.fn(),
  },
}));

// Mock database
vi.mock('../../config/database', () => ({
  sequelize: {
    fn: vi.fn(),
    col: vi.fn(),
  },
}));

// Mock utils/date
vi.mock('../../utils/date', () => ({
  formatDate: vi.fn(),
}));

describe('dailyTaskService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('localDateString', () => {
    it('应该返回 YYYY-MM-DD 格式的日期字符串', () => {
      vi.mocked(formatDate).mockReturnValueOnce('2026-11-04');

      const result = localDateString();

      expect(result).toBe('2026-11-04');
      expect(formatDate).toHaveBeenCalled();
    });
  });

  describe('countTodayPlayedGames', () => {
    it('应该返回今天玩过的不同游戏集合', async () => {
      const mockRows = [
        { gameId: 'game1' },
        { gameId: 'game2' },
        { gameId: 'game1' }, // 重复
      ];
      vi.mocked(GameProgress.findAll).mockResolvedValueOnce(mockRows as any);
      vi.mocked(formatDate).mockReturnValue('2026-11-04');

      const result = await countTodayPlayedGames(1);

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(2);
      expect(result.has('game1')).toBe(true);
      expect(result.has('game2')).toBe(true);
    });

    it('应该在无记录时返回空 Set', async () => {
      vi.mocked(GameProgress.findAll).mockResolvedValueOnce([]);
      vi.mocked(formatDate).mockReturnValue('2026-11-04');

      const result = await countTodayPlayedGames(1);

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });

    it('应该使用包含 todayStart 的 where 条件', async () => {
      vi.mocked(GameProgress.findAll).mockResolvedValueOnce([]);
      vi.mocked(formatDate).mockReturnValue('2026-11-04');

      await countTodayPlayedGames(1);

      expect(GameProgress.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 1,
            updatedAt: { [Op.gte]: new Date('2026-11-04T00:00:00') },
          },
          attributes: ['gameId'],
        })
      );
    });
  });

  describe('updateDailyTask', () => {
    const mockTransaction = {} as any;

    it('应该在首次创建时 taskReward 为 0（未达标）', async () => {
      const mockTask = {
        completedGames: 0,
        taskReward: 0,
        save: vi.fn(),
      };
      vi.mocked(DailyTask.findOrCreate).mockResolvedValueOnce([mockTask as any, true]);
      vi.mocked(formatDate).mockReturnValue('2026-11-04');

      const playedGames = new Set(['game1']);
      const result = await updateDailyTask(1, playedGames, mockTransaction);

      expect(DailyTask.findOrCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 1, date: '2026-11-04' },
          defaults: { userId: 1, date: '2026-11-04', completedGames: 1, taskReward: 0 },
        })
      );
      expect(result.taskReward).toBe(0);
      expect(mockTask.save).toHaveBeenCalled();
    });

    it('应该在达标时自动发放奖励', async () => {
      const mockTask = {
        completedGames: 0,
        taskReward: 0,
        save: vi.fn(),
      };
      vi.mocked(DailyTask.findOrCreate).mockResolvedValueOnce([mockTask as any, false]);
      vi.mocked(formatDate).mockReturnValue('2026-11-04');

      const playedGames = new Set(['game1', 'game2', 'game3']);
      const result = await updateDailyTask(1, playedGames, mockTransaction);

      expect(mockTask.completedGames).toBe(3);
      expect(mockTask.taskReward).toBe(DAILY_TASK_REWARD);
      expect(result.taskReward).toBe(DAILY_TASK_REWARD);
    });

    it('应该在未达标时保持 taskReward 为 0', async () => {
      const mockTask = {
        completedGames: 0,
        taskReward: 0,
        save: vi.fn(),
      };
      vi.mocked(DailyTask.findOrCreate).mockResolvedValueOnce([mockTask as any, false]);
      vi.mocked(formatDate).mockReturnValue('2026-11-04');

      const playedGames = new Set(['game1', 'game2']);
      const result = await updateDailyTask(1, playedGames, mockTransaction);

      expect(mockTask.completedGames).toBe(2);
      expect(mockTask.taskReward).toBe(0);
      expect(result.taskReward).toBe(0);
    });

    it('应该不重复发放已领取的奖励', async () => {
      const mockTask = {
        completedGames: 3,
        taskReward: DAILY_TASK_REWARD, // 已领奖
        save: vi.fn(),
      };
      vi.mocked(DailyTask.findOrCreate).mockResolvedValueOnce([mockTask as any, false]);
      vi.mocked(formatDate).mockReturnValue('2026-11-04');

      const playedGames = new Set(['game1', 'game2', 'game3', 'game4']);
      const result = await updateDailyTask(1, playedGames, mockTransaction);

      expect(mockTask.completedGames).toBe(4);
      expect(mockTask.taskReward).toBe(DAILY_TASK_REWARD); // 不重复发放
      expect(result.taskReward).toBe(DAILY_TASK_REWARD);
    });
  });

  describe('getTotalDailyReward', () => {
    it('应该正确解析 SUM 结果', async () => {
      vi.mocked(DailyTask.findAll).mockResolvedValueOnce([{ rewardTotal: '50' } as any]);
      vi.mocked(sequelize.fn).mockReturnValue('SUM_RESULT' as any);
      vi.mocked(sequelize.col).mockReturnValue('taskReward' as any);

      const result = await getTotalDailyReward(1);

      expect(result).toBe(50);
      expect(DailyTask.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 1 },
          raw: true,
        })
      );
    });

    it('应该返回 0（无记录）', async () => {
      vi.mocked(DailyTask.findAll).mockResolvedValueOnce([]);
      vi.mocked(sequelize.fn).mockReturnValue('SUM_RESULT' as any);
      vi.mocked(sequelize.col).mockReturnValue('taskReward' as any);

      const result = await getTotalDailyReward(1);

      expect(result).toBe(0);
    });

    it('应该返回 0（SUM 为 null）', async () => {
      vi.mocked(DailyTask.findAll).mockResolvedValueOnce([{ rewardTotal: null } as any]);
      vi.mocked(sequelize.fn).mockReturnValue('SUM_RESULT' as any);
      vi.mocked(sequelize.col).mockReturnValue('taskReward' as any);

      const result = await getTotalDailyReward(1);

      expect(result).toBe(0);
    });
  });
});
