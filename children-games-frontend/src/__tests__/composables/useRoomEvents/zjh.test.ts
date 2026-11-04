/**
 * useRoomEvents — 炸金花事件测试
 *
 * 覆盖：zjh_phase, zjh_your_cards, zjh_action (look/call/fold),
 *       zjh_compare, zjh_compare_cards, zjh_showdown, zjh_settle, zjh_final
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

import { soundManager } from '@/utils/sound';
import { useRoomEvents } from '@/composables/useRoomEvents';
import type { ZjhGameState } from '@/composables/wsTypes';

let ws: MockWs;
let ctx: MockCtx;

function createZjhState(): ZjhGameState {
  return {
    round: 0,
    totalRounds: 0,
    phase: 'waiting',
    dealerSeat: -1,
    pot: 0,
    stake: 10,
    roundNo: 0,
    turnSeat: -1,
    deadline: 0,
    aliveCount: 0,
    chips: [],
    entrants: [],
    myCards: null,
    mySeen: false,
    myFolded: false,
    myAllIn: false,
    myBetTotal: 10,
    myRank: null,
    myChips: 0,
    others: [],
    betLedger: [],
    compareLog: [],
  };
}

beforeEach(() => {
  ws = createMockWs();
  ctx = createMockContext();
  ctx.gameType.value = 'zjh';
  ctx.myId.value = 1;
  ctx.members.value = [
    { userId: 1, nickname: 'Me', seat: 0, avatar: '🦊', ready: true, online: true },
    { userId: 2, nickname: 'B', seat: 1, avatar: '🐱', ready: true, online: true },
    { userId: 3, nickname: 'C', seat: -1, avatar: '🐶', ready: true, online: true },
  ];
  useRoomEvents(ws as any, ctx).registerAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRoomEvents — zjh events', () => {
  describe('zjh_phase', () => {
    it('更新 ZjhGameState 字段', () => {
      ctx.game.value = createZjhState();
      ws.emit('zjh_phase', {
        t: 'zjh_phase',
        round: 1,
        totalRounds: 5,
        phase: 'betting',
        dealerSeat: 0,
        pot: 30,
        stake: 10,
        roundNo: 1,
        turnSeat: 1,
        deadline: 15000,
        compareMinRound: 3,
        aliveCount: 3,
        entrants: [1, 2, 3],
        chips: [{ userId: 1, chips: 100 }],
        raiseSteps: [10, 20, 40],
        stakeCap: 100,
      });
      const s = ctx.game.value as ZjhGameState;
      expect(s.round).toBe(1);
      expect(s.phase).toBe('betting');
      expect(s.dealerSeat).toBe(0);
      expect(s.raiseSteps).toEqual([10, 20, 40]);
      expect(s.stakeCap).toBe(100);
    });

    it('新一轮 betting 时重置我的状态和 others', () => {
      ctx.game.value = {
        ...createZjhState(),
        round: 0,
        myCards: ['As', 'Kd'],
        mySeen: true,
        myFolded: true,
        myAllIn: true,
        myBetTotal: 50,
        myRank: 'shunjin',
        others: [
          {
            userId: 2,
            nickname: 'B',
            seat: 1,
            seen: true,
            folded: false,
            allIn: false,
            betTotal: 30,
          },
        ],
      };
      ctx.gameEvents.showdown = { old: true };
      ctx.gameEvents.settle = { old: true };
      ctx.gameEvents.compareCards = { old: true };

      ws.emit('zjh_phase', {
        t: 'zjh_phase',
        round: 1,
        totalRounds: 5,
        phase: 'betting',
        dealerSeat: 0,
        pot: 0,
        stake: 10,
        roundNo: 1,
        turnSeat: 1,
        deadline: 0,
        compareMinRound: 3,
        aliveCount: 3,
        entrants: [1, 2, 3],
        chips: [],
        raiseSteps: [],
        stakeCap: 0,
      });
      const s = ctx.game.value as ZjhGameState;
      expect(s.myCards).toBeNull();
      expect(s.mySeen).toBe(false);
      expect(s.myFolded).toBe(false);
      expect(s.myAllIn).toBe(false);
      expect(s.myBetTotal).toBe(10);
      expect(s.myRank).toBeNull();
      expect(s.others).toHaveLength(1); // userId 2 only (seat=-1 excluded)
      expect(ctx.gameEvents.showdown).toBeNull();
      expect(ctx.gameEvents.settle).toBeNull();
      expect(ctx.gameEvents.compareCards).toBeNull();
    });

    it('新一轮时写入 entrants 到 betLedger', () => {
      ctx.game.value = createZjhState();
      ws.emit('zjh_phase', {
        t: 'zjh_phase',
        round: 1,
        totalRounds: 5,
        phase: 'betting',
        dealerSeat: 0,
        pot: 0,
        stake: 10,
        roundNo: 1,
        turnSeat: 1,
        deadline: 0,
        compareMinRound: 3,
        aliveCount: 3,
        entrants: [1, 2, 3],
        chips: [],
        raiseSteps: [],
        stakeCap: 0,
      });
      expect(ctx.game.value!.betLedger).toHaveLength(3);
      expect(ctx.game.value!.betLedger![0]).toMatchObject({ userId: 1, round: 1, betTotal: 10 });
    });

    it('game 为 null 时不抛异常', () => {
      ctx.game.value = null;
      expect(() =>
        ws.emit('zjh_phase', {
          t: 'zjh_phase',
          round: 1,
          totalRounds: 5,
          phase: 'betting',
          dealerSeat: 0,
          pot: 0,
          stake: 10,
          roundNo: 1,
          turnSeat: 1,
          deadline: 0,
          compareMinRound: 3,
          aliveCount: 3,
          entrants: [],
          chips: [],
          raiseSteps: [],
          stakeCap: 0,
        })
      ).not.toThrow();
    });
  });

  describe('zjh_your_cards', () => {
    it('设置 myCards/mySeen/myRank 并播放 flip 音效', () => {
      ctx.game.value = createZjhState();
      ws.emit('zjh_your_cards', {
        t: 'zjh_your_cards',
        cards: ['As', 'Kd', 'Qh'],
        rank: 'shunjin',
      });
      const s = ctx.game.value as ZjhGameState;
      expect(s.myCards).toEqual(['As', 'Kd', 'Qh']);
      expect(s.mySeen).toBe(true);
      expect(s.myRank).toBe('shunjin');
      expect(soundManager.playFlip).toHaveBeenCalled();
    });

    it('game 为 null 时不抛异常', () => {
      ctx.game.value = null;
      expect(() =>
        ws.emit('zjh_your_cards', { t: 'zjh_your_cards', cards: [], rank: '' })
      ).not.toThrow();
    });
  });

  describe('zjh_action', () => {
    beforeEach(() => {
      ctx.game.value = {
        ...createZjhState(),
        round: 1,
        phase: 'betting',
        pot: 30,
        stake: 10,
        others: [
          {
            userId: 2,
            nickname: 'B',
            seat: 1,
            seen: false,
            folded: false,
            allIn: false,
            betTotal: 10,
          },
          {
            userId: 3,
            nickname: 'C',
            seat: 2,
            seen: false,
            folded: false,
            allIn: false,
            betTotal: 10,
          },
        ],
        betLedger: [
          { userId: 2, round: 1, betTotal: 10, delta: null, ended: null },
          { userId: 3, round: 1, betTotal: 10, delta: null, ended: null },
        ],
      };
    });

    it('look: 设置对应 other 的 seen=true', () => {
      ws.emit('zjh_action', { t: 'zjh_action', userId: 2, action: 'look' });
      expect((ctx.game.value as ZjhGameState).others![0].seen).toBe(true);
    });

    it('call: 更新 pot/stake/betTotal/betLedger，播放 chip 音效', () => {
      ws.emit('zjh_action', {
        t: 'zjh_action',
        userId: 2,
        action: 'call',
        pot: 40,
        stake: 10,
        cost: 10,
      });
      expect(soundManager.playChip).toHaveBeenCalled();
      expect((ctx.game.value as ZjhGameState).pot).toBe(40);
      expect((ctx.game.value as ZjhGameState).others![0].betTotal).toBe(20);
      expect((ctx.game.value as ZjhGameState).betLedger![0].betTotal).toBe(20);
    });

    it('call allIn: 设置 allIn=true', () => {
      ws.emit('zjh_action', {
        t: 'zjh_action',
        userId: 2,
        action: 'call',
        pot: 100,
        stake: 10,
        cost: 50,
        allIn: true,
      });
      expect((ctx.game.value as ZjhGameState).others![0].allIn).toBe(true);
    });

    it('fold: 设置 folded=true', () => {
      ws.emit('zjh_action', { t: 'zjh_action', userId: 2, action: 'fold', aliveCount: 2 });
      expect((ctx.game.value as ZjhGameState).others![0].folded).toBe(true);
      expect((ctx.game.value as ZjhGameState).aliveCount).toBe(2);
    });

    it('自己 fold: 设置 myFolded=true', () => {
      ws.emit('zjh_action', { t: 'zjh_action', userId: 1, action: 'fold', aliveCount: 2 });
      expect((ctx.game.value as ZjhGameState).myFolded).toBe(true);
    });

    it('timeout_fold: 等同于 fold', () => {
      ws.emit('zjh_action', { t: 'zjh_action', userId: 3, action: 'timeout_fold', aliveCount: 2 });
      expect((ctx.game.value as ZjhGameState).others![1].folded).toBe(true);
    });

    it('timeout_call: 等同于 call', () => {
      ws.emit('zjh_action', {
        t: 'zjh_action',
        userId: 2,
        action: 'timeout_call',
        pot: 40,
        stake: 10,
        cost: 10,
      });
      expect((ctx.game.value as ZjhGameState).others![0].betTotal).toBe(20);
    });

    it('game 为 null 时不抛异常', () => {
      ctx.game.value = null;
      expect(() =>
        ws.emit('zjh_action', { t: 'zjh_action', userId: 2, action: 'look' })
      ).not.toThrow();
    });
  });

  describe('zjh_compare', () => {
    beforeEach(() => {
      ctx.game.value = {
        ...createZjhState(),
        round: 1,
        pot: 50,
        aliveCount: 3,
        others: [
          {
            userId: 2,
            nickname: 'B',
            seat: 1,
            seen: false,
            folded: false,
            allIn: false,
            betTotal: 20,
          },
          {
            userId: 3,
            nickname: 'C',
            seat: 2,
            seen: false,
            folded: false,
            allIn: false,
            betTotal: 20,
          },
        ],
        betLedger: [
          { userId: 2, round: 1, betTotal: 20, delta: null, ended: null },
          { userId: 3, round: 1, betTotal: 20, delta: null, ended: null },
        ],
        compareLog: [],
      };
    });

    it('设置 compare 事件，更新 loser/winner 状态', () => {
      ws.emit('zjh_compare', {
        t: 'zjh_compare',
        from: 2,
        to: 3,
        winner: 2,
        loser: 3,
        pot: 60,
        aliveCount: 2,
        cost: 10,
      });
      expect((ctx.game.value as ZjhGameState).others![1].folded).toBe(true); // loser
      expect((ctx.game.value as ZjhGameState).others![0].seen).toBe(true); // winner
      expect(ctx.gameEvents.compare).toBeTruthy();
      expect(ctx.gameEvents.yanpai).toMatchObject({ from: 2, to: 3 });
    });

    it('自己是 loser 时 myFolded=true', () => {
      ws.emit('zjh_compare', {
        t: 'zjh_compare',
        from: 1,
        to: 2,
        winner: 2,
        loser: 1,
        pot: 60,
        aliveCount: 2,
        cost: 10,
      });
      expect((ctx.game.value as ZjhGameState).myFolded).toBe(true);
    });

    it('更新 betLedger 的 betTotal', () => {
      ws.emit('zjh_compare', {
        t: 'zjh_compare',
        from: 2,
        to: 3,
        winner: 2,
        loser: 3,
        pot: 60,
        aliveCount: 2,
        cost: 10,
      });
      expect((ctx.game.value as ZjhGameState).betLedger![0].betTotal).toBe(30);
    });

    it('追加 compareLog', () => {
      ws.emit('zjh_compare', {
        t: 'zjh_compare',
        from: 2,
        to: 3,
        winner: 2,
        loser: 3,
        pot: 60,
        aliveCount: 2,
        cost: 10,
      });
      expect((ctx.game.value as ZjhGameState).compareLog).toHaveLength(1);
      expect((ctx.game.value as ZjhGameState).compareLog![0]).toMatchObject({
        round: 1,
        from: 2,
        to: 3,
        winner: 2,
      });
    });
  });

  describe('zjh_compare_cards', () => {
    it('设置 gameEvents.compareCards', () => {
      const m = {
        t: 'zjh_compare_cards' as const,
        from: 1,
        to: 2,
        fromCards: ['As'],
        toCards: ['Kd'],
      };
      ws.emit('zjh_compare_cards', m);
      expect(ctx.gameEvents.compareCards).toEqual(m);
    });
  });

  describe('zjh_showdown', () => {
    it('设置 showdown 并更新 phase', () => {
      ctx.game.value = createZjhState();
      const m = { t: 'zjh_showdown' as const, hands: [{ userId: 1, cards: ['As', 'Kd'] }] };
      ws.emit('zjh_showdown', m);
      expect(ctx.gameEvents.showdown).toEqual(m);
      expect((ctx.game.value as ZjhGameState).phase).toBe('showdown');
    });
  });

  describe('zjh_settle', () => {
    it('更新 pot/phase/chips/betLedger，播放对应音效', () => {
      ctx.game.value = {
        ...createZjhState(),
        round: 1,
        pot: 100,
        phase: 'showdown',
        others: [
          {
            userId: 2,
            nickname: 'B',
            seat: 1,
            seen: true,
            folded: false,
            allIn: false,
            betTotal: 30,
          },
        ],
        betLedger: [
          { userId: 1, round: 1, betTotal: 30, delta: null, ended: null },
          { userId: 2, round: 1, betTotal: 30, delta: null, ended: null },
        ],
      };
      ws.emit('zjh_settle', {
        t: 'zjh_settle',
        round: 1,
        winner: 1,
        deltas: [
          { userId: 1, delta: 80, chips: 180 },
          { userId: 2, delta: -30, chips: 70 },
        ],
        nextDeadline: 5000,
      });
      const s = ctx.game.value as ZjhGameState;
      expect(s.pot).toBe(0);
      expect(s.phase).toBe('settle');
      expect(s.nextDeadline).toBe(5000);
      expect(s.myChips).toBe(180);
      expect(s.betLedger![0].delta).toBe(80);
      expect(s.betLedger![0].ended).toBe('win');
      expect(s.betLedger![1].delta).toBe(-30);
      expect(s.betLedger![1].ended).toBe('showdown');
      expect(soundManager.playSuccess).toHaveBeenCalled();
    });

    it('输时播放 fail 音效', () => {
      ctx.game.value = createZjhState();
      ws.emit('zjh_settle', {
        t: 'zjh_settle',
        round: 1,
        winner: 2,
        deltas: [{ userId: 1, delta: -20, chips: 80 }],
        nextDeadline: 0,
      });
      expect(soundManager.playFail).toHaveBeenCalled();
    });
  });

  describe('zjh_final', () => {
    it('设置 final 并将 phase 设为 ended', () => {
      const f = { t: 'zjh_final' as const, ranking: [{ userId: 1, nickname: 'Me', chips: 300 }] };
      ws.emit('zjh_final', f);
      expect(ctx.gameEvents.final).toEqual(f);
      expect(ctx.phase.value).toBe('ended');
    });
  });
});
