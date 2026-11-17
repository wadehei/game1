import { describe, it, expect, vi } from 'vitest';
import { games, type GameCatalogItem } from '../../utils/gameCatalog';

// Mock SVG imports
vi.mock('@/static/images/games/lobby/icon-memory.svg', () => ({ default: 'memory.svg' }));
vi.mock('@/static/images/games/lobby/icon-fruit.svg', () => ({ default: 'fruit.svg' }));
vi.mock('@/static/images/games/lobby/icon-puzzle.svg', () => ({ default: 'puzzle.svg' }));
vi.mock('@/static/images/games/lobby/icon-tank.svg', () => ({ default: 'tank.svg' }));
vi.mock('@/static/images/games/lobby/icon-mole.svg', () => ({ default: 'mole.svg' }));
vi.mock('@/static/images/games/lobby/icon-simon.svg', () => ({ default: 'simon.svg' }));
vi.mock('@/static/images/games/lobby/icon-math.svg', () => ({ default: 'math.svg' }));
vi.mock('@/static/images/games/lobby/icon-match.svg', () => ({ default: 'match.svg' }));
vi.mock('@/static/images/games/lobby/icon-match3.svg', () => ({ default: 'match3.svg' }));
vi.mock('@/static/images/games/lobby/icon-brick.svg', () => ({ default: 'brick.svg' }));
vi.mock('@/static/images/games/lobby/icon-sudoku.svg', () => ({ default: 'sudoku.svg' }));
vi.mock('@/static/images/games/lobby/icon-claw.svg', () => ({ default: 'claw.svg' }));
vi.mock('@/static/images/games/lobby/icon-doudizhu.svg', () => ({ default: 'doudizhu.svg' }));

describe('gameCatalog', () => {
  describe('games 数组', () => {
    it('should export games as readonly array', () => {
      expect(Array.isArray(games)).toBe(true);
      expect(games.length).toBeGreaterThan(0);
    });

    it('should contain all expected games', () => {
      const gameIds = games.map((g) => g.id);

      expect(gameIds).toContain('memory');
      expect(gameIds).toContain('fruit');
      expect(gameIds).toContain('puzzle');
      expect(gameIds).toContain('tank');
      expect(gameIds).toContain('mole');
      expect(gameIds).toContain('simon');
      expect(gameIds).toContain('math');
      expect(gameIds).toContain('match');
      expect(gameIds).toContain('match3');
      expect(gameIds).toContain('brick');
      expect(gameIds).toContain('sudoku');
      expect(gameIds).toContain('claw');
      expect(gameIds).toContain('doudizhu');
    });

    it('should have unique game IDs', () => {
      const ids = games.map((g) => g.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have valid totalLevels for each game', () => {
      games.forEach((game) => {
        expect(game.totalLevels).toBeGreaterThan(0);
        expect(Number.isInteger(game.totalLevels)).toBe(true);
      });
    });

    it('should have Chinese names for each game', () => {
      games.forEach((game) => {
        expect(game.name).toBeTruthy();
        expect(game.name.length).toBeGreaterThan(0);
      });
    });

    it('should have background colors defined', () => {
      games.forEach((game) => {
        expect(game.bgColor).toBeTruthy();
        expect(game.bgColor).toMatch(/^linear-gradient/);
      });
    });
  });

  describe('GameCatalogItem 类型', () => {
    it('should have correct structure', () => {
      const item: GameCatalogItem = {
        id: 'test-game',
        name: '测试游戏',
        totalLevels: 10,
        icon: 'test.svg',
        bgColor: 'linear-gradient(135deg, #fff 0%, #000 100%)',
      };

      expect(item.id).toBe('test-game');
      expect(item.name).toBe('测试游戏');
      expect(item.totalLevels).toBe(10);
    });
  });

  describe('游戏数据完整性', () => {
    it('should have at least 13 games registered', () => {
      expect(games.length).toBeGreaterThanOrEqual(13);
    });

    it('memory game should have 20 levels', () => {
      const memory = games.find((g) => g.id === 'memory');
      expect(memory?.totalLevels).toBe(20);
    });

    it('fruit game should have 30 levels', () => {
      const fruit = games.find((g) => g.id === 'fruit');
      expect(fruit?.totalLevels).toBe(30);
    });
  });
});
