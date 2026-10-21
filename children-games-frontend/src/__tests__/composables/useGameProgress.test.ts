import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the composable
vi.mock('@/store/game', () => ({
  useGameStore: vi.fn(() => ({
    getProgress: vi.fn(),
    updateProgress: vi.fn(),
  })),
}));

vi.mock('@/api/game', () => ({
  getGameProgress: vi.fn(),
  updateGameProgress: vi.fn(),
  recordPlay: vi.fn(),
}));

vi.mock('@/utils/achievementBus', () => ({
  notifyAchievements: vi.fn(),
}));

import { useGameProgress } from '../../composables/useGameProgress';
import { useGameStore } from '@/store/game';
import { getGameProgress, updateGameProgress } from '@/api/game';

const mockGetProgress = vi.mocked(getGameProgress);
const mockUpdateProgress = vi.mocked(updateGameProgress);

describe('useGameProgress', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();

    // Default: store has no cached progress
    const mockStore = {
      getProgress: vi.fn().mockReturnValue(null),
      updateProgress: vi.fn(),
    };
    vi.mocked(useGameStore).mockReturnValue(mockStore as any);
  });

  describe('loadStartLevel', () => {
    it('should return cached level from store if > 1', async () => {
      const mockStore = {
        getProgress: vi.fn().mockReturnValue({ currentLevel: 5 }),
        updateProgress: vi.fn(),
      };
      vi.mocked(useGameStore).mockReturnValue(mockStore as any);

      const { loadStartLevel } = useGameProgress('puzzle');
      const level = await loadStartLevel();

      expect(level).toBe(5);
      expect(mockGetProgress).not.toHaveBeenCalled();
    });

    it('should fetch from API when no cached progress', async () => {
      mockGetProgress.mockResolvedValue({ currentLevel: 3 } as any);

      const { loadStartLevel } = useGameProgress('puzzle');
      const level = await loadStartLevel();

      expect(level).toBe(3);
      expect(mockGetProgress).toHaveBeenCalledWith('puzzle');
    });

    it('should return 1 when API returns null progress', async () => {
      mockGetProgress.mockResolvedValue(null as any);

      const { loadStartLevel } = useGameProgress('puzzle');
      const level = await loadStartLevel();

      expect(level).toBe(1);
    });

    it('should fall back to localStorage when API fails', async () => {
      mockGetProgress.mockRejectedValue(new Error('Network error'));
      localStorage.setItem('game_progress_balloon', JSON.stringify({ level: 7 }));

      const { loadStartLevel } = useGameProgress('balloon');
      const level = await loadStartLevel();

      expect(level).toBe(7);
    });

    it('should return 1 when both API and localStorage fail', async () => {
      mockGetProgress.mockRejectedValue(new Error('Network error'));

      const { loadStartLevel } = useGameProgress('balloon');
      const level = await loadStartLevel();

      expect(level).toBe(1);
    });

    it('should fall back to localStorage when API returns level 1 (no cached)', async () => {
      const mockStore = {
        getProgress: vi.fn().mockReturnValue({ currentLevel: 1 }),
        updateProgress: vi.fn(),
      };
      vi.mocked(useGameStore).mockReturnValue(mockStore as any);
      mockGetProgress.mockResolvedValue({ currentLevel: 1 } as any);

      const { loadStartLevel } = useGameProgress('puzzle');
      const level = await loadStartLevel();

      expect(level).toBe(1);
    });
  });

  describe('saveProgress', () => {
    it('should call API to save progress', async () => {
      mockUpdateProgress.mockResolvedValue({ newAchievements: [] } as any);

      const { saveProgress } = useGameProgress('puzzle');
      await saveProgress({ level: 5, score: 1000, stars: 3 });

      expect(mockUpdateProgress).toHaveBeenCalledWith('puzzle', {
        level: 5,
        score: 1000,
        stars: 3,
      });
    });

    it('should remove local cache after successful API save', async () => {
      localStorage.setItem('game_progress_puzzle', JSON.stringify({ level: 3 }));
      mockUpdateProgress.mockResolvedValue({ newAchievements: [] } as any);

      const { saveProgress } = useGameProgress('puzzle');
      await saveProgress({ level: 5, score: 1000, stars: 3 });

      expect(localStorage.getItem('game_progress_puzzle')).toBeNull();
    });

    it('should write to localStorage when API fails', async () => {
      mockUpdateProgress.mockRejectedValue(new Error('Network error'));

      const { saveProgress } = useGameProgress('puzzle');
      await saveProgress({ level: 5, score: 1000, stars: 3 });

      const cached = JSON.parse(localStorage.getItem('game_progress_puzzle')!);
      expect(cached.level).toBe(5);
      expect(cached.score).toBe(1000);
      expect(cached.stars).toBe(3);
    });

    it('should only overwrite local cache if new progress is better', async () => {
      localStorage.setItem(
        'game_progress_puzzle',
        JSON.stringify({ level: 8, score: 2000 })
      );
      mockUpdateProgress.mockRejectedValue(new Error('Network error'));

      const { saveProgress } = useGameProgress('puzzle');
      // level 5 < cached level 8, should NOT overwrite
      await saveProgress({ level: 5, score: 1000, stars: 3 });

      const cached = JSON.parse(localStorage.getItem('game_progress_puzzle')!);
      expect(cached.level).toBe(8);
    });

    it('should overwrite local cache if same level but higher score', async () => {
      localStorage.setItem(
        'game_progress_puzzle',
        JSON.stringify({ level: 5, score: 500 })
      );
      mockUpdateProgress.mockRejectedValue(new Error('Network error'));

      const { saveProgress } = useGameProgress('puzzle');
      // same level 5, but score 1000 > 500
      await saveProgress({ level: 5, score: 1000, stars: 3 });

      const cached = JSON.parse(localStorage.getItem('game_progress_puzzle')!);
      expect(cached.level).toBe(5);
      expect(cached.score).toBe(1000);
    });
  });
});
