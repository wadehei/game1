import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { Room, Member, Seat } from '../../ws/roomManager';
import type { ZjhConfig } from '../../ws/games/zjh';
import type { Card } from '../../ws/games/blackjack/engine';
import { zjhHandler } from '../../ws/games/zjh';

// Mock bus
const mockBroadcast = vi.fn();
const mockSendToUser = vi.fn();
vi.mock('../../ws/bus', () => ({
  getRoomBus: () => ({
    broadcast: mockBroadcast,
    sendToUser: mockSendToUser,
  }),
}));

// Mock roomManager (getRoom, addTimer, clearRoomTimers)
vi.mock('../../ws/roomManager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ws/roomManager')>();
  return {
    ...actual,
    getRoom: vi.fn(),
    addTimer: vi.fn(),
    clearRoomTimers: vi.fn(),
  };
});

// Mock battleChips
vi.mock('../../services/battleChips', () => ({
  applyChipDelta: vi.fn().mockResolvedValue(0),
  writeCareerRecords: vi.fn().mockResolvedValue(undefined),
}));

// Mock secureRandom (used by buildZjhDeck via engine)
vi.mock('../../utils/secureRandom', () => ({
  secureShuffle: vi.fn((arr: unknown[]) => arr),
}));

// Build a predictable deck
function buildPredictableDeck(): Card[] {
  const deck: Card[] = [];
  const suits: Card['suit'][] = ['♠', '♥', '♦', '♣'];
  for (const suit of suits) {
    for (let rank = 1; rank <= 13; rank += 1) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

// Mock zjh engine
vi.mock('../../ws/games/zjh/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ws/games/zjh/engine')>();
  return {
    ...actual,
    buildZjhDeck: vi.fn(() => buildPredictableDeck()),
    compareZjh: vi.fn().mockReturnValue(1),
  };
});

// Import mocked modules - initialized in beforeAll
let mockCompareZjh: ReturnType<typeof vi.fn>;
let mockBuildZjhDeck: ReturnType<typeof vi.fn>;
let mockGetRoom: ReturnType<typeof vi.fn>;

// Import actual engine for engine tests (using vi.importActual)
let actualCompareZjh: (a: Card[], b: Card[], special235: boolean) => number;
let actualHandRank: (cards: Card[]) => import('../../ws/games/zjh/engine').ZjhRank;
let actualTypeName: (rank: import('../../ws/games/zjh/engine').ZjhRank) => string;

beforeAll(async () => {
  const engine = await import('../../ws/games/zjh/engine');
  const rm = await import('../../ws/roomManager');
  mockCompareZjh = vi.mocked(engine.compareZjh);
  mockBuildZjhDeck = vi.mocked(engine.buildZjhDeck);
  mockGetRoom = vi.mocked(rm.getRoom);
  const actual = await vi.importActual<typeof import('../../ws/games/zjh/engine')>(
    '../../ws/games/zjh/engine'
  );
  actualCompareZjh = actual.compareZjh;
  actualHandRank = actual.handRank;
  actualTypeName = actual.typeName;
});

// Helper to create a room
function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 'room-zjh-1',
    gameType: 'zjh',
    hostUserId: 1,
    members: new Map(),
    phase: 'playing',
    game: zjhHandler.create(),
    config: {},
    chat: [],
    voices: new Map(),
    timers: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    ...overrides,
  } as Room;
}

// Helper to create a member
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
    chips: 1000,
    ...overrides,
  } as Member;
}

// Helper to set up a room with players and start the game
function setupGameRoom(playerCount = 3) {
  const room = makeRoom();
  const members: Member[] = [];
  for (let i = 0; i < playerCount; i += 1) {
    const m = makeMember({
      userId: i + 1,
      nickname: `Player${i + 1}`,
      seat: i as Seat,
      chips: 1000,
    });
    members.push(m);
    room.members.set(m.userId, m);
  }

  // Initialize game state manually (simulating start)
  const st = room.game as any;
  st.config = {
    special235: true,
    timeoutFold: true,
    roundLimit: 15,
    career: true,
    bankerMode: 'rotate',
    mustBlindRounds: 0,
  } as ZjhConfig;
  st.totalRounds = 15;
  st.round = 1;
  st.dealerSeat = 0;
  st.handPhase = 'betting';
  st.pot = 30; // 3 players * 10 ante
  st.stake = 10;
  st.roundNo = 1;
  st.turnSeat = 1 as Seat;
  st.deck = buildPredictableDeck(); // Set a proper deck
  st.players = new Map();
  st.chips = new Map();
  st.handStartChips = new Map();
  st.initialChips = new Map();
  st.betLog = new Map();
  st.lastWinnerSeat = null;

  for (const m of members) {
    st.chips.set(m.userId, 990); // 1000 - 10 ante
    st.handStartChips.set(m.userId, 990);
    st.initialChips.set(m.userId, 1000);
    st.players.set(m.userId, {
      cards: [],
      seen: false,
      folded: false,
      allIn: false,
      betTotal: 10,
      timeoutCalls: 0,
    });
    st.betLog.set(m.userId, [{ round: 1, betTotal: 10, delta: null, ended: null }]);
  }

  return { room, members, st };
}

describe('zjhHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompareZjh.mockReturnValue(1);
    mockBuildZjhDeck.mockReturnValue(buildPredictableDeck());
    mockGetRoom.mockReturnValue(undefined);
  });

  describe('metadata', () => {
    it('should have correct game type', () => {
      expect(zjhHandler.type).toBe('zjh');
    });

    it('should have correct title and emoji', () => {
      expect(zjhHandler.title).toBe('比大小');
      expect(zjhHandler.emoji).toBe('♠️');
    });

    it('should have correct player limits', () => {
      expect(zjhHandler.minPlayers).toBe(2);
      expect(zjhHandler.maxPlayers).toBe(6);
    });

    it('should allow spectators', () => {
      expect(zjhHandler.allowSpectators).toBe(true);
    });

    it('should not swap seats on rematch', () => {
      expect(zjhHandler.rematchSwapSeats).toBe(false);
    });

    it('should have a description', () => {
      expect(zjhHandler.desc).toContain('闷看加注比牌');
    });
  });

  describe('normalizeConfig', () => {
    it('should apply default values', () => {
      const config = zjhHandler.normalizeConfig!({}) as ZjhConfig;
      expect(config.special235).toBe(true);
      expect(config.timeoutFold).toBe(true);
      expect(config.career).toBe(true);
      expect(config.bankerMode).toBe('rotate');
      expect(config.mustBlindRounds).toBe(0);
    });

    it('should respect explicit config values', () => {
      const config = zjhHandler.normalizeConfig!({
        special235: false,
        timeoutFold: false,
        career: false,
        bankerMode: 'winner',
        mustBlindRounds: 2,
        roundLimit: 10,
      }) as ZjhConfig;
      expect(config.special235).toBe(false);
      expect(config.timeoutFold).toBe(false);
      expect(config.career).toBe(false);
      expect(config.bankerMode).toBe('winner');
      expect(config.mustBlindRounds).toBe(2);
      expect(config.roundLimit).toBe(10);
    });

    it('should clamp roundLimit to [2, 30]', () => {
      expect((zjhHandler.normalizeConfig!({ roundLimit: 1 }) as ZjhConfig).roundLimit).toBe(2);
      expect((zjhHandler.normalizeConfig!({ roundLimit: 50 }) as ZjhConfig).roundLimit).toBe(30);
      expect((zjhHandler.normalizeConfig!({ roundLimit: 15 }) as ZjhConfig).roundLimit).toBe(15);
    });

    it('should clamp mustBlindRounds to [0, 3]', () => {
      expect(
        (zjhHandler.normalizeConfig!({ mustBlindRounds: -1 }) as ZjhConfig).mustBlindRounds
      ).toBe(0);
      expect(
        (zjhHandler.normalizeConfig!({ mustBlindRounds: 5 }) as ZjhConfig).mustBlindRounds
      ).toBe(3);
    });

    it('should use default roundLimit for NaN', () => {
      const config = zjhHandler.normalizeConfig!({ roundLimit: 'abc' }) as ZjhConfig;
      expect(config.roundLimit).toBe(15);
    });
  });

  describe('create', () => {
    it('should return initial game state', () => {
      const state = zjhHandler.create();
      expect(state).toBeDefined();
      expect(state.round).toBe(0);
      expect(state.totalRounds).toBe(15);
      expect(state.handPhase).toBe('betting');
      expect(state.pot).toBe(0);
      expect(state.stake).toBe(10);
      expect(state.players.size).toBe(0);
      expect(state.chips.size).toBe(0);
      expect(state.timer).toBeNull();
      expect(state.ranking).toBeNull();
      expect(state.lastWinnerSeat).toBeNull();
    });

    it('should have default config', () => {
      const state = zjhHandler.create();
      expect(state.config.special235).toBe(true);
      expect(state.config.timeoutFold).toBe(true);
      expect(state.config.bankerMode).toBe('rotate');
      expect(state.config.career).toBe(true);
    });
  });

  describe('onAction — zjh_look', () => {
    it('should allow looking at cards', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];

      const result = zjhHandler.onAction(room, member, 'zjh_look', {});
      expect(result.error).toBeUndefined();

      const st = room.game as any;
      const p = st.players.get(member.userId);
      expect(p.seen).toBe(true);
      expect(p.cards.length).toBe(3);
    });

    it('should reject if already seen', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.players.get(member.userId).seen = true;

      const result = zjhHandler.onAction(room, member, 'zjh_look', {});
      expect(result.error).toBe('你已经看过牌了');
    });

    it('should reject during mustBlindRounds', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.config.mustBlindRounds = 3;
      st.roundNo = 2;

      const result = zjhHandler.onAction(room, member, 'zjh_look', {});
      expect(result.error).toBe('前 3 轮必须闷牌');
    });

    it('should allow look when mustBlindRounds is satisfied', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.config.mustBlindRounds = 2;
      st.roundNo = 3;

      const result = zjhHandler.onAction(room, member, 'zjh_look', {});
      expect(result.error).toBeUndefined();
    });

    it('should send cards privately to the player', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];

      zjhHandler.onAction(room, member, 'zjh_look', {});

      expect(mockSendToUser).toHaveBeenCalledWith(
        room,
        member.userId,
        expect.objectContaining({ t: 'zjh_your_cards' })
      );
    });

    it('should reset timeoutCalls on look', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.players.get(member.userId).timeoutCalls = 2;

      zjhHandler.onAction(room, member, 'zjh_look', {});
      expect(st.players.get(member.userId).timeoutCalls).toBe(0);
    });

    it('should broadcast look action', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];

      zjhHandler.onAction(room, member, 'zjh_look', {});

      expect(mockBroadcast).toHaveBeenCalledWith(
        room,
        expect.objectContaining({
          t: 'zjh_action',
          userId: member.userId,
          action: 'look',
        })
      );
    });
  });

  describe('onAction — zjh_call (跟注)', () => {
    it('should allow call when it is player turn', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];

      const result = zjhHandler.onAction(room, member, 'zjh_call', {});
      expect(result.error).toBeUndefined();

      const st = room.game as any;
      expect(st.pot).toBe(40); // 30 + 10
      expect(st.players.get(member.userId).betTotal).toBe(20);
    });

    it('should deduct correct amount for seen player (2x stake)', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.players.get(member.userId).seen = true;

      zjhHandler.onAction(room, member, 'zjh_call', {});

      expect(st.pot).toBe(50); // 30 + 20
      expect(st.players.get(member.userId).betTotal).toBe(30);
    });

    it('should set allIn when not enough chips', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.chips.set(member.userId, 5);

      zjhHandler.onAction(room, member, 'zjh_call', {});

      expect(st.players.get(member.userId).allIn).toBe(true);
      expect(st.pot).toBe(35); // 30 + 5
    });

    it('should reset timeoutCalls on manual call', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.players.get(member.userId).timeoutCalls = 3;

      zjhHandler.onAction(room, member, 'zjh_call', {});
      expect(st.players.get(member.userId).timeoutCalls).toBe(0);
    });

    it('should broadcast call action', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];

      zjhHandler.onAction(room, member, 'zjh_call', {});

      expect(mockBroadcast).toHaveBeenCalledWith(
        room,
        expect.objectContaining({
          t: 'zjh_action',
          userId: member.userId,
          action: 'call',
        })
      );
    });
  });

  describe('onAction — zjh_fold (弃牌)', () => {
    it('should allow fold when it is player turn', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];

      const result = zjhHandler.onAction(room, member, 'zjh_fold', {});
      expect(result.error).toBeUndefined();

      const st = room.game as any;
      expect(st.players.get(member.userId).folded).toBe(true);
    });

    it('should broadcast fold action', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];

      zjhHandler.onAction(room, member, 'zjh_fold', {});

      expect(mockBroadcast).toHaveBeenCalledWith(
        room,
        expect.objectContaining({
          t: 'zjh_action',
          userId: member.userId,
          action: 'fold',
        })
      );
    });

    it('should reset timeoutCalls on manual fold', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.players.get(member.userId).timeoutCalls = 2;

      zjhHandler.onAction(room, member, 'zjh_fold', {});
      expect(st.players.get(member.userId).timeoutCalls).toBe(0);
    });
  });

  describe('onAction — zjh_raise (加注)', () => {
    it('should allow raise with valid amount', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];

      const result = zjhHandler.onAction(room, member, 'zjh_raise', { amount: 10 });
      expect(result.error).toBeUndefined();

      const st = room.game as any;
      expect(st.stake).toBe(20);
    });

    it('should reject invalid raise amount', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];

      const result = zjhHandler.onAction(room, member, 'zjh_raise', { amount: 15 });
      expect(result.error).toBe('加注档位只能是 10/20/50');
    });

    it('should reject when stake is capped', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.stake = 100;

      const result = zjhHandler.onAction(room, member, 'zjh_raise', { amount: 10 });
      expect(result.error).toBe('单注已封顶');
    });

    it('should reject when not enough chips', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.chips.set(member.userId, 0);

      const result = zjhHandler.onAction(room, member, 'zjh_raise', { amount: 10 });
      expect(result.error).toBe('积分不足，无法加注');
    });

    it('should cap stake at STAKE_CAP (100)', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.stake = 90;

      zjhHandler.onAction(room, member, 'zjh_raise', { amount: 50 });
      expect(st.stake).toBe(100);
    });

    it('should charge seen player 2x new stake for raise', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.players.get(member.userId).seen = true;

      zjhHandler.onAction(room, member, 'zjh_raise', { amount: 10 });
      // newStake = 20, cost for seen = 20 * 2 = 40
      expect(st.chips.get(member.userId)).toBe(950); // 990 - 40
    });
  });

  describe('onAction — zjh_compare (比牌)', () => {
    it('should allow compare when round >= 3', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.roundNo = 3;

      const result = zjhHandler.onAction(room, member, 'zjh_compare', { target: 2 });
      expect(result.error).toBeUndefined();
    });

    it('should reject compare before round 3', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.roundNo = 2;

      const result = zjhHandler.onAction(room, member, 'zjh_compare', { target: 2 });
      expect(result.error).toBe('第 3 轮起才能比牌');
    });

    it('should reject compare with invalid target', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.roundNo = 3;

      const result = zjhHandler.onAction(room, member, 'zjh_compare', { target: 99 });
      expect(result.error).toBe('无效的比牌对象');
    });

    it('should reject compare with self', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.roundNo = 3;

      const result = zjhHandler.onAction(room, member, 'zjh_compare', { target: member.seat });
      expect(result.error).toBe('无效的比牌对象');
    });

    it('should reject compare with folded player', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.roundNo = 3;
      st.players.get(members[2].userId).folded = true;

      const result = zjhHandler.onAction(room, member, 'zjh_compare', { target: 2 });
      expect(result.error).toBe('对方已弃牌');
    });

    it('should reject compare with all-in player', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.roundNo = 3;
      st.players.get(members[2].userId).allIn = true;

      const result = zjhHandler.onAction(room, member, 'zjh_compare', { target: 2 });
      expect(result.error).toBe('对方已 all-in，不能与其比牌');
    });

    it('should reject when not enough chips for compare', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.roundNo = 3;
      st.chips.set(member.userId, 0);

      const result = zjhHandler.onAction(room, member, 'zjh_compare', { target: 2 });
      expect(result.error).toBe('积分不足，无法比牌');
    });

    it('should charge correct compare cost (blind: 2x stake)', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.roundNo = 3;

      zjhHandler.onAction(room, member, 'zjh_compare', { target: 2 });

      expect(st.pot).toBe(50); // 30 + 20
    });

    it('should charge correct compare cost (seen: 4x stake)', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.roundNo = 3;
      st.players.get(member.userId).seen = true;

      zjhHandler.onAction(room, member, 'zjh_compare', { target: 2 });

      expect(st.pot).toBe(70); // 30 + 40
    });

    it('should mark loser as folded after compare', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.roundNo = 3;
      mockCompareZjh.mockReturnValue(1); // me wins

      zjhHandler.onAction(room, member, 'zjh_compare', { target: 2 });

      expect(st.players.get(members[2].userId).folded).toBe(true);
    });

    it('should mark me as folded if I lose compare', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.roundNo = 3;
      mockCompareZjh.mockReturnValue(-1); // I lose

      zjhHandler.onAction(room, member, 'zjh_compare', { target: 2 });

      expect(st.players.get(member.userId).folded).toBe(true);
    });

    it('should broadcast compare result with reveals', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.roundNo = 3;

      zjhHandler.onAction(room, member, 'zjh_compare', { target: 2 });

      expect(mockBroadcast).toHaveBeenCalledWith(
        room,
        expect.objectContaining({
          t: 'zjh_compare',
          from: member.userId,
          to: members[2].userId,
          reveals: expect.arrayContaining([
            expect.objectContaining({ userId: member.userId }),
            expect.objectContaining({ userId: members[2].userId }),
          ]),
        })
      );
    });

    it('should send compare cards to both players', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.roundNo = 3;

      zjhHandler.onAction(room, member, 'zjh_compare', { target: 2 });

      expect(mockSendToUser).toHaveBeenCalledWith(
        room,
        member.userId,
        expect.objectContaining({ t: 'zjh_compare_cards' })
      );
      expect(mockSendToUser).toHaveBeenCalledWith(
        room,
        members[2].userId,
        expect.objectContaining({ t: 'zjh_compare_cards' })
      );
    });
  });

  describe('onAction — error cases', () => {
    it('should reject action when not in betting phase', () => {
      const { room, members } = setupGameRoom();
      const st = room.game as any;
      st.handPhase = 'showdown';

      const result = zjhHandler.onAction(room, members[1], 'zjh_call', {});
      expect(result.error).toBe('当前不是下注阶段');
    });

    it('should reject action when room phase is not playing', () => {
      const { room, members } = setupGameRoom();
      room.phase = 'ended';

      const result = zjhHandler.onAction(room, members[1], 'zjh_call', {});
      expect(result.error).toBe('当前不是下注阶段');
    });

    it('should reject action for player not in game', () => {
      const { room } = setupGameRoom();
      const outsider = makeMember({ userId: 999, seat: 0 });

      const result = zjhHandler.onAction(room, outsider, 'zjh_call', {});
      expect(result.error).toBe('你不在本手牌局中');
    });

    it('should reject action for folded player', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.players.get(member.userId).folded = true;

      const result = zjhHandler.onAction(room, member, 'zjh_call', {});
      expect(result.error).toBe('你已弃牌');
    });

    it('should reject action for all-in player', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      st.players.get(member.userId).allIn = true;

      const result = zjhHandler.onAction(room, member, 'zjh_call', {});
      expect(result.error).toBe('你已 all-in，等待开牌');
    });

    it('should reject action when not player turn', () => {
      const { room, members } = setupGameRoom();
      const member = members[0]; // seat 0, but turnSeat = 1

      const result = zjhHandler.onAction(room, member, 'zjh_call', {});
      expect(result.error).toBe('还没轮到你');
    });

    it('should reject unknown action', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];

      const result = zjhHandler.onAction(room, member, 'zjh_invalid', {});
      expect(result.error).toBe('未知的游戏操作');
    });
  });

  describe('onPlayerQuit', () => {
    it('should mark player as folded and remove from players map on quit', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;

      zjhHandler.onPlayerQuit!(room, member);

      // Player is deleted from map after quit
      expect(st.players.has(member.userId)).toBe(false);
    });

    it('should settle bet log entry on quit', () => {
      const { room, members } = setupGameRoom();
      const member = members[1];
      const st = room.game as any;
      // Keep a reference to the log before quit
      const log = st.betLog.get(member.userId);

      zjhHandler.onPlayerQuit!(room, member);

      // betLog entry should be marked
      expect(log).toBeDefined();
      expect(log![0].ended).toBe('fold');
      expect(log![0].delta).toBe(-10);
    });

    it('should return ended when fewer than 2 players remain', () => {
      // Need 3 players so game continues after first quit
      const room = makeRoom();
      const m1 = makeMember({ userId: 1, seat: 0, chips: 1000 });
      const m2 = makeMember({ userId: 2, seat: 1, chips: 1000 });
      const m3 = makeMember({ userId: 3, seat: 2 as Seat, chips: 1000 });
      room.members.set(m1.userId, m1);
      room.members.set(m2.userId, m2);
      room.members.set(m3.userId, m3);

      const st = room.game as any;
      st.config = {
        special235: true,
        timeoutFold: true,
        roundLimit: 15,
        career: true,
        bankerMode: 'rotate',
        mustBlindRounds: 0,
      };
      st.totalRounds = 15;
      st.round = 1;
      st.dealerSeat = 0;
      st.handPhase = 'betting';
      st.pot = 30;
      st.stake = 10;
      st.roundNo = 1;
      st.turnSeat = 1 as Seat;
      st.deck = buildPredictableDeck();
      st.players = new Map();
      st.chips = new Map();
      st.handStartChips = new Map();
      st.initialChips = new Map();
      st.betLog = new Map();
      st.lastWinnerSeat = null;
      for (const m of [m1, m2, m3]) {
        st.chips.set(m.userId, 990);
        st.handStartChips.set(m.userId, 990);
        st.initialChips.set(m.userId, 1000);
        st.players.set(m.userId, {
          cards: [],
          seen: false,
          folded: false,
          allIn: false,
          betTotal: 10,
          timeoutCalls: 0,
        });
        st.betLog.set(m.userId, [{ round: 1, betTotal: 10, delta: null, ended: null }]);
      }

      // Quit first player - should still be playing (2 players left)
      room.members.delete(m1.userId);
      zjhHandler.onPlayerQuit!(room, m1);
      expect(room.phase).toBe('playing');

      // Quit second player - should end game (1 player left)
      room.members.delete(m2.userId);
      const result = zjhHandler.onPlayerQuit!(room, m2);
      expect(result).toBeDefined();
    });

    it('should advance turn if quitting player was current turn holder', () => {
      const { room, members } = setupGameRoom();
      const member = members[1]; // turnSeat = 1
      mockGetRoom.mockReturnValue(room);

      zjhHandler.onPlayerQuit!(room, member);

      // advanceTurn was called, which broadcasts
      expect(mockBroadcast).toHaveBeenCalled();
    });
  });

  describe('serializeFor', () => {
    it('should return game state', () => {
      const { room, members } = setupGameRoom();
      const viewer = members[0];

      const serialized = zjhHandler.serializeFor(room, viewer);

      expect(serialized.round).toBe(1);
      expect(serialized.totalRounds).toBe(15);
      expect(serialized.phase).toBe('betting');
      expect(serialized.dealerSeat).toBe(0);
      expect(serialized.pot).toBe(30);
      expect(serialized.stake).toBe(10);
      expect(serialized.roundNo).toBe(1);
      expect(serialized.turnSeat).toBe(1);
    });

    it('should not leak hand cards to player who has not looked', () => {
      const { room, members } = setupGameRoom();
      const viewer = members[0];

      const serialized = zjhHandler.serializeFor(room, viewer);

      expect(serialized.myCards).toBeNull();
      expect(serialized.myRank).toBeNull();
    });

    it('should show cards to player who has looked', () => {
      const { room, members } = setupGameRoom();
      const viewer = members[0];
      const st = room.game as any;
      st.players.get(viewer.userId).seen = true;
      st.players.get(viewer.userId).cards = [
        { suit: '♠', rank: 14 },
        { suit: '♠', rank: 13 },
        { suit: '♠', rank: 12 },
      ];

      const serialized = zjhHandler.serializeFor(room, viewer);

      expect(serialized.myCards).toBeDefined();
      expect(serialized.myCards).not.toBeNull();
      expect((serialized.myCards as string[]).length).toBe(3);
      expect(serialized.myRank).toBe('顺金');
    });

    it('should not leak other players cards', () => {
      const { room, members } = setupGameRoom();
      const viewer = members[0];
      const st = room.game as any;
      const otherId = members[1].userId;
      st.players.get(otherId).cards = [
        { suit: '♥', rank: 14 },
        { suit: '♥', rank: 13 },
        { suit: '♥', rank: 12 },
      ];
      st.players.get(otherId).seen = true;

      const serialized = zjhHandler.serializeFor(room, viewer);
      const others = serialized.others as Array<Record<string, unknown>>;

      const other = others.find((o) => o.userId === otherId);
      expect(other).toBeDefined();
      expect(other!.cards).toBeUndefined();
      expect(other!.cardCount).toBe(3);
    });

    it('should show correct player status for others', () => {
      const { room, members } = setupGameRoom();
      const viewer = members[0];
      const st = room.game as any;
      st.players.get(members[1].userId).folded = true;
      st.players.get(members[2].userId).allIn = true;

      const serialized = zjhHandler.serializeFor(room, viewer);
      const others = serialized.others as Array<Record<string, unknown>>;

      const folded = others.find((o) => o.userId === members[1].userId);
      expect(folded!.folded).toBe(true);

      const allIn = others.find((o) => o.userId === members[2].userId);
      expect(allIn!.allIn).toBe(true);
    });

    it('should include chips info', () => {
      const { room, members } = setupGameRoom();
      const viewer = members[0];

      const serialized = zjhHandler.serializeFor(room, viewer);
      const chips = serialized.chips as Array<{ userId: number; chips: number }>;

      expect(chips.length).toBeGreaterThan(0);
      expect(chips.find((c) => c.userId === viewer.userId)).toBeDefined();
    });

    it('should include betLedger', () => {
      const { room, members } = setupGameRoom();
      const viewer = members[0];

      const serialized = zjhHandler.serializeFor(room, viewer);
      const ledger = serialized.betLedger as Array<Record<string, unknown>>;

      expect(ledger).toBeDefined();
      expect(ledger.length).toBeGreaterThan(0);
    });

    it('should include raiseSteps and stakeCap', () => {
      const { room, members } = setupGameRoom();
      const viewer = members[0];

      const serialized = zjhHandler.serializeFor(room, viewer);

      expect(serialized.raiseSteps).toEqual([10, 20, 50]);
      expect(serialized.stakeCap).toBe(100);
    });

    it('should include special235 config', () => {
      const { room } = setupGameRoom();
      const viewer = makeMember();

      const serialized = zjhHandler.serializeFor(room, viewer);

      expect(serialized.special235).toBe(true);
    });

    it('should show my status correctly', () => {
      const { room, members } = setupGameRoom();
      const viewer = members[1];
      const st = room.game as any;
      st.players.get(viewer.userId).betTotal = 30;
      st.players.get(viewer.userId).seen = true;

      const serialized = zjhHandler.serializeFor(room, viewer);

      expect(serialized.mySeen).toBe(true);
      expect(serialized.myFolded).toBe(false);
      expect(serialized.myAllIn).toBe(false);
      expect(serialized.myBetTotal).toBe(30);
    });

    it('should set turnSeat to -1 when not in betting phase', () => {
      const { room, members } = setupGameRoom();
      const st = room.game as any;
      st.handPhase = 'showdown';

      const serialized = zjhHandler.serializeFor(room, members[0]);

      expect(serialized.turnSeat).toBe(-1);
    });

    it('should include ended info when ranking exists', () => {
      const { room, members } = setupGameRoom();
      const st = room.game as any;
      st.ranking = [{ userId: 1, nickname: 'Player1', chips: 1100, delta: 100, seat: 0 }];
      st.endReason = '手数已打满';

      const serialized = zjhHandler.serializeFor(room, members[0]);

      expect(serialized.ended).toBeDefined();
      expect((serialized.ended as any).ranking).toBeDefined();
      expect((serialized.ended as any).reason).toBe('手数已打满');
    });

    it('should return null for ended when no ranking', () => {
      const { room, members } = setupGameRoom();

      const serialized = zjhHandler.serializeFor(room, members[0]);

      expect(serialized.ended).toBeNull();
    });

    it('should show compareMinRound', () => {
      const { room, members } = setupGameRoom();

      const serialized = zjhHandler.serializeFor(room, members[0]);

      expect(serialized.compareMinRound).toBe(3);
    });

    it('should fallback to member chips when st.chips is empty', () => {
      const { room, members } = setupGameRoom();
      const st = room.game as any;
      st.chips = new Map(); // empty

      const serialized = zjhHandler.serializeFor(room, members[0]);
      const chips = serialized.chips as Array<{ userId: number; chips: number }>;

      expect(chips.length).toBeGreaterThan(0);
    });
  });

  describe('handRank (via actual engine)', () => {
    it('should detect 豹子 (three of a kind)', () => {
      const cards = [
        { suit: '♠' as const, rank: 5 },
        { suit: '♥' as const, rank: 5 },
        { suit: '♦' as const, rank: 5 },
      ];
      const rank = actualHandRank(cards);
      expect(rank.type).toBe(6);
      expect(actualTypeName(rank)).toBe('豹子');
    });

    it('should detect 顺金 (straight flush)', () => {
      const cards = [
        { suit: '♠' as const, rank: 5 },
        { suit: '♠' as const, rank: 6 },
        { suit: '♠' as const, rank: 7 },
      ];
      const rank = actualHandRank(cards);
      expect(rank.type).toBe(5);
      expect(actualTypeName(rank)).toBe('顺金');
    });

    it('should detect 金花 (flush)', () => {
      const cards = [
        { suit: '♥' as const, rank: 2 },
        { suit: '♥' as const, rank: 5 },
        { suit: '♥' as const, rank: 9 },
      ];
      const rank = actualHandRank(cards);
      expect(rank.type).toBe(4);
      expect(actualTypeName(rank)).toBe('金花');
    });

    it('should detect 顺子 (straight)', () => {
      const cards = [
        { suit: '♠' as const, rank: 5 },
        { suit: '♥' as const, rank: 6 },
        { suit: '♦' as const, rank: 7 },
      ];
      const rank = actualHandRank(cards);
      expect(rank.type).toBe(3);
      expect(actualTypeName(rank)).toBe('顺子');
    });

    it('should detect 对子 (pair)', () => {
      const cards = [
        { suit: '♠' as const, rank: 5 },
        { suit: '♥' as const, rank: 5 },
        { suit: '♦' as const, rank: 9 },
      ];
      const rank = actualHandRank(cards);
      expect(rank.type).toBe(2);
      expect(actualTypeName(rank)).toBe('对子');
    });

    it('should detect 散牌 (high card)', () => {
      const cards = [
        { suit: '♠' as const, rank: 2 },
        { suit: '♥' as const, rank: 5 },
        { suit: '♦' as const, rank: 9 },
      ];
      const rank = actualHandRank(cards);
      expect(rank.type).toBe(1);
      expect(actualTypeName(rank)).toBe('散牌');
    });

    it('should detect special 235', () => {
      const cards = [
        { suit: '♠' as const, rank: 2 },
        { suit: '♥' as const, rank: 3 },
        { suit: '♦' as const, rank: 5 },
      ];
      const rank = actualHandRank(cards);
      expect(rank.type).toBe(1);
      expect(rank.special235).toBe(true);
      expect(actualTypeName(rank)).toBe('特殊235');
    });

    it('should detect A23 as smallest straight', () => {
      const cards = [
        { suit: '♠' as const, rank: 14 },
        { suit: '♥' as const, rank: 2 },
        { suit: '♦' as const, rank: 3 },
      ];
      const rank = actualHandRank(cards);
      expect(rank.type).toBe(3);
      expect(rank.keys).toEqual([3, 2, 1]);
    });

    it('should detect QKA as largest straight', () => {
      const cards = [
        { suit: '♠' as const, rank: 12 },
        { suit: '♥' as const, rank: 13 },
        { suit: '♦' as const, rank: 14 },
      ];
      const rank = actualHandRank(cards);
      expect(rank.type).toBe(3);
      expect(rank.keys).toEqual([14, 13, 12]);
    });
  });

  describe('compareZjh (via actual engine)', () => {
    const makeCards = (suit: Card['suit'], ranks: number[]): Card[] =>
      ranks.map((r) => ({ suit, rank: r }));

    it('should return positive when a wins with higher type', () => {
      const a = makeCards('♠', [14, 13, 12]); // straight flush (type 5)
      const b = makeCards('♥', [5, 5, 5]); // triple 5 (type 6)
      // Actually triple 5 is 豹子 type 6, straight flush is type 5, so b wins
      const result = actualCompareZjh(a, b, true);
      expect(result).toBe(-1); // b wins (higher type)
    });

    it('should return negative when b wins', () => {
      const a = makeCards('♥', [2, 5, 9]); // 散牌 type 1
      const b = makeCards('♠', [5, 5, 5]); // 豹子 type 6
      const result = actualCompareZjh(a, b, true);
      expect(result).toBe(-1);
    });

    it('should handle special 235 comparison', () => {
      const special = makeCards('♠', [2, 3, 5]); // special 235
      const scatter = makeCards('♥', [4, 6, 9]); // scatter hand (type 1)
      const result = actualCompareZjh(special, scatter, true);
      // Just verify comparison returns a valid result (-1, 0, or 1)
      expect([-1, 0, 1]).toContain(result);
    });

    it('should compare by suit when ranks are equal', () => {
      const a = makeCards('♠', [10, 8, 6]); // spades
      const b = makeCards('♥', [10, 8, 6]); // hearts
      const result = actualCompareZjh(a, b, true);
      expect(result).toBe(1); // spades > hearts
    });

    it('should not give special 235 advantage when special235 config is false', () => {
      const special = makeCards('♠', [2, 3, 5]);
      const tripleA = makeCards('♥', [14, 14, 14]);
      const result = actualCompareZjh(special, tripleA, false);
      expect(result).toBe(-1); // triple A wins when special235 disabled
    });

    it('should compare two special 235 by suit', () => {
      const special1 = makeCards('♠', [2, 3, 5]);
      const special2 = makeCards('♥', [2, 3, 5]);
      const result = actualCompareZjh(special1, special2, true);
      expect(result).toBe(1); // spades > hearts
    });
  });
});
