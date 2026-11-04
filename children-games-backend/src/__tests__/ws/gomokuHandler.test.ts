import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Room, Member } from '../../ws/roomManager';
import type { GomokuState } from '../../ws/gomoku';
import { gomokuHandler } from '../../ws/games/gomoku';
import { BLACK, WHITE } from '../../ws/gomoku';

// Mock the pure gomoku logic to isolate handler behavior
const { mockPlaceStone } = vi.hoisted(() => ({
  mockPlaceStone: vi.fn().mockReturnValue(null),
}));

vi.mock('../../ws/gomoku', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ws/gomoku')>();
  return {
    ...actual,
    placeStone: mockPlaceStone,
  };
});

// Helper: create a mock room
function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 'room-1',
    gameType: 'gomoku',
    hostUserId: 1,
    members: new Map(),
    phase: 'playing',
    game: {
      board: [],
      turn: BLACK,
      winner: 0,
      winLine: [],
      lastMove: null,
      moveCount: 0,
    } as unknown as GomokuState,
    config: {},
    chat: [],
    voices: new Map(),
    timers: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    ...overrides,
  } as Room;
}

// Helper: create a mock member
function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    userId: 1,
    nickname: 'Player1',
    avatar: '',
    seat: 0,
    ready: true,
    rematch: false,
    online: true,
    ws: null,
    offlineAt: 0,
    chips: 0,
    ...overrides,
  } as Member;
}

describe('gomokuHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlaceStone.mockReturnValue(null);
  });

  describe('metadata', () => {
    it('should have correct game type and player limits', () => {
      expect(gomokuHandler.type).toBe('gomoku');
      expect(gomokuHandler.minPlayers).toBe(2);
      expect(gomokuHandler.maxPlayers).toBe(2);
      expect(gomokuHandler.allowSpectators).toBe(true);
      expect(gomokuHandler.rematchSwapSeats).toBe(true);
    });
  });

  describe('create', () => {
    it('should return initial game state', () => {
      const state = gomokuHandler.create();
      expect(state).toBeDefined();
      expect(state.board).toBeDefined();
      expect(state.turn).toBe(BLACK);
      expect(state.winner).toBe(0);
    });
  });

  describe('onAction — move', () => {
    it('should place stone and broadcast move on valid action', () => {
      const room = makeRoom();
      const member = makeMember({ seat: 0 });
      const result = gomokuHandler.onAction(room, member, 'move', { x: 7, y: 7 });

      expect(mockPlaceStone).toHaveBeenCalled();
      expect(result.error).toBeUndefined();
      expect(result.broadcast).toBeDefined();
      expect(result.broadcast![0].t).toBe('move');
      expect(result.broadcast![0].x).toBe(7);
      expect(result.broadcast![0].y).toBe(7);
    });

    it('should reject move when room phase is not playing', () => {
      const room = makeRoom({ phase: 'waiting' });
      const member = makeMember();
      const result = gomokuHandler.onAction(room, member, 'move', { x: 0, y: 0 });
      expect(result.error).toBe('当前不能落子');
    });

    it('should reject move when player has no seat (spectator)', () => {
      const room = makeRoom();
      const member = makeMember({ seat: -1 });
      const result = gomokuHandler.onAction(room, member, 'move', { x: 0, y: 0 });
      expect(result.error).toBe('当前不能落子');
    });

    it('should return error from placeStone when move is invalid', () => {
      mockPlaceStone.mockReturnValue('坐标超出棋盘');
      const room = makeRoom();
      const member = makeMember();
      const result = gomokuHandler.onAction(room, member, 'move', { x: 99, y: 99 });
      expect(result.error).toBe('坐标超出棋盘');
    });

    it('should set ended when winner is detected', () => {
      const room = makeRoom();
      const g = room.game as GomokuState;
      // Simulate winner after placing stone
      mockPlaceStone.mockImplementation((gState) => {
        gState.winner = BLACK; // BLACK wins
        return null;
      });
      const member = makeMember({ seat: 0 });
      const result = gomokuHandler.onAction(room, member, 'move', { x: 0, y: 0 });

      expect(result.ended).toBeDefined();
      expect(result.ended!.winnerSeat).toBe(0); // BLACK → seat 0
      expect(result.ended!.reason).toBe('五连成线');
    });

    it('should detect draw (board full)', () => {
      const room = makeRoom();
      mockPlaceStone.mockImplementation((gState) => {
        gState.winner = 3; // draw
        return null;
      });
      const member = makeMember();
      const result = gomokuHandler.onAction(room, member, 'move', { x: 0, y: 0 });

      expect(result.ended).toBeDefined();
      expect(result.ended!.winnerSeat).toBe(-1);
      expect(result.ended!.reason).toBe('棋盘已满');
    });

    it('should not set ended when no winner', () => {
      const room = makeRoom();
      const member = makeMember();
      const result = gomokuHandler.onAction(room, member, 'move', { x: 7, y: 7 });

      expect(result.ended).toBeNull();
    });

    it('should map WHITE winner to seat 1', () => {
      const room = makeRoom();
      mockPlaceStone.mockImplementation((gState) => {
        gState.winner = WHITE;
        return null;
      });
      const member = makeMember({ seat: 1 });
      const result = gomokuHandler.onAction(room, member, 'move', { x: 0, y: 0 });

      expect(result.ended!.winnerSeat).toBe(1); // WHITE → seat 1
    });
  });

  describe('onAction — resign', () => {
    it('should end game with opponent winning', () => {
      const room = makeRoom();
      const member = makeMember({ seat: 0 });
      const result = gomokuHandler.onAction(room, member, 'resign', {});

      expect(result.ended).toBeDefined();
      expect(result.ended!.winnerSeat).toBe(1); // opponent wins
      expect(result.ended!.reason).toBe('对方认输');
    });

    it('should reject resign when not playing', () => {
      const room = makeRoom({ phase: 'waiting' });
      const member = makeMember();
      const result = gomokuHandler.onAction(room, member, 'resign', {});
      expect(result.error).toBe('当前无法认输');
    });

    it('should reject resign for spectator', () => {
      const room = makeRoom();
      const member = makeMember({ seat: -1 });
      const result = gomokuHandler.onAction(room, member, 'resign', {});
      expect(result.error).toBe('当前无法认输');
    });
  });

  describe('onAction — unknown', () => {
    it('should reject unknown actions', () => {
      const room = makeRoom();
      const member = makeMember();
      const result = gomokuHandler.onAction(room, member, 'invalid_action', {});
      expect(result.error).toBe('未知的游戏操作');
    });
  });

  describe('onPlayerQuit', () => {
    it('should end game when player quits during playing phase', () => {
      const room = makeRoom();
      const member = makeMember({ seat: 0 });
      const result = gomokuHandler.onPlayerQuit!(room, member);

      expect(result).toBeDefined();
      expect(result!.ended!.winnerSeat).toBe(1);
      expect(result!.ended!.reason).toBe('对方退出了对局');
    });

    it('should return void when not in playing phase', () => {
      const room = makeRoom({ phase: 'waiting' });
      const member = makeMember();
      const result = gomokuHandler.onPlayerQuit!(room, member);
      expect(result).toBeUndefined();
    });

    it('should return void for spectator quit', () => {
      const room = makeRoom();
      const member = makeMember({ seat: -1 });
      const result = gomokuHandler.onPlayerQuit!(room, member);
      expect(result).toBeUndefined();
    });
  });

  describe('serializeFor', () => {
    it('should return game state fields', () => {
      const room = makeRoom();
      const g = room.game as GomokuState;
      g.board = [
        [1, 0],
        [0, 2],
      ];
      g.turn = BLACK;
      g.winner = 0;
      g.winLine = [];
      g.lastMove = { x: 3, y: 4 };

      const member = makeMember();
      const serialized = gomokuHandler.serializeFor(room, member);

      expect(serialized.board).toBe(g.board);
      expect(serialized.turn).toBe(BLACK);
      expect(serialized.winner).toBe(0);
      expect(serialized.winLine).toEqual([]);
      expect(serialized.lastMove).toEqual({ x: 3, y: 4 });
    });
  });
});
