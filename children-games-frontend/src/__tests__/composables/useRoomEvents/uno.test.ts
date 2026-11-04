/**
 * useRoomEvents — UNO 事件测试
 *
 * 覆盖：uno_state, uno_turn, uno_played, uno_hand, uno_drew, uno_final
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
import type { UnoGameState } from '@/composables/wsTypes';

let ws: MockWs;
let ctx: MockCtx;

function createUnoState(): UnoGameState {
  return {
    top: null,
    currentColor: 'red',
    direction: 1,
    turnSeat: 0,
    counts: [],
    myHand: [],
    ranking: null,
    ended: null,
  };
}

beforeEach(() => {
  ws = createMockWs();
  ctx = createMockContext();
  ctx.gameType.value = 'uno';
  useRoomEvents(ws as any, ctx).registerAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRoomEvents — uno events', () => {
  describe('uno_state', () => {
    it('设置 gameEvents.uno_state 和 turn，更新 UnoGameState', () => {
      ctx.game.value = createUnoState();
      const m = {
        t: 'uno_state' as const,
        top: { id: 'r3', color: 'red', kind: 'number' },
        currentColor: 'red',
        direction: 1 as const,
        turnSeat: 2,
        counts: [{ userId: 1, count: 5 }],
      };
      ws.emit('uno_state', m);

      expect(ctx.gameEvents.uno_state).toEqual(m);
      expect(ctx.gameEvents.turn).toMatchObject({ seat: 2 });
      expect((ctx.gameEvents.turn as any).seq).toBeTypeOf('number');

      const s = ctx.game.value as UnoGameState;
      expect(s.top).toEqual(m.top);
      expect(s.currentColor).toBe('red');
      expect(s.direction).toBe(1);
      expect(s.turnSeat).toBe(2);
      expect(s.counts).toEqual(m.counts);
    });

    it('game 为 null 时不抛异常', () => {
      ctx.game.value = null;
      expect(() =>
        ws.emit('uno_state', {
          t: 'uno_state',
          top: null,
          currentColor: 'blue',
          direction: -1,
          turnSeat: 0,
          counts: [],
        })
      ).not.toThrow();
    });
  });

  describe('uno_turn', () => {
    it('设置 gameEvents.turn 并更新 turnSeat', () => {
      ctx.game.value = createUnoState();
      ws.emit('uno_turn', { t: 'uno_turn', seat: 3, deadline: 15000 });
      expect(ctx.gameEvents.turn).toMatchObject({ seat: 3 });
      expect((ctx.game.value as UnoGameState).turnSeat).toBe(3);
    });
  });

  describe('uno_played', () => {
    it('设置 gameEvents.uno_played 并更新 top 和 currentColor', () => {
      ctx.game.value = createUnoState();
      const card = { id: 'b5', color: 'blue', kind: 'number' };
      ws.emit('uno_played', { t: 'uno_played', userId: 2, card, chooseColor: 'blue' });

      expect(ctx.gameEvents.uno_played).toBeTruthy();
      const s = ctx.game.value as UnoGameState;
      expect(s.top).toEqual(card);
      expect(s.currentColor).toBe('blue');
    });

    it('chooseColor 为 null 时不更新 currentColor', () => {
      ctx.game.value = createUnoState();
      ctx.game.value.currentColor = 'red';
      ws.emit('uno_played', {
        t: 'uno_played',
        userId: 2,
        card: { id: 'r1', color: 'red', kind: 'number' },
        chooseColor: null,
      });
      expect((ctx.game.value as UnoGameState).currentColor).toBe('red');
    });
  });

  describe('uno_hand', () => {
    it('设置 gameEvents.uno_hand', () => {
      const hand = { cards: [{ id: 'r1', color: 'red', kind: 'number' }] };
      ws.emit('uno_hand', { t: 'uno_hand', ...hand });
      expect(ctx.gameEvents.uno_hand).toMatchObject(hand);
    });
  });

  describe('uno_drew', () => {
    it('设置 gameEvents.drew 带 seq', () => {
      ws.emit('uno_drew', { t: 'uno_drew', userId: 3 });
      expect(ctx.gameEvents.drew).toMatchObject({ userId: 3 });
      expect((ctx.gameEvents.drew as any).seq).toBeTypeOf('number');
    });
  });

  describe('uno_final', () => {
    it('设置 final 并将 phase 设为 ended', () => {
      const f = { t: 'uno_final' as const, ranking: [{ userId: 1, nickname: 'A', penalty: 10 }] };
      ws.emit('uno_final', f);
      expect(ctx.gameEvents.final).toEqual(f);
      expect(ctx.phase.value).toBe('ended');
    });
  });
});
