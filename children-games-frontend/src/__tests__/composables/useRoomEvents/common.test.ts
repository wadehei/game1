/**
 * useRoomEvents — 通用事件单元测试
 *
 * 覆盖：joined, snapshot, member_update, move, game_start, game_restart,
 *       game_over, error, chat, voice, closed, rematch_vote, rematch_deadline
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockWs, createMockContext, type MockWs, type MockCtx } from './helpers';

// ── Mocks ──────────────────────────────────────────────
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

let ws: MockWs;
let ctx: MockCtx;

beforeEach(() => {
  vi.useFakeTimers();
  ws = createMockWs();
  ctx = createMockContext();
  useRoomEvents(ws as any, ctx).registerAll();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useRoomEvents — common events', () => {
  // ── joined ────────────────────────────────────────
  describe('joined', () => {
    it('设置 mySeat 并调用 applySnapshot', () => {
      const payload = { yourSeat: 3, type: 'snapshot', board: [] };
      ws.emit('joined', payload);
      expect(ctx.mySeat.value).toBe(3);
      expect(ctx.applySnapshot).toHaveBeenCalledWith(payload);
    });
  });

  // ── snapshot ──────────────────────────────────────
  describe('snapshot', () => {
    it('直接调用 applySnapshot', () => {
      const data = { type: 'snapshot', board: [[1]] };
      ws.emit('snapshot', data);
      expect(ctx.applySnapshot).toHaveBeenCalledWith(data);
    });
  });

  // ── member_update ─────────────────────────────────
  describe('member_update', () => {
    it('更新 members 列表', () => {
      const newMembers = [{ userId: 1, nickname: 'A', seat: 0 }];
      ws.emit('member_update', { members: newMembers });
      expect(ctx.members.value).toEqual(newMembers);
    });

    it('members 为 undefined 时设为空数组', () => {
      ws.emit('member_update', {});
      expect(ctx.members.value).toEqual([]);
    });
  });

  // ── move ──────────────────────────────────────────
  describe('move (gomoku)', () => {
    beforeEach(() => {
      ctx.board.value = Array.from({ length: 15 }, () => Array(15).fill(0));
      ctx.game.value = {
        turn: 1,
        winner: 0,
        winLine: [],
        lastMove: null,
        board: ctx.board.value,
      } as any;
    });

    it('更新 board 和 game 状态', () => {
      ws.emit('move', { x: 3, y: 4, color: 1, turn: 2, lastMove: { x: 3, y: 4 }, winner: 0 });
      expect(ctx.board.value[4][3]).toBe(1);
      expect((ctx.game.value as any).turn).toBe(2);
      expect((ctx.game.value as any).lastMove).toEqual({ x: 3, y: 4 });
    });

    it('有 winner 时更新 winner 和 winLine', () => {
      const winLine: Array<[number, number]> = [
        [1, 1],
        [2, 2],
      ];
      ws.emit('move', { x: 5, y: 5, color: 2, turn: 3, lastMove: null, winner: 2, winLine });
      expect((ctx.game.value as any).winner).toBe(2);
      expect((ctx.game.value as any).winLine).toEqual(winLine);
    });

    it('播放 click 音效', () => {
      ws.emit('move', { x: 0, y: 0, color: 1, turn: 1, lastMove: null, winner: 0 });
      expect(soundManager.playClick).toHaveBeenCalled();
    });

    it('board 行不存在时不写入', () => {
      ctx.board.value = [];
      ws.emit('move', { x: 0, y: 99, color: 1, turn: 1, lastMove: null, winner: 0 });
      // 不会崩溃
    });
  });

  // ── game_start / game_restart ─────────────────────
  describe('game_start / game_restart', () => {
    it.each(['game_start', 'game_restart'])(
      '%s: 重置 phase/board/game 并清空 gameEvents',
      (event) => {
        ctx.phase.value = 'waiting';
        ctx.gameEvents.question = { t: 'quiz_question' } as any;
        ws.emit(event as any, { phase: 'playing' });
        expect(ctx.phase.value).toBe('playing');
        expect(ctx.board.value).toHaveLength(15);
        expect(ctx.board.value[0]).toHaveLength(15);
        expect((ctx.game.value as any).turn).toBe(1);
        expect(ctx.gameEvents.question).toBeNull();
      }
    );
  });

  // ── game_over ─────────────────────────────────────
  describe('game_over', () => {
    it('设置 phase=ended 和 overReason', () => {
      ws.emit('game_over', { reason: 'all_ready' });
      expect(ctx.phase.value).toBe('ended');
      expect(ctx.overReason.value).toBe('all_ready');
      expect(ctx.rematchVotes.value).toEqual([]);
    });

    it('reason 缺失时 overReason 设为空字符串', () => {
      ws.emit('game_over', {});
      expect(ctx.overReason.value).toBe('');
    });

    it('gomoku 且 game 有 winner 时设置 winner 值', () => {
      ctx.gameType.value = 'gomoku';
      ctx.game.value = { winner: 0 } as any;
      ws.emit('game_over', { winnerSeat: 0, reason: '' });
      // winnerSeat=0 → winner=1
      expect((ctx.game.value as any).winner).toBe(1);
    });

    it('winnerSeat=1 → winner=2', () => {
      ctx.gameType.value = 'gomoku';
      ctx.game.value = { winner: 0 } as any;
      ws.emit('game_over', { winnerSeat: 1, reason: '' });
      expect((ctx.game.value as any).winner).toBe(2);
    });

    it('winnerSeat=其他值 → winner=3', () => {
      ctx.gameType.value = 'gomoku';
      ctx.game.value = { winner: 0 } as any;
      ws.emit('game_over', { winnerSeat: 5, reason: '' });
      expect((ctx.game.value as any).winner).toBe(3);
    });
  });

  // ── error ─────────────────────────────────────────
  describe('error', () => {
    it('设置 lastWsError 并在 2500ms 后清空', () => {
      ws.emit('error', { message: 'something wrong' });
      expect(ctx.lastWsError.value).toBe('something wrong');
      vi.advanceTimersByTime(2500);
      expect(ctx.lastWsError.value).toBe('');
    });

    it('message 缺失时设为空字符串', () => {
      ws.emit('error', {});
      expect(ctx.lastWsError.value).toBe('');
    });

    it('房间不存在时调用 showToast + ws.close + leaveToLobby', () => {
      ws.emit('error', { message: '房间不存在' });
      expect(showToast).toHaveBeenCalledWith('房间不存在', 'error');
      expect(ws.close).toHaveBeenCalled();
      expect(ctx.leaveToLobby).toHaveBeenCalled();
    });

    it('非房间不存在错误不触发关闭', () => {
      ws.emit('error', { message: '其他错误' });
      expect(ws.close).not.toHaveBeenCalled();
      expect(ctx.leaveToLobby).not.toHaveBeenCalled();
    });
  });

  // ── rematch ───────────────────────────────────────
  describe('rematch_vote / rematch_deadline', () => {
    it('rematch_vote 更新 rematchVotes', () => {
      ws.emit('rematch_vote', { userIds: [1, 2, 3] });
      expect(ctx.rematchVotes.value).toEqual([1, 2, 3]);
    });

    it('rematch_deadline 更新 rematchDeadlineAt', () => {
      ws.emit('rematch_deadline', { deadline: 1700000000000 });
      expect(ctx.rematchDeadlineAt.value).toBe(1700000000000);
    });

    it('deadline 非法值设为 0', () => {
      ws.emit('rematch_deadline', { deadline: 'abc' });
      expect(ctx.rematchDeadlineAt.value).toBe(0);
    });
  });

  // ── chat ──────────────────────────────────────────
  describe('chat', () => {
    it('添加到 chatList 并调用 scrollChat', () => {
      ws.emit('chat', { userId: 1, nickname: 'A', kind: 'text', content: 'hello', ts: 1 });
      expect(ctx.chatList.value).toHaveLength(1);
      expect(ctx.chatList.value[0]).toEqual({
        userId: 1,
        nickname: 'A',
        kind: 'text',
        content: 'hello',
        ts: 1,
      });
      expect(ctx.scrollChat).toHaveBeenCalled();
    });

    it('超过 100 条时丢弃最早的', () => {
      for (let i = 0; i < 101; i++) {
        ws.emit('chat', { userId: 1, nickname: 'A', kind: 'text', content: `msg-${i}`, ts: i });
      }
      expect(ctx.chatList.value).toHaveLength(100);
      expect(ctx.chatList.value[0].content).toBe('msg-1');
    });
  });

  // ── voice ─────────────────────────────────────────
  describe('voice', () => {
    it('添加到 voiceList 并调用 scrollChat', () => {
      ws.emit('voice', { voiceId: 'a', userId: 2, nickname: 'B', duration: 1000, ts: 1 });
      expect(ctx.voiceList.value).toHaveLength(1);
      expect(ctx.scrollChat).toHaveBeenCalled();
    });

    it('超过 50 条时丢弃最早的', () => {
      for (let i = 0; i < 51; i++) {
        ws.emit('voice', { voiceId: `v-${i}`, userId: 1, nickname: 'A', duration: 1000, ts: i });
      }
      expect(ctx.voiceList.value).toHaveLength(50);
      expect(ctx.voiceList.value[0].voiceId).toBe('v-1');
    });
  });

  // ── closed ────────────────────────────────────────
  describe('closed', () => {
    it('显示 toast，关闭 ws，调用 leaveToLobby', () => {
      ws.emit('closed', { reason: '房主解散' });
      expect(showToast).toHaveBeenCalledWith('房主解散');
      expect(ws.close).toHaveBeenCalled();
      expect(ctx.leaveToLobby).toHaveBeenCalled();
    });

    it('reason 缺失时使用默认文案', () => {
      ws.emit('closed', {});
      expect(showToast).toHaveBeenCalledWith('房间已解散');
    });
  });

  // ── disconnected ──────────────────────────────────
  describe('disconnected', () => {
    it('注册不抛异常', () => {
      expect(() => ws.emit('disconnected', {})).not.toThrow();
    });
  });
});
