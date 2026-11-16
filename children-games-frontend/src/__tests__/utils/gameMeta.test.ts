import { describe, it, expect } from 'vitest';
import { GAMES, getGameMeta, formatScore, type GameMeta } from '../../utils/gameMeta';

describe('gameMeta', () => {
  describe('GAMES 数组', () => {
    it('should export GAMES as array', () => {
      expect(Array.isArray(GAMES)).toBe(true);
      expect(GAMES.length).toBeGreaterThan(0);
    });

    it('should have all required games', () => {
      const gameIds = GAMES.map((g) => g.id);

      expect(gameIds).toContain('memory');
      expect(gameIds).toContain('fruit');
      expect(gameIds).toContain('puzzle');
      expect(gameIds).toContain('balloon');
      expect(gameIds).toContain('tank');
      expect(gameIds).toContain('math');
      expect(gameIds).toContain('sudoku');
      expect(gameIds).toContain('doudizhu');
    });

    it('should have unique game IDs', () => {
      const ids = GAMES.map((g) => g.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have valid totalLevels', () => {
      GAMES.forEach((game) => {
        expect(game.totalLevels).toBeGreaterThan(0);
        expect(Number.isInteger(game.totalLevels)).toBe(true);
      });
    });
  });

  describe('getGameMeta', () => {
    it('should return correct meta for existing game', () => {
      const meta = getGameMeta('memory');

      expect(meta).toBeDefined();
      expect(meta?.id).toBe('memory');
      expect(meta?.name).toBe('记忆翻牌');
      expect(meta?.totalLevels).toBe(20);
    });

    it('should return undefined for non-existing game', () => {
      const meta = getGameMeta('non-existing-game');

      expect(meta).toBeUndefined();
    });

    it('should return correct meta for each registered game', () => {
      GAMES.forEach((game) => {
        const meta = getGameMeta(game.id);
        expect(meta).toBeDefined();
        expect(meta?.id).toBe(game.id);
      });
    });
  });

  describe('formatScore', () => {
    it('should format score with template for memory game', () => {
      const result = formatScore('memory', 15);

      expect(result).toBe('最快 15 步');
    });

    it('should format score with template for fruit game', () => {
      const result = formatScore('fruit', 100);

      expect(result).toBe('最高 100 分');
    });

    it('should format score for math game (lower is better)', () => {
      const result = formatScore('math', 30);

      expect(result).toBe('最快 30 秒');
    });

    it('should return string value for unknown game', () => {
      const result = formatScore('unknown', 42);

      expect(result).toBe('42');
    });

    it('should handle zero value', () => {
      const result = formatScore('fruit', 0);

      expect(result).toBe('最高 0 分');
    });

    it('should handle large values', () => {
      const result = formatScore('doudizhu', 1000);

      expect(result).toBe('最高 1000 倍');
    });
  });

  describe('GameMeta 类型', () => {
    it('should support optional scoreLabel', () => {
      const meta: GameMeta = {
        id: 'test',
        name: '测试',
        totalLevels: 10,
      };

      expect(meta.scoreLabel).toBeUndefined();
    });

    it('should support optional lowerBetter flag', () => {
      const meta: GameMeta = {
        id: 'test',
        name: '测试',
        totalLevels: 10,
        lowerBetter: true,
      };

      expect(meta.lowerBetter).toBe(true);
    });

    it('should identify games with lower-is-better scoring', () => {
      const lowerBetterGames = GAMES.filter((g) => g.lowerBetter);

      expect(lowerBetterGames.length).toBeGreaterThan(0);
      lowerBetterGames.forEach((g) => {
        expect(g.scoreLabel).toContain('{v}');
      });
    });
  });

  describe('数据一致性', () => {
    it('all games should have scoreLabel defined', () => {
      const withScore = GAMES.filter((g) => g.scoreLabel);
      expect(withScore.length).toBe(GAMES.length);
    });

    it('all scoreLabels should contain {v} placeholder', () => {
      GAMES.forEach((game) => {
        expect(game.scoreLabel).toContain('{v}');
      });
    });
  });
});
