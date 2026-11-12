import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useGameStore } from '../../store/game';

describe('store/game', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('initial state', () => {
    it('should initialize with empty progressList', () => {
      const store = useGameStore();
      expect(store.progressList).toEqual([]);
    });
  });

  describe('setProgress', () => {
    it('should set entire progress list', () => {
      const store = useGameStore();
      const progress = [
        {
          gameId: 'gomoku',
          currentLevel: 5,
          highScore: 1000,
          stars: 15,
          achievements: ['first_win'],
        },
        {
          gameId: 'memory',
          currentLevel: 3,
          highScore: 500,
          stars: 9,
          achievements: [],
        },
      ];
      store.setProgress(progress);
      expect(store.progressList).toEqual(progress);
      expect(store.progressList).toHaveLength(2);
    });

    it('should replace existing progress list', () => {
      const store = useGameStore();
      const initial = [
        {
          gameId: 'gomoku',
          currentLevel: 1,
          highScore: 100,
          stars: 3,
          achievements: [],
        },
      ];
      const updated = [
        {
          gameId: 'gomoku',
          currentLevel: 5,
          highScore: 1000,
          stars: 15,
          achievements: ['first_win'],
        },
        {
          gameId: 'memory',
          currentLevel: 3,
          highScore: 500,
          stars: 9,
          achievements: [],
        },
      ];
      store.setProgress(initial);
      store.setProgress(updated);
      expect(store.progressList).toEqual(updated);
      expect(store.progressList).toHaveLength(2);
    });

    it('should clear progress when given empty array', () => {
      const store = useGameStore();
      store.setProgress([
        {
          gameId: 'gomoku',
          currentLevel: 1,
          highScore: 100,
          stars: 3,
          achievements: [],
        },
      ]);
      store.setProgress([]);
      expect(store.progressList).toEqual([]);
    });
  });

  describe('updateProgress', () => {
    it('should update existing game progress', () => {
      const store = useGameStore();
      store.setProgress([
        {
          gameId: 'gomoku',
          currentLevel: 5,
          highScore: 1000,
          stars: 15,
          achievements: ['first_win'],
        },
      ]);

      store.updateProgress('gomoku', {
        currentLevel: 6,
        highScore: 1200,
        stars: 18,
      });

      const updated = store.getProgress('gomoku');
      expect(updated?.currentLevel).toBe(6);
      expect(updated?.highScore).toBe(1200);
      expect(updated?.stars).toBe(18);
      expect(updated?.achievements).toEqual(['first_win']); // unchanged
    });

    it('should add new game progress if not exists', () => {
      const store = useGameStore();
      store.updateProgress('puzzle', {
        currentLevel: 3,
        highScore: 800,
        stars: 9,
        achievements: ['speed_run'],
      });

      expect(store.progressList).toHaveLength(1);
      const progress = store.getProgress('puzzle');
      expect(progress?.gameId).toBe('puzzle');
      expect(progress?.currentLevel).toBe(3);
      expect(progress?.highScore).toBe(800);
      expect(progress?.stars).toBe(9);
      expect(progress?.achievements).toEqual(['speed_run']);
    });

    it('should use defaults when adding new game without all fields', () => {
      const store = useGameStore();
      store.updateProgress('newgame', {
        currentLevel: 1,
      });

      const progress = store.getProgress('newgame');
      expect(progress?.currentLevel).toBe(1);
      expect(progress?.highScore).toBe(0);
      expect(progress?.stars).toBe(0);
      expect(progress?.achievements).toEqual([]);
    });

    it('should merge partial updates for existing game', () => {
      const store = useGameStore();
      store.setProgress([
        {
          gameId: 'balloon',
          currentLevel: 2,
          highScore: 300,
          stars: 6,
          achievements: ['first_pop'],
          levelStars: { '1': 3 },
        },
      ]);

      store.updateProgress('balloon', {
        stars: 9,
        levelStars: { '1': 3, '2': 3 },
      });

      const updated = store.getProgress('balloon');
      expect(updated?.currentLevel).toBe(2); // unchanged
      expect(updated?.highScore).toBe(300); // unchanged
      expect(updated?.stars).toBe(9);
      expect(updated?.levelStars).toEqual({ '1': 3, '2': 3 });
    });

    it('should not affect other games when updating one', () => {
      const store = useGameStore();
      store.setProgress([
        {
          gameId: 'gomoku',
          currentLevel: 5,
          highScore: 1000,
          stars: 15,
          achievements: [],
        },
        {
          gameId: 'memory',
          currentLevel: 3,
          highScore: 500,
          stars: 9,
          achievements: [],
        },
      ]);

      store.updateProgress('gomoku', { currentLevel: 6 });

      expect(store.getProgress('gomoku')?.currentLevel).toBe(6);
      expect(store.getProgress('memory')?.currentLevel).toBe(3); // unchanged
    });
  });

  describe('getProgress', () => {
    it('should return progress for existing game', () => {
      const store = useGameStore();
      store.setProgress([
        {
          gameId: 'gomoku',
          currentLevel: 5,
          highScore: 1000,
          stars: 15,
          achievements: ['first_win'],
        },
      ]);

      const progress = store.getProgress('gomoku');
      expect(progress).toBeDefined();
      expect(progress?.gameId).toBe('gomoku');
      expect(progress?.currentLevel).toBe(5);
    });

    it('should return undefined for non-existing game', () => {
      const store = useGameStore();
      const progress = store.getProgress('nonexistent');
      expect(progress).toBeUndefined();
    });

    it('should return correct progress from multiple games', () => {
      const store = useGameStore();
      store.setProgress([
        {
          gameId: 'gomoku',
          currentLevel: 5,
          highScore: 1000,
          stars: 15,
          achievements: [],
        },
        {
          gameId: 'memory',
          currentLevel: 3,
          highScore: 500,
          stars: 9,
          achievements: [],
        },
        {
          gameId: 'puzzle',
          currentLevel: 7,
          highScore: 2000,
          stars: 21,
          achievements: [],
        },
      ]);

      expect(store.getProgress('memory')?.currentLevel).toBe(3);
      expect(store.getProgress('puzzle')?.currentLevel).toBe(7);
      expect(store.getProgress('gomoku')?.currentLevel).toBe(5);
    });
  });

  describe('levelStars', () => {
    it('should support optional levelStars field', () => {
      const store = useGameStore();
      store.setProgress([
        {
          gameId: 'math',
          currentLevel: 10,
          highScore: 5000,
          stars: 30,
          achievements: ['math_master'],
          levelStars: { '1': 3, '2': 2, '3': 1 },
        },
      ]);

      const progress = store.getProgress('math');
      expect(progress?.levelStars).toEqual({ '1': 3, '2': 2, '3': 1 });
    });

    it('should update levelStars independently', () => {
      const store = useGameStore();
      store.setProgress([
        {
          gameId: 'simon',
          currentLevel: 4,
          highScore: 1000,
          stars: 12,
          achievements: [],
          levelStars: { '1': 3, '2': 3 },
        },
      ]);

      store.updateProgress('simon', {
        levelStars: { '1': 3, '2': 3, '3': 2, '4': 1 },
      });

      const updated = store.getProgress('simon');
      expect(updated?.levelStars).toEqual({ '1': 3, '2': 3, '3': 2, '4': 1 });
    });
  });

  describe('edge cases', () => {
    it('should handle updating progress for game with special characters in id', () => {
      const store = useGameStore();
      store.updateProgress('game-with-dashes', {
        currentLevel: 1,
        highScore: 100,
        stars: 3,
      });

      expect(store.getProgress('game-with-dashes')).toBeDefined();
      expect(store.getProgress('game-with-dashes')?.gameId).toBe('game-with-dashes');
    });

    it('should handle multiple updates to same game', () => {
      const store = useGameStore();
      store.updateProgress('gomoku', { currentLevel: 1, highScore: 100, stars: 3 });
      store.updateProgress('gomoku', { currentLevel: 2, highScore: 200 });
      store.updateProgress('gomoku', { currentLevel: 3, highScore: 300 });

      const final = store.getProgress('gomoku');
      expect(final?.currentLevel).toBe(3);
      expect(final?.highScore).toBe(300);
      expect(final?.stars).toBe(3); // from first update
    });
  });
});
