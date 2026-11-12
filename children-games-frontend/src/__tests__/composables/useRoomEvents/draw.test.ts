/**
 * useRoomEvents — 你画我猜事件测试
 *
 * 覆盖：draw_round, guess_result, draw_candidates, draw_word, draw_hint,
 *       draw_stroke, draw_undo, draw_clear, draw_round_end, draw_final
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
import type { DrawGameState } from '@/composables/wsTypes';

let ws: MockWs;
let ctx: MockCtx;

function createDrawState(): DrawGameState {
  return {
    phase: 'waiting',
    drawerSeat: -1,
    isDrawer: false,
    round: 0,
    totalRounds: 0,
    deadline: 0,
    wordLen: 0,
    category: '',
    word: null,
    strokes: [],
    myGuessed: false,
    guessedUserIds: [],
    scores: [],
    ended: null,
  };
}

beforeEach(() => {
  ws = createMockWs();
  ctx = createMockContext();
  ctx.gameType.value = 'draw';
  useRoomEvents(ws as any, ctx).registerAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRoomEvents — draw events', () => {
  describe('draw_round', () => {
    it('设置 gameEvents.round 并重置 stroke/final/hint/guessResult', () => {
      ctx.gameEvents.stroke = { old: true };
      ctx.gameEvents.final = { old: true } as any;
      ctx.gameEvents.hint = { old: true };
      ctx.gameEvents.guessResult = [{ old: true }];

      const m = {
        t: 'draw_round' as const,
        phase: 'playing',
        drawerSeat: 2,
        round: 1,
        totalRounds: 3,
        deadline: 90000,
        wordLen: 5,
        category: '动物',
      };
      ws.emit('draw_round', m);

      expect(ctx.gameEvents.round).toMatchObject(m);
      expect((ctx.gameEvents.round as any).ts).toBeTypeOf('number');
      expect(ctx.gameEvents.stroke).toBeNull();
      expect(ctx.gameEvents.final).toBeNull();
      expect(ctx.gameEvents.hint).toBeNull();
      expect(ctx.gameEvents.guessResult).toEqual([]);
    });

    it('更新 DrawGameState', () => {
      ctx.game.value = createDrawState();
      const m = {
        t: 'draw_round' as const,
        phase: 'playing',
        drawerSeat: 0,
        round: 2,
        totalRounds: 4,
        deadline: 60000,
        wordLen: 3,
        category: '水果',
      };
      ws.emit('draw_round', m);

      const s = ctx.game.value as DrawGameState;
      expect(s.phase).toBe('playing');
      expect(s.drawerSeat).toBe(0);
      expect(s.isDrawer).toBe(true); // mySeat=0, drawerSeat=0
      expect(s.round).toBe(2);
      expect(s.totalRounds).toBe(4);
      expect(s.deadline).toBe(60000);
      expect(s.wordLen).toBe(3);
      expect(s.category).toBe('水果');
      expect(s.word).toBeNull();
      expect(s.strokes).toEqual([]);
      expect(s.myGuessed).toBe(false);
    });

    it('mySeat !== drawerSeat 时 isDrawer=false', () => {
      ctx.game.value = createDrawState();
      ws.emit('draw_round', {
        t: 'draw_round',
        phase: 'playing',
        drawerSeat: 5,
        round: 1,
        totalRounds: 2,
        deadline: 0,
        wordLen: 0,
        category: '',
      });
      expect((ctx.game.value as DrawGameState).isDrawer).toBe(false);
    });
  });

  describe('guess_result', () => {
    beforeEach(() => {
      ctx.game.value = createDrawState();
      ctx.gameEvents.guessResult = [];
    });

    it('追加到 guessResult 列表', () => {
      ws.emit('guess_result', { userId: 2, text: '猫', correct: true });
      expect(ctx.gameEvents.guessResult).toHaveLength(1);
    });

    it('自己是猜对者时更新 myGuessed 和 guessedUserIds', () => {
      ctx.myId.value = 1;
      ws.emit('guess_result', { userId: 1, text: '猫', correct: true });
      const s = ctx.game.value as DrawGameState;
      expect(s.myGuessed).toBe(true);
      expect(s.guessedUserIds).toContain(1);
    });

    it('他人猜对不影响 myGuessed', () => {
      ctx.myId.value = 1;
      ws.emit('guess_result', { userId: 99, text: '狗', correct: true });
      expect((ctx.game.value as DrawGameState).myGuessed).toBe(false);
    });

    it('guessResult 为 null 时初始化为数组', () => {
      ctx.gameEvents.guessResult = null;
      ws.emit('guess_result', { userId: 2, text: '鱼', correct: false });
      expect(Array.isArray(ctx.gameEvents.guessResult)).toBe(true);
    });
  });

  describe('draw_candidates', () => {
    it('设置 candidates', () => {
      ws.emit('draw_candidates', { words: ['猫', '狗', '鸟'] });
      expect(ctx.gameEvents.candidates).toEqual(['猫', '狗', '鸟']);
    });
  });

  describe('draw_word', () => {
    it('设置 game.word', () => {
      ctx.game.value = createDrawState();
      ws.emit('draw_word', { word: '向日葵' });
      expect((ctx.game.value as DrawGameState).word).toBe('向日葵');
    });

    it('game 为 null 时不抛异常', () => {
      ctx.game.value = null;
      expect(() => ws.emit('draw_word', { word: 'X' })).not.toThrow();
    });
  });

  describe('draw_hint', () => {
    it('设置 gameEvents.hint', () => {
      const hint = { letter: '猫', index: 0 };
      ws.emit('draw_hint', hint);
      expect(ctx.gameEvents.hint).toEqual(hint);
    });
  });

  describe('draw_stroke', () => {
    it('设置 gameEvents.stroke', () => {
      const stroke = {
        seq: 1,
        points: [
          [0, 0],
          [1, 1],
        ],
        color: '#000',
        width: 2,
      };
      ws.emit('draw_stroke', stroke);
      expect(ctx.gameEvents.stroke).toEqual(stroke);
    });
  });

  describe('draw_undo', () => {
    it('设置 gameEvents.undo 带时间戳', () => {
      ws.emit('draw_undo', {});
      expect(ctx.gameEvents.undo).toBeTruthy();
      expect((ctx.gameEvents.undo as any).ts).toBeTypeOf('number');
    });
  });

  describe('draw_clear', () => {
    it('设置 gameEvents.clear 带时间戳', () => {
      ws.emit('draw_clear', {});
      expect(ctx.gameEvents.clear).toBeTruthy();
      expect((ctx.gameEvents.clear as any).ts).toBeTypeOf('number');
    });
  });

  describe('draw_round_end', () => {
    it('设置 gameEvents.roundEnd', () => {
      const m = { round: 1, answer: '猫' };
      ws.emit('draw_round_end', m);
      expect(ctx.gameEvents.roundEnd).toEqual(m);
    });
  });

  describe('draw_final', () => {
    it('设置 final 并将 phase 设为 ended', () => {
      const f = { t: 'draw_final' as const, ranking: [{ userId: 1, nickname: 'A', total: 50 }] };
      ws.emit('draw_final', f);
      expect(ctx.gameEvents.final).toEqual(f);
      expect(ctx.phase.value).toBe('ended');
    });
  });
});
