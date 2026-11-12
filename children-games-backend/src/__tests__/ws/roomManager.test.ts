import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the games registry before importing roomManager
vi.mock('../../ws/games/registry', () => ({
  getHandler: vi.fn(() => ({
    create: () => ({ status: 'init' }),
    maxPlayers: 4,
    type: 'gomoku',
    title: '五子棋',
    emoji: '⚫',
    desc: 'test',
    minPlayers: 2,
    allowSpectators: true,
    rematchSwapSeats: true,
    onAction: vi.fn(),
    serializeFor: vi.fn(),
  })),
}));

// Mock constants to small values for testing
vi.mock('../../config/constants', () => ({
  ROOM_IDLE_MS: 1000,
  VOICE_TTL_MS: 500,
}));

import {
  createRoom,
  joinRoom,
  removeMember,
  disbandRoom,
  getRoom,
  allRooms,
  roomCount,
  addChat,
  storeVoice,
  getVoice,
  memberList,
  isHost,
  addTimer,
  clearRoomTimers,
  sweepIdle,
  TOTAL_MEMBER_LIMIT,
  MAX_MEMBERS,
} from '../../ws/roomManager';
import type { Room, ChatMsg, RoomVoice } from '../../ws/roomManager';

const mockUser = (id: number, name = `user${id}`) => ({
  userId: id,
  nickname: name,
  avatar: `avatar${id}`,
});

describe('roomManager', () => {
  // Clean up all rooms between tests
  beforeEach(() => {
    for (const room of allRooms()) {
      disbandRoom(room);
    }
  });

  describe('createRoom', () => {
    it('should create a room with unique 4-digit id', () => {
      const room = createRoom(mockUser(1), 'gomoku');
      expect(room.id).toMatch(/^\d{4}$/);
      expect(room.gameType).toBe('gomoku');
      expect(room.hostUserId).toBe(1);
      expect(room.phase).toBe('waiting');
      expect(room.members.size).toBe(0);
    });

    it('should register room in global map', () => {
      const room = createRoom(mockUser(1), 'gomoku');
      expect(getRoom(room.id)).toBe(room);
      expect(roomCount()).toBe(1);
    });

    it('should create multiple rooms with different ids', () => {
      const r1 = createRoom(mockUser(1), 'gomoku');
      const r2 = createRoom(mockUser(2), 'uno');
      expect(r1.id).not.toBe(r2.id);
      expect(roomCount()).toBe(2);
    });

    it('should use provided config or default to empty object', () => {
      const r1 = createRoom(mockUser(1), 'gomoku', { maxRounds: 3 });
      const r2 = createRoom(mockUser(2), 'gomoku');
      expect(r1.config).toEqual({ maxRounds: 3 });
      expect(r2.config).toEqual({});
    });
  });

  describe('joinRoom', () => {
    it('should assign seat 0 to first player in waiting phase', () => {
      const room = createRoom(mockUser(1), 'gomoku');
      const member = joinRoom(room, mockUser(1));
      expect(member.seat).toBe(0);
      expect(member.online).toBe(true);
    });

    it('should assign consecutive seats', () => {
      const room = createRoom(mockUser(1), 'gomoku');
      const m1 = joinRoom(room, mockUser(1));
      const m2 = joinRoom(room, mockUser(2));
      expect(m1.seat).toBe(0);
      expect(m2.seat).toBe(1);
    });

    it('should assign spectator seat (-1) when phase is playing', () => {
      const room = createRoom(mockUser(1), 'gomoku');
      room.phase = 'playing';
      const m = joinRoom(room, mockUser(3));
      expect(m.seat).toBe(-1);
    });

    it('should handle reconnection for existing member', () => {
      const room = createRoom(mockUser(1), 'gomoku');
      joinRoom(room, { ...mockUser(1), chips: 1000 });
      // Simulate disconnect
      room.members.get(1)!.online = false;
      room.members.get(1)!.ws = null;
      // Reconnect
      const m = joinRoom(room, { ...mockUser(1), chips: 2000 });
      expect(m.online).toBe(true);
      expect(m.chips).toBe(2000);
    });

    it('should default chips to 1000 when not provided', () => {
      const room = createRoom(mockUser(1), 'gomoku');
      const m = joinRoom(room, mockUser(1));
      expect(m.chips).toBe(1000);
    });
  });

  describe('removeMember', () => {
    it('should return "empty" when last member leaves', () => {
      const room = createRoom(mockUser(1), 'gomoku');
      joinRoom(room, mockUser(1));
      const result = removeMember(room, 1);
      expect(result).toBe('empty');
      expect(room.members.size).toBe(0);
    });

    it('should return "ok" when spectator or waiting member leaves', () => {
      const room = createRoom(mockUser(1), 'gomoku');
      joinRoom(room, mockUser(1));
      joinRoom(room, mockUser(2));
      room.phase = 'playing';
      // Spectator (seat = -1) leaves during playing
      const m3 = joinRoom(room, mockUser(3));
      expect(m3.seat).toBe(-1);
      const result = removeMember(room, 3);
      expect(result).toBe('ok');
    });

    it('should return "resign" when seated player leaves during playing', () => {
      const room = createRoom(mockUser(1), 'gomoku');
      joinRoom(room, mockUser(1));
      joinRoom(room, mockUser(2));
      room.phase = 'playing';
      const result = removeMember(room, 1);
      expect(result).toBe('resign');
    });

    it('should transfer host to next member when host leaves', () => {
      const room = createRoom(mockUser(1), 'gomoku');
      joinRoom(room, mockUser(1));
      joinRoom(room, mockUser(2));
      expect(room.hostUserId).toBe(1);
      removeMember(room, 1);
      expect(room.hostUserId).toBe(2);
    });

    it('should return "ok" for non-existent member', () => {
      const room = createRoom(mockUser(1), 'gomoku');
      const result = removeMember(room, 999);
      expect(result).toBe('ok');
    });
  });

  describe('disbandRoom', () => {
    it('should remove room from global map and clean up', () => {
      const room = createRoom(mockUser(1), 'gomoku');
      joinRoom(room, mockUser(1));
      addChat(room, { userId: 1, nickname: 'u1', kind: 'text', content: 'hi', ts: Date.now() });
      const timer = setTimeout(() => {}, 10000);
      addTimer(room, timer);

      disbandRoom(room);

      expect(getRoom(room.id)).toBeUndefined();
      expect(room.members.size).toBe(0);
      expect(room.chat.length).toBe(0);
      expect(room.voices.size).toBe(0);
      expect(room.timers.length).toBe(0);
    });
  });

  describe('chat', () => {
    it('should store chat messages', () => {
      const room = createRoom(mockUser(1), 'gomoku');
      const msg: ChatMsg = {
        userId: 1,
        nickname: 'u1',
        kind: 'text',
        content: 'hello',
        ts: Date.now(),
      };
      addChat(room, msg);
      expect(room.chat.length).toBe(1);
      expect(room.chat[0]).toEqual(msg);
    });

    it('should cap at 100 messages (ring buffer)', () => {
      const room = createRoom(mockUser(1), 'gomoku');
      for (let i = 0; i < 105; i++) {
        addChat(room, {
          userId: 1,
          nickname: 'u1',
          kind: 'text',
          content: String(i),
          ts: Date.now(),
        });
      }
      expect(room.chat.length).toBe(100);
      // Oldest 5 should be dropped
      expect(room.chat[0].content).toBe('5');
    });
  });

  describe('voice', () => {
    it('should store and retrieve voice messages', () => {
      const room = createRoom(mockUser(1), 'gomoku');
      const voice: RoomVoice = {
        data: Buffer.from('test'),
        mime: 'audio/webm',
        userId: 1,
        nickname: 'u1',
        duration: 3,
        ts: Date.now(),
      };
      storeVoice(room, voice, 'v1');
      expect(getVoice(room, 'v1')).toBe(voice);
    });

    it('should return undefined for non-existent voice', () => {
      const room = createRoom(mockUser(1), 'gomoku');
      expect(getVoice(room, 'nope')).toBeUndefined();
    });
  });

  describe('memberList', () => {
    it('should return simplified member info', () => {
      const room = createRoom(mockUser(1), 'gomoku');
      joinRoom(room, { ...mockUser(1), chips: 500 });
      joinRoom(room, { ...mockUser(2), chips: 800 });
      const list = memberList(room);
      expect(list.length).toBe(2);
      expect(list[0]).toEqual({
        userId: 1,
        nickname: 'user1',
        avatar: 'avatar1',
        seat: 0,
        ready: false,
        online: true,
        chips: 500,
      });
    });
  });

  describe('isHost', () => {
    it('should return true for host user', () => {
      const room = createRoom(mockUser(1), 'gomoku');
      expect(isHost(room, 1)).toBe(true);
      expect(isHost(room, 2)).toBe(false);
    });
  });

  describe('timers', () => {
    it('should track and clear timers', () => {
      const room = createRoom(mockUser(1), 'gomoku');
      const t1 = setTimeout(() => {}, 10000);
      const t2 = setTimeout(() => {}, 10000);
      addTimer(room, t1);
      addTimer(room, t2);
      expect(room.timers.length).toBe(2);
      clearRoomTimers(room);
      expect(room.timers.length).toBe(0);
    });
  });

  describe('sweepIdle', () => {
    it('should clean up idle rooms and expired voices', async () => {
      vi.useFakeTimers();
      try {
        const room = createRoom(mockUser(1), 'gomoku');
        joinRoom(room, mockUser(1));

        // Add a voice that will expire
        const voice: RoomVoice = {
          data: Buffer.from('test'),
          mime: 'audio/webm',
          userId: 1,
          nickname: 'u1',
          duration: 1,
          ts: Date.now(),
        };
        storeVoice(room, voice, 'v1');

        // Advance past voice TTL but not room idle
        vi.advanceTimersByTime(600); // VOICE_TTL_MS = 500
        const swept1 = sweepIdle();
        expect(swept1).toBe(0); // room still active
        expect(room.voices.size).toBe(0); // voice expired

        // Advance past room idle time
        vi.advanceTimersByTime(600); // ROOM_IDLE_MS = 1000 total
        const swept2 = sweepIdle();
        expect(swept2).toBe(1);
        expect(getRoom(room.id)).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('constants', () => {
    it('should export member limits', () => {
      expect(MAX_MEMBERS).toBe(8);
      expect(TOTAL_MEMBER_LIMIT).toBe(12);
    });
  });
});
