import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// Mock request module
vi.mock('../../utils/request', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock achievementBus
vi.mock('../../utils/achievementBus', () => ({
  pendingAchievements: { value: [] },
  notifyAchievements: vi.fn(),
  shiftAchievement: vi.fn(),
}));

import { api } from '../../utils/request';
import {
  getAllProgress,
  getGameProgress,
  updateGameProgress,
  getLeaderboard,
  getDailyTask,
  recordPlay,
  getLevelOverride,
  getAchievements,
} from '../../api/game';

const mockedApi = vi.mocked(api);

describe('api/game', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('getAllProgress', () => {
    it('should fetch all progress and update store', async () => {
      const mockProgress = [
        {
          gameId: 'gomoku',
          currentLevel: 5,
          highScore: 1000,
          stars: 15,
          achievements: ['first_win'],
          levelStars: { '1': 3, '2': 2 },
        },
        {
          gameId: 'memory',
          currentLevel: 3,
          highScore: 500,
          stars: 9,
          achievements: [],
        },
      ];
      mockedApi.get.mockResolvedValue(mockProgress);

      const result = await getAllProgress();

      expect(mockedApi.get).toHaveBeenCalledWith('/game/progress');
      expect(result).toEqual(mockProgress);
      expect(result).toHaveLength(2);
      // Store should be updated
      expect(localStorage.getItem('userInfo')).toBeFalsy(); // No side effect on user
    });
  });

  describe('getGameProgress', () => {
    it('should fetch single game progress', async () => {
      const mockProgress = {
        gameId: 'gomoku',
        currentLevel: 5,
        highScore: 1000,
        stars: 15,
        achievements: ['first_win'],
      };
      mockedApi.get.mockResolvedValue(mockProgress);

      const result = await getGameProgress('gomoku');

      expect(mockedApi.get).toHaveBeenCalledWith('/game/progress/gomoku');
      expect(result).toEqual(mockProgress);
      expect(result.gameId).toBe('gomoku');
    });
  });

  describe('updateGameProgress', () => {
    it('should post progress update and return result', async () => {
      const mockResult = {
        gameId: 'gomoku',
        currentLevel: 6,
        highScore: 1200,
        stars: 18,
        achievements: ['first_win', 'five_wins'],
        totalStars: 50,
        level: 6,
        newAchievements: [{ id: 'five_wins', name: 'Five Wins', icon: 'trophy.png' }],
      };
      mockedApi.post.mockResolvedValue(mockResult);

      const result = await updateGameProgress('gomoku', {
        level: 6,
        score: 1200,
        stars: 18,
        achievements: ['first_win', 'five_wins'],
      });

      expect(mockedApi.post).toHaveBeenCalledWith('/game/progress/gomoku', {
        level: 6,
        score: 1200,
        stars: 18,
        achievements: ['first_win', 'five_wins'],
      });
      expect(result).toEqual(mockResult);
      expect(result.totalStars).toBe(50);
      expect(result.newAchievements).toHaveLength(1);
    });

    it('should support partial updates', async () => {
      mockedApi.post.mockResolvedValue({
        gameId: 'memory',
        currentLevel: 3,
        highScore: 500,
        stars: 9,
        achievements: [],
        totalStars: 30,
        level: 3,
      });

      await updateGameProgress('memory', { level: 3 });

      expect(mockedApi.post).toHaveBeenCalledWith('/game/progress/memory', {
        level: 3,
      });
    });
  });

  describe('getLeaderboard', () => {
    it('should fetch leaderboard with default limit', async () => {
      const mockLeaderboard = [
        { userId: 1, nickname: 'Player 1', score: 1000 },
        { userId: 2, nickname: 'Player 2', score: 900 },
      ];
      mockedApi.get.mockResolvedValue(mockLeaderboard);

      const result = await getLeaderboard('gomoku');

      expect(mockedApi.get).toHaveBeenCalledWith('/game/leaderboard/gomoku', {
        limit: 50,
      });
      expect(result).toEqual(mockLeaderboard);
    });

    it('should fetch leaderboard with custom limit', async () => {
      mockedApi.get.mockResolvedValue([]);

      await getLeaderboard('memory', 10);

      expect(mockedApi.get).toHaveBeenCalledWith('/game/leaderboard/memory', {
        limit: 10,
      });
    });
  });

  describe('getDailyTask', () => {
    it('should fetch daily task info', async () => {
      const mockTask = {
        completedGames: 2,
        playedGames: ['gomoku', 'memory'],
        taskGoal: 3,
        rewardStars: 5,
        claimed: false,
      };
      mockedApi.get.mockResolvedValue(mockTask);

      const result = await getDailyTask();

      expect(mockedApi.get).toHaveBeenCalledWith('/game/daily-task');
      expect(result).toEqual(mockTask);
      expect(result.completedGames).toBe(2);
      expect(result.claimed).toBe(false);
    });

    it('should return task with no games played', async () => {
      const mockTask = {
        completedGames: 0,
        taskGoal: 3,
        rewardStars: 5,
        claimed: false,
      };
      mockedApi.get.mockResolvedValue(mockTask);

      const result = await getDailyTask();

      expect(result.completedGames).toBe(0);
      expect(result.playedGames).toBeUndefined();
    });
  });

  describe('recordPlay', () => {
    it('should post play record and handle errors silently', async () => {
      mockedApi.post.mockResolvedValue({ success: true });

      recordPlay('gomoku');

      expect(mockedApi.post).toHaveBeenCalledWith('/user/play/gomoku');
    });

    it('should catch errors without throwing', async () => {
      mockedApi.post.mockRejectedValue(new Error('Network error'));

      expect(() => recordPlay('memory')).not.toThrow();
    });
  });

  describe('getLevelOverride', () => {
    it('should return override config when available', async () => {
      const mockOverride = {
        override: { timeLimit: 60, hintCount: 2 },
      };
      mockedApi.get.mockResolvedValue(mockOverride);

      const result = await getLevelOverride('gomoku', 5);

      expect(mockedApi.get).toHaveBeenCalledWith('/level/gomoku/5');
      expect(result).toEqual({ timeLimit: 60, hintCount: 2 });
    });

    it('should return null when no override', async () => {
      mockedApi.get.mockResolvedValue({ override: null });

      const result = await getLevelOverride('gomoku', 1);

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockedApi.get.mockRejectedValue(new Error('Not found'));

      const result = await getLevelOverride('gomoku', 10);

      expect(result).toBeNull();
    });
  });

  describe('getAchievements', () => {
    it('should fetch achievement list', async () => {
      const mockAchievements = [
        {
          id: 'first_win',
          name: 'First Win',
          icon: 'trophy.png',
          desc: 'Win your first game',
          unlocked: true,
        },
        {
          id: 'ten_wins',
          name: 'Ten Wins',
          icon: 'medal.png',
          desc: 'Win 10 games',
          unlocked: false,
        },
      ];
      mockedApi.get.mockResolvedValue(mockAchievements);

      const result = await getAchievements();

      expect(mockedApi.get).toHaveBeenCalledWith('/game/achievements');
      expect(result).toEqual(mockAchievements);
      expect(result).toHaveLength(2);
      expect(result[0].unlocked).toBe(true);
      expect(result[1].unlocked).toBe(false);
    });
  });
});
