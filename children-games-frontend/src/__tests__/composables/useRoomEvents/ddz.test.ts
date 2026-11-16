/**
 * useRoomEvents — 斗地主事件测试
 *
 * 覆盖：ddz_phase, ddz_your_cards, ddz_bid, ddz_redeal, ddz_bottom,
 *       ddz_play, ddz_pass, ddz_settle, ddz_error, ddz_final
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
import { showToast } from '@/utils/toastBus';
import { useRoomEvents } from '@/composables/useRoomEvents';
import type { DdzGameState } from '@/composables/wsTypes';

let ws: MockWs;
let ctx: MockCtx;

function createDdzState(): DdzGameState {
  return {
    round: 0,
    totalRounds: 0,
    phase: 'waiting',
    turnSeat: -1,
    leadSeat: -1,
    bidStartSeat: 0,
    bidBestScore: 0,
    bidBase: 1,
    baseUnit: 100,
    multiplier: 1,
    landlordSeat: null,
    bottomCards: null,
    lastPlay: null,
    deadline: 0,
    chips: [],
    myCards: [],
    myBid: null,
    myRole: null,
    others: [],
    betLedger: [],
  };
}

beforeEach(() => {
  ws = createMockWs();
  ctx = createMockContext();
  ctx.gameType.value = 'ddz';
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

describe('useRoomEvents — ddz events', () => {
  describe('ddz_phase', () => {
    it('更新 DdzGameState 字段', () => {
      ctx.game.value = createDdzState();
      ws.emit('ddz_phase', {
        t: 'ddz_phase',
        round: 1,
        totalRounds: 5,
        phase: 'bidding',
        turnSeat: 0,
        leadSeat: 0,
        bidStartSeat: 0,
        bidBestScore: 0,
        bidBase: 1,
        baseUnit: 100,
        multiplier: 1,
        landlordSeat: null,
        bottomCards: null,
        lastPlay: null,
        deadline: 1000,
        chips: [],
      });
      const s = ctx.game.value as DdzGameState;
      expect(s.round).toBe(1);
      expect(s.totalRounds).toBe(5);
      expect(s.phase).toBe('bidding');
      expect(s.deadline).toBe(1000);
    });

    it('新一局 bidding 时重置手牌和角色', () => {
      ctx.game.value = { ...createDdzState(), round: 1, myCards: ['3', '4'], myBid: 2 };
      ws.emit('ddz_phase', {
        t: 'ddz_phase',
        round: 2,
        totalRounds: 5,
        phase: 'bidding',
        turnSeat: 0,
        leadSeat: 0,
        bidStartSeat: 0,
        bidBestScore: 0,
        bidBase: 1,
        baseUnit: 100,
        multiplier: 1,
        landlordSeat: null,
        bottomCards: null,
        lastPlay: null,
        deadline: 0,
        chips: [],
      });
      const s = ctx.game.value as DdzGameState;
      expect(s.myCards).toEqual([]);
      expect(s.myBid).toBeNull();
      expect(s.myRole).toBeNull();
    });

    it('playing 阶段更新地主信息', () => {
      ctx.game.value = {
        ...createDdzState(),
        others: [
          { userId: 2, nickname: 'B', seat: 1, cardCount: 17, isLandlord: false, bid: null },
        ],
      };
      ws.emit('ddz_phase', {
        t: 'ddz_phase',
        round: 1,
        totalRounds: 5,
        phase: 'playing',
        turnSeat: 1,
        leadSeat: 1,
        bidStartSeat: 0,
        bidBestScore: 3,
        bidBase: 1,
        baseUnit: 100,
        multiplier: 1,
        landlordSeat: 1,
        bottomCards: ['K', 'K', 'K'],
        lastPlay: null,
        deadline: 0,
        chips: [],
      });
      const s = ctx.game.value as DdzGameState;
      expect(s.others?.[0].isLandlord).toBe(true);
      expect(s.others?.[0].cardCount).toBe(20);
    });
  });

  describe('ddz_your_cards', () => {
    it('设置手牌', () => {
      ctx.game.value = createDdzState();
      ws.emit('ddz_your_cards', {
        t: 'ddz_your_cards',
        cards: ['3', '4', '5', '6', '7'],
      });
      expect(ctx.gameEvents.ddz_your_cards).toEqual({
        t: 'ddz_your_cards',
        cards: ['3', '4', '5', '6', '7'],
      });
      expect((ctx.game.value as DdzGameState).myCards).toEqual(['3', '4', '5', '6', '7']);
    });
  });

  describe('ddz_bid', () => {
    it('更新叫分信息', () => {
      ctx.game.value = {
        ...createDdzState(),
        others: [
          { userId: 2, nickname: 'B', seat: 1, cardCount: 17, isLandlord: false, bid: null },
        ],
      };
      ws.emit('ddz_bid', {
        t: 'ddz_bid',
        userId: 2,
        score: 2,
        bestScore: 2,
      });
      expect(ctx.gameEvents.ddz_bid).toBeTruthy();
      expect((ctx.game.value as DdzGameState).bidBestScore).toBe(2);
      expect((ctx.game.value as DdzGameState).others?.[0].bid).toBe(2);
    });

    it('自己叫分时更新 myBid', () => {
      ctx.game.value = createDdzState();
      ws.emit('ddz_bid', {
        t: 'ddz_bid',
        userId: 1,
        score: 3,
        bestScore: 3,
      });
      expect((ctx.game.value as DdzGameState).myBid).toBe(3);
    });
  });

  describe('ddz_redeal', () => {
    it('显示 toast 提示', () => {
      ws.emit('ddz_redeal', { t: 'ddz_redeal' });
      expect(showToast).toHaveBeenCalledWith('三家都不叫，重新发牌');
    });
  });

  describe('ddz_bottom', () => {
    it('设置底牌和地主', () => {
      ctx.game.value = {
        ...createDdzState(),
        others: [
          { userId: 2, nickname: 'B', seat: 1, cardCount: 17, isLandlord: false, bid: null },
        ],
      };
      ws.emit('ddz_bottom', {
        t: 'ddz_bottom',
        cards: ['K', 'K', 'K'],
        landlordSeat: 1,
      });
      const s = ctx.game.value as DdzGameState;
      expect(s.bottomCards).toEqual(['K', 'K', 'K']);
      expect(s.landlordSeat).toBe(1);
      expect(s.others?.[0].isLandlord).toBe(true);
      expect(s.others?.[0].cardCount).toBe(20);
    });

    it('自己是地主时设置 myRole', () => {
      ctx.mySeat.value = 0;
      ctx.game.value = createDdzState();
      ws.emit('ddz_bottom', {
        t: 'ddz_bottom',
        cards: ['K', 'K', 'K'],
        landlordSeat: 0,
      });
      expect((ctx.game.value as DdzGameState).myRole).toBe('landlord');
    });
  });

  describe('ddz_play', () => {
    it('更新出牌信息', () => {
      ctx.game.value = {
        ...createDdzState(),
        myCards: ['3', '4', '5'],
        others: [
          { userId: 2, nickname: 'B', seat: 1, cardCount: 17, isLandlord: false, bid: null },
        ],
      };
      ws.emit('ddz_play', {
        t: 'ddz_play',
        seat: 1,
        userId: 2,
        cards: ['J', 'Q'],
        cardType: 'straight',
        remain: 15,
        multiplier: 2,
      });
      const s = ctx.game.value as DdzGameState;
      expect(s.lastPlay?.cards).toEqual(['J', 'Q']);
      expect(s.multiplier).toBe(2);
      expect(s.others?.[0].cardCount).toBe(15);
    });

    it('自己出牌时从手牌移除', () => {
      ctx.game.value = { ...createDdzState(), myCards: ['3', '4', '5', '6'] };
      ws.emit('ddz_play', {
        t: 'ddz_play',
        seat: 0,
        userId: 1,
        cards: ['3', '4'],
        cardType: 'pair',
        remain: 2,
        multiplier: 1,
      });
      expect((ctx.game.value as DdzGameState).myCards).toEqual(['5', '6']);
    });
  });

  describe('ddz_pass', () => {
    it('记录 pass 事件', () => {
      ws.emit('ddz_pass', { t: 'ddz_pass', userId: 2 });
      expect(ctx.gameEvents.ddz_pass).toEqual({ t: 'ddz_pass', userId: 2 });
    });
  });

  describe('ddz_settle', () => {
    it('结算并播放音效', () => {
      ctx.game.value = createDdzState();
      ws.emit('ddz_settle', {
        t: 'ddz_settle',
        bottomCards: ['K', 'K', 'K'],
        landlordWin: true,
        bid: 3,
        multiplier: 2,
        round: 1,
        deltas: [
          { userId: 1, chips: 600, delta: 600, role: 'landlord' },
          { userId: 2, chips: 100, delta: -300, role: 'farmer' },
          { userId: 3, chips: 100, delta: -300, role: 'farmer' },
        ],
      });
      const s = ctx.game.value as DdzGameState;
      expect(s.phase).toBe('settle');
      expect(s.bottomCards).toEqual(['K', 'K', 'K']);
      expect(soundManager.playSuccess).toHaveBeenCalled();
    });

    it('自己失败时播放失败音效', () => {
      ctx.game.value = createDdzState();
      ws.emit('ddz_settle', {
        t: 'ddz_settle',
        bottomCards: [],
        landlordWin: true,
        bid: 1,
        multiplier: 1,
        round: 1,
        deltas: [{ userId: 1, chips: 100, delta: -100, role: 'farmer' }],
      });
      expect(soundManager.playFail).toHaveBeenCalled();
    });
  });

  describe('ddz_error', () => {
    it('显示错误 toast', () => {
      ws.emit('ddz_error', { t: 'ddz_error', error: '出牌无效' });
      expect(showToast).toHaveBeenCalledWith('出牌无效');
    });

    it('默认错误消息', () => {
      ws.emit('ddz_error', { t: 'ddz_error', error: '' });
      expect(showToast).toHaveBeenCalledWith('操作无效');
    });
  });

  describe('ddz_final', () => {
    it('设置 final 和 phase', () => {
      ws.emit('ddz_final', {
        t: 'ddz_final',
        ranking: [
          { userId: 1, nickname: 'Me', chips: 1000 },
          { userId: 2, nickname: 'B', chips: 500 },
        ],
      });
      expect(ctx.gameEvents.final).toBeTruthy();
      expect(ctx.phase.value).toBe('ended');
    });
  });
});
