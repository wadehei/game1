/**
 * useRoomEvents — 卧底游戏事件测试
 *
 * 覆盖：spy_phase, spy_deal, spy_vote_update, spy_vote_result, spy_eliminated, spy_final
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockWs, createMockContext, type MockWs, type MockCtx } from './helpers';

vi.mock('@/utils/sound', () => ({
  soundManager: {
    playClick: vi.fn(),
    playDeal: vi.fn(),
    playChip: vi.fn(),
    playFlip: vi.fn(),
    playSuccess: vi.fn(),
    playFail: vi.fn(),
  },
}));
vi.mock('@/utils/toastBus', () => ({
  showToast: vi.fn(),
}));

import { useRoomEvents } from '@/composables/useRoomEvents';
import type { SpyGameState } from '@/composables/wsTypes';

let ws: MockWs;
let ctx: MockCtx;

function createSpyState(): SpyGameState {
  return {
    round: 0,
    phase: 'waiting',
    deadline: 0,
    alive: [1, 2, 3, 4],
    me: null,
    eliminated: [],
    isRevote: false,
    revotePool: null,
    votedCount: 0,
    total: 4,
    pairCategory: '',
    ended: null,
  };
}

beforeEach(() => {
  ws = createMockWs();
  ctx = createMockContext();
  ctx.gameType.value = 'spy';
  useRoomEvents(ws as any, ctx).registerAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRoomEvents — spy events', () => {
  describe('spy_phase', () => {
    it('设置 gameEvents.phase 并更新 SpyGameState', () => {
      ctx.game.value = createSpyState();
      const m = {
        t: 'spy_phase' as const,
        phase: 'discuss',
        deadline: 30000,
        alive: [1, 2, 3],
        isRevote: false,
        revotePool: null,
      };
      ws.emit('spy_phase', m);

      expect(ctx.gameEvents.phase).toEqual(m);
      const s = ctx.game.value as SpyGameState;
      expect(s.phase).toBe('discuss');
      expect(s.deadline).toBe(30000);
      expect(s.alive).toEqual([1, 2, 3]);
      expect(s.isRevote).toBe(false);
      expect(s.revotePool).toBeNull();
      expect(s.votedCount).toBe(0);
      expect(s.total).toBe(3);
    });

    it('isRevote 为 true 时正确设置', () => {
      ctx.game.value = createSpyState();
      ws.emit('spy_phase', {
        t: 'spy_phase',
        phase: 'vote',
        deadline: 15000,
        alive: [1, 2],
        isRevote: true,
        revotePool: [1, 2],
      });
      const s = ctx.game.value as SpyGameState;
      expect(s.isRevote).toBe(true);
      expect(s.revotePool).toEqual([1, 2]);
    });

    it('game 为 null 时不抛异常', () => {
      ctx.game.value = null;
      expect(() =>
        ws.emit('spy_phase', {
          t: 'spy_phase',
          phase: 'x',
          deadline: 0,
          alive: [],
          isRevote: false,
          revotePool: null,
        })
      ).not.toThrow();
    });
  });

  describe('spy_deal', () => {
    it('设置 gameEvents.deal', () => {
      const m = { t: 'spy_deal' as const, role: 'spy', word: '苹果', pairCategory: '水果' };
      ws.emit('spy_deal', m);
      expect(ctx.gameEvents.deal).toEqual(m);
    });
  });

  describe('spy_vote_update', () => {
    it('设置 gameEvents.voteUpdate 并更新 SpyGameState', () => {
      ctx.game.value = createSpyState();
      const m = { t: 'spy_vote_update' as const, votedCount: 2, total: 4 };
      ws.emit('spy_vote_update', m);

      expect(ctx.gameEvents.voteUpdate).toEqual(m);
      const s = ctx.game.value as SpyGameState;
      expect(s.votedCount).toBe(2);
      expect(s.total).toBe(4);
    });
  });

  describe('spy_vote_result', () => {
    it('设置 gameEvents.voteResult', () => {
      const m = {
        t: 'spy_vote_result' as const,
        counts: [{ target: 2, count: 3 }],
        out: 2,
        outRole: 'spy',
      };
      ws.emit('spy_vote_result', m);
      expect(ctx.gameEvents.voteResult).toEqual(m);
    });
  });

  describe('spy_eliminated', () => {
    it('设置 gameEvents.eliminated', () => {
      const m = { t: 'spy_eliminated' as const, userId: 2, role: 'spy' };
      ws.emit('spy_eliminated', m);
      expect(ctx.gameEvents.eliminated).toEqual(m);
    });
  });

  describe('spy_final', () => {
    it('设置 final 并将 phase 设为 ended', () => {
      const f = {
        t: 'spy_final' as const,
        winner: 'spy' as const,
        spyWord: '苹果',
        civilianWord: '香蕉',
        spies: [2],
      };
      ws.emit('spy_final', f);
      expect(ctx.gameEvents.final).toEqual(f);
      expect(ctx.phase.value).toBe('ended');
    });
  });
});
