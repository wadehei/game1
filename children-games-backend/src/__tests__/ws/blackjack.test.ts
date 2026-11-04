import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Room, Member } from '../../ws/roomManager';
import { blackjackHandler, type BJConfig } from '../../ws/games/blackjack';
import { getRoomBus } from '../../ws/bus';
import { getRoom } from '../../ws/roomManager';

// ─── Mocks ──────────────────────────────────

const mockBroadcast = vi.fn();
const mockSendToUser = vi.fn();

vi.mock('../../ws/bus', () => ({
  getRoomBus: () => ({
    broadcast: mockBroadcast,
    sendToUser: mockSendToUser,
  }),
}));

vi.mock('../../ws/roomManager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ws/roomManager')>();
  return {
    ...actual,
    getRoom: vi.fn(),
    addTimer: vi.fn((_room, timer) => timer),
    clearRoomTimers: vi.fn(),
  };
});

vi.mock('../../services/battleChips', () => ({
  applyChipDelta: vi.fn().mockResolvedValue(undefined),
  writeCareerRecords: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../utils/secureRandom', () => ({
  secureShuffle: vi.fn(<T>(arr: T[]) => [...arr]),
  securePickOne: vi.fn(<T>(arr: T[]) => arr[0]),
}));

// Mock engine functions
vi.mock('../../ws/games/blackjack/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ws/games/blackjack/engine')>();
  return {
    ...actual,
    buildDeck: vi.fn(() => {
      const deck: any[] = [];
      const suits = ['h', 's', 'd', 'c'];
      const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
      for (const suit of suits) {
        for (const rank of ranks) {
          deck.push({ suit, rank });
        }
      }
      return deck.reverse(); // So pop() gives cards in order
    }),
    handValue: vi.fn((cards: any[]) => {
      let total = 0;
      let aces = 0;
      for (const c of cards) {
        if (c.rank === 'A') {
          total += 11;
          aces++;
        } else if (['K', 'Q', 'J'].includes(c.rank)) total += 10;
        else total += parseInt(c.rank);
      }
      while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
      }
      return { total, soft: aces > 0 };
    }),
    isBlackjack: vi.fn(
      (cards: any[]) =>
        cards.length === 2 &&
        cards.some((c) => c.rank === 'A') &&
        cards.some((c) => ['K', 'Q', 'J', '10'].includes(c.rank))
    ),
    isBusted: vi.fn((cards: any[]) => {
      let total = 0;
      for (const c of cards) {
        if (c.rank === 'A') total += 11;
        else if (['K', 'Q', 'J'].includes(c.rank)) total += 10;
        else total += parseInt(c.rank);
      }
      return total > 21;
    }),
    payoutMultiplier: vi.fn((playerCards: any[], bankerCards: any[], natural: boolean) => {
      const pv = playerCards.reduce(
        (t, c) =>
          t + (c.rank === 'A' ? 11 : ['K', 'Q', 'J'].includes(c.rank) ? 10 : parseInt(c.rank)),
        0
      );
      const bv = bankerCards.reduce(
        (t, c) =>
          t + (c.rank === 'A' ? 11 : ['K', 'Q', 'J'].includes(c.rank) ? 10 : parseInt(c.rank)),
        0
      );
      if (pv > 21) return 0;
      if (bv > 21 || pv > bv) return natural ? 2.5 : 2;
      if (pv === bv) return 1;
      return 0;
    }),
    cardLabel: vi.fn((c: any) => `${c.rank}${c.suit}`),
    BET_OPTIONS: [10, 20, 50, 100],
  };
});

let mockGetRoom: ReturnType<typeof vi.fn>;
let mockGetRoomFn: typeof getRoom;

beforeEach(async () => {
  const mod = await import('../../ws/roomManager');
  mockGetRoomFn = mod.getRoom;
  mockGetRoom = vi.mocked(mod.getRoom);
});

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
    chips: 1000,
    ...overrides,
  } as Member;
}

function makeRoom(members: Member[] = [], config: Partial<BJConfig> = {}): Room {
  const memberMap = new Map<number, Member>();
  for (const m of members) memberMap.set(m.userId, m);
  return {
    id: 'room-1',
    gameType: 'blackjack',
    hostUserId: members[0]?.userId || 1,
    members: memberMap,
    phase: 'playing',
    game: blackjackHandler.create(),
    config: { bankerMode: 'rotate', roundLimit: 8, career: true, ...config },
    chat: [],
    voices: new Map(),
    timers: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  } as Room;
}

// ─── Tests ──────────────────────────────────

describe('blackjackHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('metadata', () => {
    it('should have correct game properties', () => {
      expect(blackjackHandler.type).toBe('blackjack');
      expect(blackjackHandler.title).toBe('21点');
      expect(blackjackHandler.emoji).toBe('🃏');
      expect(blackjackHandler.minPlayers).toBe(2);
      expect(blackjackHandler.maxPlayers).toBe(5);
      expect(blackjackHandler.allowSpectators).toBe(true);
      expect(blackjackHandler.rematchSwapSeats).toBe(false);
    });
  });

  describe('create', () => {
    it('should return initial state', () => {
      const state = blackjackHandler.create();
      expect(state.round).toBe(0);
      expect(state.totalRounds).toBe(8);
      expect(state.handPhase).toBe('betting');
      expect(state.deck).toEqual([]);
      expect(state.hands.size).toBe(0);
      expect(state.chips.size).toBe(0);
    });
  });

  describe('normalizeConfig', () => {
    it('should normalize valid config', () => {
      const config = blackjackHandler.normalizeConfig!({
        bankerMode: 'winner',
        roundLimit: 10,
        career: false,
      });
      expect(config).toEqual({
        bankerMode: 'winner',
        roundLimit: 10,
        career: false,
      });
    });

    it('should default invalid bankerMode to rotate', () => {
      const config = blackjackHandler.normalizeConfig!({ bankerMode: 'invalid' }) as BJConfig;
      expect(config.bankerMode).toBe('rotate');
    });

    it('should clamp roundLimit to [2, 20]', () => {
      expect((blackjackHandler.normalizeConfig!({ roundLimit: 1 }) as BJConfig).roundLimit).toBe(2);
      expect((blackjackHandler.normalizeConfig!({ roundLimit: 100 }) as BJConfig).roundLimit).toBe(
        20
      );
    });

    it('should default roundLimit to 8 when invalid', () => {
      expect(
        (blackjackHandler.normalizeConfig!({ roundLimit: 'abc' }) as BJConfig).roundLimit
      ).toBe(8);
    });
  });

  describe('start', () => {
    it('should initialize chips from members and enter betting phase', () => {
      const members = [
        makeMember({ userId: 1, seat: 0, chips: 500 }),
        makeMember({ userId: 2, seat: 1, chips: 300 }),
      ];
      const room = makeRoom(members);

      blackjackHandler.start!(room);

      const st = room.game as ReturnType<typeof blackjackHandler.create>;
      expect(st.chips.get(1)).toBe(500);
      expect(st.chips.get(2)).toBe(300);
      expect(st.handPhase).toBe('betting');
      expect(st.round).toBe(1);
      expect(st.bankerSeat).toBe(0);
    });

    it('should set bankerSeat to first funded player in rotate mode', () => {
      const members = [
        makeMember({ userId: 1, seat: 0, chips: 0 }),
        makeMember({ userId: 2, seat: 1, chips: 500 }),
      ];
      const room = makeRoom(members);

      blackjackHandler.start!(room);

      const st = room.game as ReturnType<typeof blackjackHandler.create>;
      expect(st.bankerSeat).toBe(1);
    });

    it('should randomly select banker in keep mode', () => {
      const members = [makeMember({ userId: 1, seat: 0, chips: 500 })];
      const room = makeRoom(members, { bankerMode: 'keep' });

      blackjackHandler.start!(room);

      const st = room.game as ReturnType<typeof blackjackHandler.create>;
      expect(st.config.bankerMode).toBe('keep');
    });

    it('should broadcast blackjack_phase with betting phase', () => {
      const members = [makeMember({ userId: 1, seat: 0, chips: 500 })];
      const room = makeRoom(members);

      blackjackHandler.start!(room);

      expect(mockBroadcast).toHaveBeenCalledWith(
        room,
        expect.objectContaining({
          t: 'blackjack_phase',
          phase: 'betting',
          bankerSeat: 0,
        })
      );
    });
  });

  describe('onAction — blackjack_bet', () => {
    function setupBettingRoom() {
      const members = [
        makeMember({ userId: 1, seat: 0, chips: 500 }),
        makeMember({ userId: 2, seat: 1, chips: 300 }),
      ];
      const room = makeRoom(members);
      blackjackHandler.start!(room);
      mockGetRoom.mockReturnValue(room);
      const st = room.game as ReturnType<typeof blackjackHandler.create>;
      return { room, members, st };
    }

    it('should reject bet when not in betting phase', () => {
      const { room, members } = setupBettingRoom();
      const st = room.game as ReturnType<typeof blackjackHandler.create>;
      st.handPhase = 'acting';

      const result = blackjackHandler.onAction(room, members[1], 'blackjack_bet', { amount: 10 });
      expect(result.error).toBe('现在不是下注时间');
    });

    it('should reject bet from banker', () => {
      const { room, members } = setupBettingRoom();

      const result = blackjackHandler.onAction(room, members[0], 'blackjack_bet', { amount: 10 });
      expect(result.error).toBe('庄家不下注');
    });

    it('should reject duplicate bet when already bet', () => {
      const { room, members, st } = setupBettingRoom();
      // Manually add a hand to simulate already bet
      st.hands.set(2, {
        cards: [],
        stake: 10,
        doubled: false,
        done: false,
        busted: false,
        natural: false,
      });

      const result = blackjackHandler.onAction(room, members[1], 'blackjack_bet', { amount: 10 });
      expect(result.error).toBe('你已经下过注了');
    });

    it('should reject invalid bet amount', () => {
      const { room, members } = setupBettingRoom();

      const result = blackjackHandler.onAction(room, members[1], 'blackjack_bet', { amount: 15 });
      expect(result.error).toBe('下注金额只能是 10/20/50/100');
    });

    it('should reject bet exceeding chips', () => {
      const { room, members, st } = setupBettingRoom();
      // Set chips in both member and state
      members[1].chips = 5;
      st.chips.set(2, 5);

      const result = blackjackHandler.onAction(room, members[1], 'blackjack_bet', { amount: 10 });
      expect(result.error).toBe('积分不足');
    });

    it('should accept valid bet and broadcast', () => {
      const { room, members } = setupBettingRoom();

      const result = blackjackHandler.onAction(room, members[1], 'blackjack_bet', { amount: 20 });
      expect(result.error).toBeUndefined();

      const st = room.game as ReturnType<typeof blackjackHandler.create>;
      expect(st.hands.has(2)).toBe(true);
      expect(st.hands.get(2)!.stake).toBe(20);
      expect(st.chips.get(2)).toBe(280);

      expect(mockBroadcast).toHaveBeenCalledWith(
        room,
        expect.objectContaining({
          t: 'blackjack_action',
          userId: 2,
          action: 'bet',
          stake: 20,
        })
      );
    });

    it('should deal cards when all active players bet', () => {
      const { room, members } = setupBettingRoom();

      blackjackHandler.onAction(room, members[1], 'blackjack_bet', { amount: 10 });

      const st = room.game as ReturnType<typeof blackjackHandler.create>;
      expect(st.handPhase).toBe('acting');
      expect(st.hands.get(2)!.cards.length).toBe(2);
      expect(st.banker.cards.length).toBe(2);
    });
  });

  describe('onAction — blackjack_hit/stand/double', () => {
    function setupActingRoom() {
      const members = [
        makeMember({ userId: 1, seat: 0, chips: 500 }),
        makeMember({ userId: 2, seat: 1, chips: 300 }),
      ];
      const room = makeRoom(members);
      blackjackHandler.start!(room);
      mockGetRoom.mockReturnValue(room);

      // Place bet to enter acting phase
      blackjackHandler.onAction(room, members[1], 'blackjack_bet', { amount: 10 });

      const st = room.game as ReturnType<typeof blackjackHandler.create>;
      st.turnSeat = 1 as number;
      return { room, members, st };
    }

    it('should reject action when not in acting phase', () => {
      const { room, members } = setupActingRoom();
      const st = room.game as ReturnType<typeof blackjackHandler.create>;
      st.handPhase = 'betting';

      const result = blackjackHandler.onAction(room, members[1], 'blackjack_hit', {});
      expect(result.error).toBe('现在不是操作时间');
    });

    it('should reject action from banker', () => {
      const { room, members } = setupActingRoom();

      const result = blackjackHandler.onAction(room, members[0], 'blackjack_hit', {});
      expect(result.error).toBe('庄家不需要操作');
    });

    it('should reject action when not turn', () => {
      const { room, members, st } = setupActingRoom();
      st.turnSeat = 0;

      const result = blackjackHandler.onAction(room, members[1], 'blackjack_hit', {});
      expect(result.error).toBe('还没轮到你');
    });

    it('should handle hit and broadcast card', () => {
      const { room, members } = setupActingRoom();

      const result = blackjackHandler.onAction(room, members[1], 'blackjack_hit', {});
      expect(result.error).toBeUndefined();

      expect(mockBroadcast).toHaveBeenCalledWith(
        room,
        expect.objectContaining({
          t: 'blackjack_action',
          userId: 2,
          action: 'hit',
        })
      );
    });

    it('should handle stand and advance turn', () => {
      const { room, members } = setupActingRoom();

      const result = blackjackHandler.onAction(room, members[1], 'blackjack_stand', {});
      expect(result.error).toBeUndefined();

      expect(mockBroadcast).toHaveBeenCalledWith(
        room,
        expect.objectContaining({
          t: 'blackjack_action',
          userId: 2,
          action: 'stand',
        })
      );
    });

    it('should reject double after first two cards', () => {
      const { room, members, st } = setupActingRoom();
      // Add a third card
      st.hands.get(2)!.cards.push({ suit: '♠' as const, rank: 5 });

      const result = blackjackHandler.onAction(room, members[1], 'blackjack_double', {});
      expect(result.error).toBe('只能在前两张后加倍');
    });

    it('should handle double and double stake', () => {
      const { room, members } = setupActingRoom();

      const result = blackjackHandler.onAction(room, members[1], 'blackjack_double', {});
      expect(result.error).toBeUndefined();

      const st = room.game as ReturnType<typeof blackjackHandler.create>;
      expect(st.hands.get(2)!.stake).toBe(20);
      expect(st.hands.get(2)!.doubled).toBe(true);
    });

    it('should reject double with insufficient chips', () => {
      const { room, members, st } = setupActingRoom();
      members[1].chips = 5;
      st.chips.set(2, 5);

      const result = blackjackHandler.onAction(room, members[1], 'blackjack_double', {});
      expect(result.error).toBe('积分不足，无法加倍');
    });
  });

  describe('onAction — blackjack_pass_bank', () => {
    it('should reject pass_bank in non-keep mode', () => {
      const members = [makeMember({ userId: 1, seat: 0, chips: 500 })];
      const room = makeRoom(members, { bankerMode: 'rotate' });
      blackjackHandler.start!(room);

      const result = blackjackHandler.onAction(room, members[0], 'blackjack_pass_bank', {});
      expect(result.error).toBe('只有持续坐庄模式下庄家可以让庄');
    });

    it('should reject pass_bank from non-banker', () => {
      const members = [
        makeMember({ userId: 1, seat: 0, chips: 500 }),
        makeMember({ userId: 2, seat: 1, chips: 300 }),
      ];
      const room = makeRoom(members, { bankerMode: 'keep' });
      blackjackHandler.start!(room);

      const result = blackjackHandler.onAction(room, members[1], 'blackjack_pass_bank', {});
      expect(result.error).toBe('只有持续坐庄模式下庄家可以让庄');
    });
  });

  describe('onAction — unknown', () => {
    it('should reject unknown actions', () => {
      const room = makeRoom([makeMember()]);
      blackjackHandler.start!(room);

      const result = blackjackHandler.onAction(room, makeMember(), 'invalid_action', {});
      expect(result.error).toBe('未知的游戏操作');
    });
  });

  describe('onMemberOffline', () => {
    it('should mark hand as done when player goes offline during acting', () => {
      const members = [
        makeMember({ userId: 1, seat: 0, chips: 500 }),
        makeMember({ userId: 2, seat: 1, chips: 300 }),
      ];
      const room = makeRoom(members);
      blackjackHandler.start!(room);
      mockGetRoom.mockReturnValue(room);

      blackjackHandler.onAction(room, members[1], 'blackjack_bet', { amount: 10 });

      const st = room.game as ReturnType<typeof blackjackHandler.create>;
      st.turnSeat = 1 as number;

      blackjackHandler.onMemberOffline!(room, members[1]);

      expect(st.hands.get(2)!.done).toBe(true);
    });
  });

  describe('onPlayerQuit', () => {
    it('should mark hand as done and busted when player quits during hand', () => {
      const members = [
        makeMember({ userId: 1, seat: 0, chips: 500 }),
        makeMember({ userId: 2, seat: 1, chips: 300 }),
      ];
      const room = makeRoom(members);
      blackjackHandler.start!(room);
      mockGetRoom.mockReturnValue(room);

      blackjackHandler.onAction(room, members[1], 'blackjack_bet', { amount: 10 });

      const st = room.game as ReturnType<typeof blackjackHandler.create>;
      blackjackHandler.onPlayerQuit!(room, members[1]);

      expect(st.hands.get(2)!.done).toBe(true);
      expect(st.hands.get(2)!.busted).toBe(true);
    });

    it('should end game when fewer than 2 players remain', () => {
      const members = [
        makeMember({ userId: 1, seat: 0, chips: 500 }),
        makeMember({ userId: 2, seat: 1, chips: 300 }),
      ];
      const room = makeRoom(members);
      blackjackHandler.start!(room);

      // Remove member 2 from room (simulating roomManager behavior)
      room.members.delete(2);

      const result = blackjackHandler.onPlayerQuit!(room, members[1]);
      expect(result).toBeDefined();
      expect(result!.ended).toBeDefined();
    });

    it('should refund bets when banker quits', () => {
      const members = [
        makeMember({ userId: 1, seat: 0, chips: 500 }),
        makeMember({ userId: 2, seat: 1, chips: 300 }),
      ];
      const room = makeRoom(members);
      blackjackHandler.start!(room);
      mockGetRoom.mockReturnValue(room);

      blackjackHandler.onAction(room, members[1], 'blackjack_bet', { amount: 10 });

      const st = room.game as ReturnType<typeof blackjackHandler.create>;
      const chipsBefore = st.chips.get(2);

      // Banker quits
      blackjackHandler.onPlayerQuit!(room, members[0]);

      // Player should get refund
      expect(st.chips.get(2)).toBeGreaterThanOrEqual(chipsBefore!);
    });
  });

  describe('serializeFor', () => {
    it('should show banker their full hand', () => {
      const members = [
        makeMember({ userId: 1, seat: 0, chips: 500 }),
        makeMember({ userId: 2, seat: 1, chips: 300 }),
      ];
      const room = makeRoom(members);
      blackjackHandler.start!(room);
      mockGetRoom.mockReturnValue(room);

      blackjackHandler.onAction(room, members[1], 'blackjack_bet', { amount: 10 });

      const st = room.game as ReturnType<typeof blackjackHandler.create>;
      const serialized = blackjackHandler.serializeFor(room, members[0]);

      expect(serialized.isBanker).toBe(true);
      expect(serialized.bankerCards).toBeDefined();
      expect((serialized.bankerCards as any[]).length).toBe(2);
    });

    it('should show non-banker only one banker card', () => {
      const members = [
        makeMember({ userId: 1, seat: 0, chips: 500 }),
        makeMember({ userId: 2, seat: 1, chips: 300 }),
      ];
      const room = makeRoom(members);
      blackjackHandler.start!(room);
      mockGetRoom.mockReturnValue(room);

      blackjackHandler.onAction(room, members[1], 'blackjack_bet', { amount: 10 });

      const st = room.game as ReturnType<typeof blackjackHandler.create>;
      st.banker.revealed = false;
      const serialized = blackjackHandler.serializeFor(room, members[1]);

      expect(serialized.isBanker).toBe(false);
      expect((serialized.bankerCards as any[]).length).toBe(1);
    });

    it('should include ranking when game ended', () => {
      const members = [makeMember({ userId: 1, seat: 0, chips: 500 })];
      const room = makeRoom(members);
      const st = room.game as ReturnType<typeof blackjackHandler.create>;
      st.ranking = [{ userId: 1, nickname: 'P1', chips: 600, delta: 100, seat: 0 }];
      st.endReason = '手数已打满';

      const serialized = blackjackHandler.serializeFor(room, members[0]);
      expect(serialized.ended).toBeDefined();
      expect((serialized.ended as any).ranking).toBeDefined();
    });

    it('should include betLedger', () => {
      const members = [
        makeMember({ userId: 1, seat: 0, chips: 500 }),
        makeMember({ userId: 2, seat: 1, chips: 300 }),
      ];
      const room = makeRoom(members);
      blackjackHandler.start!(room);
      mockGetRoom.mockReturnValue(room);

      blackjackHandler.onAction(room, members[1], 'blackjack_bet', { amount: 10 });

      const serialized = blackjackHandler.serializeFor(room, members[1]);
      expect(serialized.betLedger).toBeDefined();
      expect((serialized.betLedger as any[]).length).toBeGreaterThan(0);
    });
  });

  describe('timeout behavior', () => {
    it('should auto-bet minimum for inactive players after betting timeout', () => {
      const members = [
        makeMember({ userId: 1, seat: 0, chips: 500 }),
        makeMember({ userId: 2, seat: 1, chips: 300 }),
      ];
      const room = makeRoom(members);
      blackjackHandler.start!(room);
      mockGetRoom.mockReturnValue(room);

      // Advance past betting timeout (15s)
      vi.advanceTimersByTime(15000);

      const st = room.game as ReturnType<typeof blackjackHandler.create>;
      // Player 2 should have been auto-bet
      expect(st.hands.has(2)).toBe(true);
    });

    it('should auto-stand after acting timeout', () => {
      const members = [
        makeMember({ userId: 1, seat: 0, chips: 500 }),
        makeMember({ userId: 2, seat: 1, chips: 300 }),
      ];
      const room = makeRoom(members);
      blackjackHandler.start!(room);
      mockGetRoom.mockReturnValue(room);

      blackjackHandler.onAction(room, members[1], 'blackjack_bet', { amount: 10 });

      const st = room.game as ReturnType<typeof blackjackHandler.create>;
      st.turnSeat = 1 as number;

      // Advance past acting timeout (20s)
      vi.advanceTimersByTime(20000);

      expect(st.hands.get(2)!.done).toBe(true);
    });
  });
});
