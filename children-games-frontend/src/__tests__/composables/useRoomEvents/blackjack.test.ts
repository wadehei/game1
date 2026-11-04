/**
 * useRoomEvents — 21点事件测试
 *
 * 覆盖：blackjack_phase, blackjack_deal, blackjack_your_banker,
 *       blackjack_action (hit/double/stand/bet/banker_hit), blackjack_settle, blackjack_final
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
import type { BlackjackGameState } from '@/composables/wsTypes';

let ws: MockWs;
let ctx: MockCtx;

function createBjState(): BlackjackGameState {
  return {
    round: 0,
    totalRounds: 0,
    phase: 'waiting',
    bankerSeat: -1,
    turnSeat: -1,
    deadline: 0,
    chips: [],
    canPassBank: false,
    isBanker: false,
    myCards: [],
    myStake: 0,
    myDone: false,
    myBusted: false,
    myNatural: false,
    myDoubled: false,
    bankerCards: [],
    bankerValue: null,
    lastResults: null,
    betLedger: [],
  };
}

beforeEach(() => {
  ws = createMockWs();
  ctx = createMockContext();
  ctx.gameType.value = 'blackjack';
  ctx.members.value = [
    { userId: 1, nickname: 'Me', seat: 0, avatar: '🦊', ready: true, online: true },
    { userId: 2, nickname: 'Other', seat: 1, avatar: '🐱', ready: true, online: true },
  ];
  useRoomEvents(ws as any, ctx).registerAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRoomEvents — blackjack events', () => {
  describe('blackjack_phase', () => {
    it('更新 BlackjackGameState 字段', () => {
      ctx.game.value = createBjState();
      const m = {
        t: 'blackjack_phase' as const,
        round: 1,
        totalRounds: 5,
        phase: 'betting',
        bankerSeat: 0,
        turnSeat: 1,
        deadline: 10000,
        chips: [{ userId: 1, chips: 100 }],
        betOptions: [10, 20, 50],
        canPassBank: false,
      };
      ws.emit('blackjack_phase', m);
      const s = ctx.game.value as BlackjackGameState;
      expect(s.round).toBe(1);
      expect(s.phase).toBe('betting');
      expect(s.bankerSeat).toBe(0);
      expect(s.isBanker).toBe(true); // mySeat=0, bankerSeat=0
      expect(s.betOptions).toEqual([10, 20, 50]);
    });

    it('新一轮 betting 时重置我的状态', () => {
      ctx.game.value = {
        ...createBjState(),
        round: 0,
        myCards: ['K'],
        myStake: 50,
        myDone: true,
        myBusted: true,
        myNatural: true,
        bankerCards: ['A'],
        bankerValue: 21,
        lastResults: [{ userId: 1, outcome: 'win', delta: 10, chips: 110 }],
      };
      ctx.gameEvents.handsView = [{ userId: 1, cards: ['K'] }];
      ws.emit('blackjack_phase', {
        t: 'blackjack_phase',
        round: 1,
        totalRounds: 5,
        phase: 'betting',
        bankerSeat: 0,
        turnSeat: 1,
        deadline: 0,
        chips: [],
        betOptions: [],
        canPassBank: false,
      });
      const s = ctx.game.value as BlackjackGameState;
      expect(s.myCards).toEqual([]);
      expect(s.myStake).toBe(0);
      expect(s.myDone).toBe(false);
      expect(s.myBusted).toBe(false);
      expect(s.myNatural).toBe(false);
      expect(s.bankerCards).toEqual([]);
      expect(s.bankerValue).toBeNull();
      expect(s.lastResults).toBeNull();
      expect(ctx.gameEvents.handsView).toEqual([]);
    });

    it('同轮次不重置', () => {
      ctx.game.value = { ...createBjState(), round: 1, myCards: ['K'] };
      ws.emit('blackjack_phase', {
        t: 'blackjack_phase',
        round: 1,
        totalRounds: 5,
        phase: 'playing',
        bankerSeat: 0,
        turnSeat: 1,
        deadline: 0,
        chips: [],
        betOptions: [],
        canPassBank: false,
      });
      expect((ctx.game.value as BlackjackGameState).myCards).toEqual(['K']);
    });
  });

  describe('blackjack_deal', () => {
    it('播放 deal 音效，设置 handsView 和 myCards', () => {
      ctx.game.value = { ...createBjState(), isBanker: false };
      ws.emit('blackjack_deal', {
        t: 'blackjack_deal',
        hands: [
          { userId: 1, cards: ['K', '9'], stake: 20, natural: false },
          { userId: 2, cards: ['A', '5'], stake: 10, natural: false },
        ],
        bankerUpcard: 'A',
      });
      expect(soundManager.playDeal).toHaveBeenCalled();
      const s = ctx.game.value as BlackjackGameState;
      expect(s.myCards).toEqual(['K', '9']);
      expect(s.myStake).toBe(20);
      expect(s.bankerCards).toEqual(['A']);
      expect(ctx.gameEvents.handsView).toHaveLength(2);
      expect(ctx.gameEvents.handsView![0].seat).toBe(0); // userId=1 → seat=0
    });

    it('natural 时 myDone=true', () => {
      ctx.game.value = createBjState();
      ws.emit('blackjack_deal', {
        t: 'blackjack_deal',
        hands: [{ userId: 1, cards: ['A', 'K'], stake: 50, natural: true }],
        bankerUpcard: null,
      });
      expect((ctx.game.value as BlackjackGameState).myNatural).toBe(true);
      expect((ctx.game.value as BlackjackGameState).myDone).toBe(true);
    });
  });

  describe('blackjack_your_banker', () => {
    it('设置 bankerCards', () => {
      ctx.game.value = createBjState();
      ws.emit('blackjack_your_banker', { t: 'blackjack_your_banker', cards: ['A', 'K'] });
      expect((ctx.game.value as BlackjackGameState).bankerCards).toEqual(['A', 'K']);
    });
  });

  describe('blackjack_action', () => {
    beforeEach(() => {
      ctx.game.value = { ...createBjState(), phase: 'playing', round: 1, myCards: ['K'] };
      ctx.gameEvents.handsView = [
        { userId: 1, cards: ['K'], done: false, busted: false },
        { userId: 2, cards: ['9'], done: false, busted: false },
      ];
    });

    it('hit: 追加 card 到 myCards', () => {
      ws.emit('blackjack_action', {
        t: 'blackjack_action',
        userId: 1,
        action: 'hit',
        card: '5',
        total: 24,
        busted: true,
      });
      const s = ctx.game.value as BlackjackGameState;
      expect(s.myCards).toEqual(['K', '5']);
      expect(s.myDone).toBe(true);
      expect(s.myBusted).toBe(true);
    });

    it('double: 追加 card，更新 myStake，设置 doubled 事件', () => {
      ws.emit('blackjack_action', {
        t: 'blackjack_action',
        userId: 1,
        action: 'double',
        card: '3',
        total: 23,
        busted: false,
        stake: 40,
      });
      const s = ctx.game.value as BlackjackGameState;
      expect(s.myCards).toEqual(['K', '3']);
      expect(s.myStake).toBe(40);
      expect(s.myDone).toBe(true);
      expect(ctx.gameEvents.doubled).toBeTruthy();
    });

    it('stand: 设置 myDone', () => {
      ws.emit('blackjack_action', { t: 'blackjack_action', userId: 1, action: 'stand' });
      expect((ctx.game.value as BlackjackGameState).myDone).toBe(true);
      expect(ctx.gameEvents.handsView![0].done).toBe(true);
    });

    it('bet: 播放 chip 音效，更新 betLedger', () => {
      ctx.game.value = {
        ...createBjState(),
        round: 1,
        betLedger: [{ userId: 1, round: 1, stake: 0, doubled: false, delta: null, outcome: null }],
      };
      ws.emit('blackjack_action', { t: 'blackjack_action', userId: 1, action: 'bet', stake: 30 });
      expect(soundManager.playChip).toHaveBeenCalled();
      expect(ctx.game.value!.betLedger![0].stake).toBe(30);
    });

    it('banker_hit: 追加 bankerCards 和 bankerValue', () => {
      ws.emit('blackjack_action', {
        t: 'blackjack_action',
        userId: 2,
        action: 'banker_hit',
        card: '7',
        total: 17,
      });
      const s = ctx.game.value as BlackjackGameState;
      expect(s.bankerCards).toEqual(['7']);
      expect(s.bankerValue).toBe(17);
    });

    it('他人 hit: 更新 handsView', () => {
      ws.emit('blackjack_action', {
        t: 'blackjack_action',
        userId: 2,
        action: 'hit',
        card: '4',
        total: 13,
        busted: false,
      });
      expect(ctx.gameEvents.handsView![1].cards).toEqual(['9', '4']);
      expect(ctx.gameEvents.handsView![1].done).toBe(false);
    });

    it('game 为 null 时不抛异常', () => {
      ctx.game.value = null;
      expect(() =>
        ws.emit('blackjack_action', { t: 'blackjack_action', userId: 1, action: 'stand' })
      ).not.toThrow();
    });
  });

  describe('blackjack_settle', () => {
    it('更新 lastResults/chips/bankerCards，播放对应音效', () => {
      ctx.game.value = {
        ...createBjState(),
        phase: 'playing',
        round: 1,
        betLedger: [{ userId: 1, round: 1, stake: 20, doubled: false, delta: null, outcome: null }],
      };
      ctx.gameEvents.handsView = [
        { userId: 1, done: false, busted: false },
        { userId: 2, done: false, busted: false },
      ];
      ws.emit('blackjack_settle', {
        t: 'blackjack_settle',
        round: 1,
        results: [{ userId: 1, outcome: 'win', delta: 20, chips: 120 }],
        chips: [{ userId: 1, chips: 120 }],
        bankerCards: ['A', '9'],
        bankerValue: 20,
        nextDeadline: 5000,
      });
      const s = ctx.game.value as BlackjackGameState;
      expect(s.phase).toBe('settle');
      expect(s.lastResults).toHaveLength(1);
      expect(s.nextDeadline).toBe(5000);
      expect(s.betLedger![0].delta).toBe(20);
      expect(s.betLedger![0].outcome).toBe('win');
      expect(soundManager.playSuccess).toHaveBeenCalled();
    });

    it('输时播放 fail 音效', () => {
      ctx.game.value = createBjState();
      ws.emit('blackjack_settle', {
        t: 'blackjack_settle',
        round: 1,
        results: [{ userId: 1, outcome: 'lose', delta: -10, chips: 90 }],
        chips: [],
        bankerCards: [],
        bankerValue: 21,
        nextDeadline: 0,
      });
      expect(soundManager.playFail).toHaveBeenCalled();
    });
  });

  describe('blackjack_final', () => {
    it('设置 final 并将 phase 设为 ended', () => {
      const f = {
        t: 'blackjack_final' as const,
        ranking: [{ userId: 1, nickname: 'A', chips: 200 }],
      };
      ws.emit('blackjack_final', f);
      expect(ctx.gameEvents.final).toEqual(f);
      expect(ctx.phase.value).toBe('ended');
    });
  });
});
