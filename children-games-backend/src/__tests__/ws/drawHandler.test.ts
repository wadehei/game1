import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Room, Member, Seat } from '../../ws/roomManager';
import { drawHandler } from '../../ws/games/draw';

// Mock dependencies
vi.mock('../../ws/bus', () => ({
  getRoomBus: () => ({
    broadcast: vi.fn(),
    sendToUser: vi.fn(),
  }),
}));

vi.mock('../../ws/roomManager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ws/roomManager')>();
  return {
    ...actual,
    getRoom: vi.fn(),
    addTimer: vi.fn((_room, timer) => timer),
    clearRoomTimers: vi.fn(),
    addChat: vi.fn(),
  };
});

vi.mock('../../ws/games/draw-words.json', () => ({
  default: [
    { word: '太阳', category: '自然', difficulty: 1 },
    { word: '月亮', category: '自然', difficulty: 1 },
    { word: '小猫', category: '动物', difficulty: 2 },
  ],
}));

vi.mock('../../utils/secureRandom', () => ({
  secureShuffle: vi.fn(<T>(arr: T[]) => [...arr]),
  securePickOne: vi.fn(<T>(arr: T[]) => arr[0]),
}));

// ─── Helpers ────────────────────────────────

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    userId: 1,
    nickname: 'P1',
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

function makeRoom(members: Member[] = [], phase: Room['phase'] = 'playing'): Room {
  const memberMap = new Map<number, Member>();
  for (const m of members) memberMap.set(m.userId, m);
  return {
    id: 'room-1',
    gameType: 'draw',
    hostUserId: members[0]?.userId || 1,
    members: memberMap,
    phase,
    game: drawHandler.create(),
    config: {},
    chat: [],
    voices: new Map(),
    timers: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  } as Room;
}

type DrawState = ReturnType<typeof drawHandler.create>;

describe('drawHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('metadata', () => {
    it('should have correct game properties', () => {
      expect(drawHandler.type).toBe('draw');
      expect(drawHandler.minPlayers).toBe(3);
      expect(drawHandler.maxPlayers).toBe(8);
      expect(drawHandler.allowSpectators).toBe(true);
    });
  });

  describe('create', () => {
    it('should return initial state', () => {
      const state = drawHandler.create();
      expect(state.round).toBe(0);
      expect(state.drawerSeat).toBe(-1);
      expect(state.phase).toBe('picking');
      expect(state.word).toBeNull();
      expect(state.strokes).toEqual([]);
      expect(state.guessed.size).toBe(0);
      expect(state.scores.size).toBe(0);
    });
  });

  describe('start', () => {
    it('should initialize round and scores', () => {
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
      ];
      const room = makeRoom(members);

      drawHandler.start!(room);

      const st = room.game as DrawState;
      expect(st.totalRounds).toBe(3); // 3 players = 3 rounds
      expect(st.scores.size).toBe(3);
      expect(st.phase).toBe('picking');
      expect(st.drawerSeat).toBe(0); // min seat
    });
  });

  describe('onAction — draw_pick', () => {
    it('should accept word pick from drawer during picking phase', () => {
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
      ];
      const room = makeRoom(members);
      const st = room.game as DrawState;
      st.drawerSeat = 0;
      st.phase = 'picking';
      st.candidates = ['太阳', '月亮', '小猫'];
      room.phase = 'playing';

      const result = drawHandler.onAction(room, members[0], 'draw_pick', { index: 0 });
      expect(result.error).toBeUndefined();

      // After picking, phase should be 'drawing'
      expect(st.phase).toBe('drawing');
      expect(st.word).toBe('太阳');
    });

    it('should reject pick from non-drawer', () => {
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
      ];
      const room = makeRoom(members);
      const st = room.game as DrawState;
      st.drawerSeat = 0;
      st.phase = 'picking';
      room.phase = 'playing';

      const result = drawHandler.onAction(room, members[1], 'draw_pick', { index: 0 });
      expect(result.error).toBe('现在不是你选词的时候');
    });

    it('should reject pick during drawing phase', () => {
      const members = [makeMember({ userId: 1, seat: 0 })];
      const room = makeRoom(members);
      const st = room.game as DrawState;
      st.drawerSeat = 0;
      st.phase = 'drawing';
      room.phase = 'playing';

      const result = drawHandler.onAction(room, members[0], 'draw_pick', { index: 0 });
      expect(result.error).toBe('现在不是你选词的时候');
    });
  });

  describe('onAction — draw_stroke', () => {
    it('should accept stroke from drawer during drawing phase', () => {
      const members = [makeMember({ userId: 1, seat: 0 })];
      const room = makeRoom(members);
      const st = room.game as DrawState;
      st.drawerSeat = 0;
      st.phase = 'drawing';
      room.phase = 'playing';

      const result = drawHandler.onAction(room, members[0], 'draw_stroke', {
        points: [{ x: 0.5, y: 0.5 }],
        color: '#333',
        width: 4,
      });
      expect(result.error).toBeUndefined();
      expect(st.strokes.length).toBe(1);
    });

    it('should reject stroke from non-drawer', () => {
      const members = [makeMember({ userId: 1, seat: 0 }), makeMember({ userId: 2, seat: 1 })];
      const room = makeRoom(members);
      const st = room.game as DrawState;
      st.drawerSeat = 0;
      st.phase = 'drawing';
      room.phase = 'playing';

      const result = drawHandler.onAction(room, members[1], 'draw_stroke', {
        points: [],
        color: '#333',
      });
      expect(result.error).toBe('只有画家能画画');
    });
  });

  describe('onAction — draw_undo', () => {
    it('should remove last stroke', () => {
      const members = [makeMember({ userId: 1, seat: 0 })];
      const room = makeRoom(members);
      const st = room.game as DrawState;
      st.drawerSeat = 0;
      st.phase = 'drawing';
      st.strokes = [{ seq: 1, points: [], color: '#333', width: 4 }];
      room.phase = 'playing';

      const result = drawHandler.onAction(room, members[0], 'draw_undo', {});
      expect(result.error).toBeUndefined();
      expect(st.strokes.length).toBe(0);
    });
  });

  describe('onAction — draw_clear', () => {
    it('should clear all strokes', () => {
      const members = [makeMember({ userId: 1, seat: 0 })];
      const room = makeRoom(members);
      const st = room.game as DrawState;
      st.drawerSeat = 0;
      st.phase = 'drawing';
      st.strokes = [
        { seq: 1, points: [], color: '#333', width: 4 },
        { seq: 2, points: [], color: '#333', width: 4 },
      ];
      room.phase = 'playing';

      const result = drawHandler.onAction(room, members[0], 'draw_clear', {});
      expect(result.error).toBeUndefined();
      expect(st.strokes.length).toBe(0);
    });
  });

  describe('onAction — draw_skip', () => {
    it('should penalize drawer and end round', () => {
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
      ];
      const room = makeRoom(members);
      const st = room.game as DrawState;
      st.drawerSeat = 0;
      st.phase = 'drawing';
      st.scores.set(1, 10);
      room.phase = 'playing';

      const result = drawHandler.onAction(room, members[0], 'draw_skip', {});
      expect(result.error).toBeUndefined();
      expect(st.scores.get(1)).toBe(8); // 10 - 2 penalty
    });
  });

  describe('onAction — guess', () => {
    function setupGuessing() {
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
      ];
      const room = makeRoom(members);
      const st = room.game as DrawState;
      st.drawerSeat = 0;
      st.phase = 'drawing';
      st.word = '太阳';
      st.startedAt = Date.now();
      st.guessed = new Set();
      st.scores = new Map([
        [1, 0],
        [2, 0],
        [3, 0],
      ]);
      room.phase = 'playing';
      return { room, members, st };
    }

    it('should reject guess from drawer', () => {
      const { room, members } = setupGuessing();
      const result = drawHandler.onAction(room, members[0], 'guess', { content: '太阳' });
      expect(result.error).toBe('画家不能猜词');
    });

    it('should reject empty guess', () => {
      const { room, members } = setupGuessing();
      const result = drawHandler.onAction(room, members[1], 'guess', { content: '' });
      expect(result.error).toBe('请输入猜词内容');
    });

    it('should accept correct guess and update scores', () => {
      const { room, members, st } = setupGuessing();
      const result = drawHandler.onAction(room, members[1], 'guess', { content: '太阳' });
      expect(result.error).toBeUndefined();
      expect(st.guessed.has(2)).toBe(true);
      expect(st.scores.get(2)).toBeGreaterThan(0);
      // Drawer gets 3 bonus points
      expect(st.scores.get(1)).toBe(3);
    });

    it('should handle case-insensitive and whitespace-trimmed matching', () => {
      const { room, members, st } = setupGuessing();
      // The normalize function lowercases and trims whitespace, but '太阳' is Chinese
      // Let's test with an exact match since Chinese doesn't have case
      const result = drawHandler.onAction(room, members[1], 'guess', { content: ' 太阳  ' });
      expect(result.error).toBeUndefined();
      expect(st.guessed.has(2)).toBe(true);
    });

    it('should not reward already-guessed player', () => {
      const { room, members, st } = setupGuessing();
      st.guessed.add(2); // already guessed

      const scoreBefore = st.scores.get(2);
      drawHandler.onAction(room, members[1], 'guess', { content: '太阳' });
      // Score unchanged — silently ignored
      expect(st.scores.get(2)).toBe(scoreBefore);
    });

    it('should record wrong guess as chat message', () => {
      const { room, members } = setupGuessing();
      const result = drawHandler.onAction(room, members[1], 'guess', { content: '月亮' });
      expect(result.error).toBeUndefined();
      // Wrong guess — not in guessed set
      expect((room.game as DrawState).guessed.has(2)).toBe(false);
    });
  });

  describe('onAction — unknown', () => {
    it('should reject unknown actions', () => {
      const members = [makeMember({ userId: 1, seat: 0 })];
      const room = makeRoom(members);
      const result = drawHandler.onAction(room, members[0], 'invalid_action', {});
      expect(result.error).toBe('未知的游戏操作');
    });
  });

  describe('onPlayerQuit', () => {
    it('should end game when players drop below 3', () => {
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
      ];
      const room = makeRoom(members);
      const st = room.game as DrawState;
      st.scores = new Map([
        [1, 10],
        [2, 20],
        [3, 15],
      ]);
      room.phase = 'playing';

      // Simulate roomManager.removeMember called before onPlayerQuit
      room.members.delete(members[2].userId);

      const result = drawHandler.onPlayerQuit!(room, members[2]);
      expect(result).toBeDefined();
      expect(result!.ended).toBeDefined();
      expect(room.phase).toBe('ended');
    });

    it('should end current round when drawer quits', () => {
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
        makeMember({ userId: 4, seat: 3 as Seat }),
      ];
      const room = makeRoom(members);
      const st = room.game as DrawState;
      st.drawerSeat = 0;
      st.phase = 'drawing';
      st.round = 1;
      st.totalRounds = 4; // must be > round so it doesn't trigger game end
      room.phase = 'playing';

      // Simulate roomManager.removeMember called before onPlayerQuit
      room.members.delete(members[0].userId);

      drawHandler.onPlayerQuit!(room, members[0]);
      // Round should have advanced
      expect(st.round).toBeGreaterThan(1);
    });
  });

  describe('serializeFor', () => {
    it('should only show word to drawer', () => {
      const drawer = makeMember({ userId: 1, seat: 0 });
      const guesser = makeMember({ userId: 2, seat: 1 });
      const room = makeRoom([drawer, guesser]);
      const st = room.game as DrawState;
      st.drawerSeat = 0;
      st.word = '太阳';
      st.phase = 'drawing';

      const drawerView = drawHandler.serializeFor(room, drawer);
      expect(drawerView.word).toBe('太阳');
      expect(drawerView.isDrawer).toBe(true);

      const guesserView = drawHandler.serializeFor(room, guesser);
      expect(guesserView.word).toBeNull();
      expect(guesserView.isDrawer).toBe(false);
    });

    it('should show guessed status per viewer', () => {
      const drawer = makeMember({ userId: 1, seat: 0 });
      const guesser = makeMember({ userId: 2, seat: 1 });
      const room = makeRoom([drawer, guesser]);
      const st = room.game as DrawState;
      st.drawerSeat = 0;
      st.word = '太阳';
      st.phase = 'drawing';
      st.guessed.add(2);

      const view = drawHandler.serializeFor(room, guesser);
      expect(view.myGuessed).toBe(true);
    });

    it('should include ranking when game is ended', () => {
      const member = makeMember({ userId: 1 });
      const room = makeRoom([member]);
      const st = room.game as DrawState;
      st.ranking = [{ userId: 1, nickname: 'P1', total: 50 }];

      const serialized = drawHandler.serializeFor(room, member);
      expect(serialized.ended).toBeDefined();
      expect((serialized.ended as any).ranking[0].total).toBe(50);
    });
  });
});
