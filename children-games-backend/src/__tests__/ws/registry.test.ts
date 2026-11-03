import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getHandler, gameList, gameHandlers } from '../../ws/games/registry';
import type { GameType } from '../../ws/games/types';

describe('game registry', () => {
  describe('getHandler', () => {
    it('should return handler for all registered game types', () => {
      const types: GameType[] = ['gomoku', 'quiz', 'draw', 'spy', 'uno', 'blackjack', 'zjh'];
      for (const type of types) {
        const handler = getHandler(type);
        expect(handler).toBeDefined();
        expect(handler.type).toBe(type);
      }
    });

    it('should throw for unregistered game type', () => {
      expect(() => getHandler('chess' as GameType)).toThrow('未注册的游戏类型');
    });
  });

  describe('gameList', () => {
    it('should return info for all 7 games', () => {
      const list = gameList();
      expect(list.length).toBe(7);
    });

    it('should include required fields for each game', () => {
      const list = gameList();
      for (const game of list) {
        expect(game.type).toBeDefined();
        expect(game.title).toBeTruthy();
        expect(game.emoji).toBeTruthy();
        expect(game.desc).toBeTruthy();
        expect(game.minPlayers).toBeGreaterThan(0);
        expect(game.maxPlayers).toBeGreaterThanOrEqual(game.minPlayers);
      }
    });

    it('should not expose internal handler methods', () => {
      const list = gameList();
      for (const game of list) {
        expect((game as any).create).toBeUndefined();
        expect((game as any).onAction).toBeUndefined();
        expect((game as any).serializeFor).toBeUndefined();
      }
    });
  });

  describe('gameHandlers', () => {
    it('should have matching type field', () => {
      for (const [key, handler] of Object.entries(gameHandlers)) {
        expect(handler!.type).toBe(key);
      }
    });

    it('each handler should create initial game state', () => {
      for (const handler of Object.values(gameHandlers)) {
        const state = handler!.create();
        expect(state).toBeDefined();
      }
    });
  });
});
