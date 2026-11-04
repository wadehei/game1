/**
 * useRoomEvents — 答题对战事件测试
 *
 * 覆盖：quiz_question, quiz_result, quiz_final
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

let ws: MockWs;
let ctx: MockCtx;

beforeEach(() => {
  ws = createMockWs();
  ctx = createMockContext();
  useRoomEvents(ws as any, ctx).registerAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRoomEvents — quiz events', () => {
  describe('quiz_question', () => {
    it('设置 gameEvents.question，清空 result 和 final', () => {
      ctx.gameEvents.result = { t: 'quiz_result', qid: 1, answer: 0, delta: [] } as any;
      ctx.gameEvents.final = { t: 'quiz_final', ranking: [] } as any;

      const q = {
        t: 'quiz_question' as const,
        index: 0,
        total: 10,
        qid: 42,
        text: '1+1=?',
        options: ['1', '2'],
        deadline: 17000,
      };
      ws.emit('quiz_question', q);

      expect(ctx.gameEvents.question).toEqual(q);
      expect(ctx.gameEvents.result).toBeNull();
      expect(ctx.gameEvents.final).toBeNull();
    });
  });

  describe('quiz_result', () => {
    it('设置 gameEvents.result', () => {
      const r = {
        t: 'quiz_result' as const,
        qid: 42,
        answer: 1,
        delta: [{ userId: 1, gained: 10, total: 10 }],
      };
      ws.emit('quiz_result', r);
      expect(ctx.gameEvents.result).toEqual(r);
    });
  });

  describe('quiz_final', () => {
    it('设置 gameEvents.final', () => {
      const f = { t: 'quiz_final' as const, ranking: [{ userId: 1, nickname: 'A', total: 100 }] };
      ws.emit('quiz_final', f);
      expect(ctx.gameEvents.final).toEqual(f);
    });
  });

  describe('完整答题流程', () => {
    it('question → result → question → result → final', () => {
      const q1 = {
        t: 'quiz_question' as const,
        index: 0,
        total: 2,
        qid: 1,
        text: 'Q1',
        options: ['A', 'B'],
        deadline: 100,
      };
      ws.emit('quiz_question', q1);
      expect(ctx.gameEvents.question).toEqual(q1);

      const r1 = {
        t: 'quiz_result' as const,
        qid: 1,
        answer: 0,
        delta: [{ userId: 1, gained: 10, total: 10 }],
      };
      ws.emit('quiz_result', r1);
      expect(ctx.gameEvents.result).toEqual(r1);

      const q2 = {
        t: 'quiz_question' as const,
        index: 1,
        total: 2,
        qid: 2,
        text: 'Q2',
        options: ['C', 'D'],
        deadline: 200,
      };
      ws.emit('quiz_question', q2);
      expect(ctx.gameEvents.question).toEqual(q2);
      expect(ctx.gameEvents.result).toBeNull();

      const r2 = {
        t: 'quiz_result' as const,
        qid: 2,
        answer: 1,
        delta: [{ userId: 1, gained: 5, total: 15 }],
      };
      ws.emit('quiz_result', r2);
      expect(ctx.gameEvents.result).toEqual(r2);

      const f = { t: 'quiz_final' as const, ranking: [{ userId: 1, nickname: 'A', total: 15 }] };
      ws.emit('quiz_final', f);
      expect(ctx.gameEvents.final).toEqual(f);
    });
  });
});
