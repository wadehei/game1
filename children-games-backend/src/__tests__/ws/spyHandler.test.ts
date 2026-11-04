import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Room, Member, Seat } from '../../ws/roomManager';
import { spyHandler } from '../../ws/games/spy';
import { getRoomBus } from '../../ws/bus';
import { getRoom } from '../../ws/roomManager';

// Shared mock bus (single instance so handler and test see same calls)
const mockBroadcast = vi.fn();
const mockSendToUser = vi.fn();

// Mock dependencies
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

vi.mock('../../ws/games/spy-word-pairs.json', () => ({
  default: [
    { civilian: '苹果', spy: '梨', category: '水果' },
    { civilian: '猫', spy: '狗', category: '动物' },
  ],
}));

vi.mock('../../utils/secureRandom', () => ({
  secureShuffle: vi.fn(<T>(arr: T[]) => [...arr]),
  securePickOne: vi.fn(<T>(arr: T[]) => arr[0]),
}));

const mockGetRoom = vi.mocked(getRoom);

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
    gameType: 'spy',
    hostUserId: members[0]?.userId || 1,
    members: memberMap,
    phase,
    game: spyHandler.create(),
    config: {},
    chat: [],
    voices: new Map(),
    timers: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  } as Room;
}

describe('spyHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('metadata', () => {
    it('should have correct game properties', () => {
      expect(spyHandler.type).toBe('spy');
      expect(spyHandler.minPlayers).toBe(4);
      expect(spyHandler.maxPlayers).toBe(12);
      expect(spyHandler.allowSpectators).toBe(false);
      expect(spyHandler.rematchSwapSeats).toBe(false);
    });
  });

  describe('create', () => {
    it('should return initial state', () => {
      const state = spyHandler.create();
      expect(state.round).toBe(1);
      expect(state.phase).toBe('talk');
      expect(state.roles.size).toBe(0);
      expect(state.votes.size).toBe(0);
      expect(state.isRevote).toBe(false);
      expect(state.revotePool).toBeNull();
      expect(state.finalSummary).toBeNull();
    });
  });

  describe('start', () => {
    it('should assign roles and distribute words', () => {
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
        makeMember({ userId: 4, seat: 3 as Seat }),
      ];
      const room = makeRoom(members);

      const result = spyHandler.start!(room);
      expect(result).toBeDefined();
      expect(result!.toMember).toBeDefined();
      expect(result!.toMember!.length).toBe(4);

      // Check that each player got a role message
      for (const msg of result!.toMember!) {
        expect(msg.msg.t).toBe('spy_deal');
        expect(msg.msg.role).toBeDefined();
        expect(msg.msg.word).toBeDefined();
      }
    });

    it('should assign 1 spy for < 7 players', () => {
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
        makeMember({ userId: 4, seat: 3 as Seat }),
      ];
      const room = makeRoom(members);

      spyHandler.start!(room);

      const st = room.game as ReturnType<typeof spyHandler.create>;
      const spies = [...st.roles.values()].filter((r) => r.role === 'spy');
      expect(spies.length).toBe(1);
    });

    it('should assign 2 spies for >= 7 players', () => {
      const members = Array.from({ length: 7 }, (_, i) =>
        makeMember({ userId: i + 1, seat: i as Seat })
      );
      const room = makeRoom(members);

      spyHandler.start!(room);

      const st = room.game as ReturnType<typeof spyHandler.create>;
      const spies = [...st.roles.values()].filter((r) => r.role === 'spy');
      expect(spies.length).toBe(2);
    });

    it('should broadcast spy_phase with talk phase', () => {
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
        makeMember({ userId: 4, seat: 3 as Seat }),
      ];
      const room = makeRoom(members);

      const result = spyHandler.start!(room);
      expect(result!.broadcast).toBeDefined();
      const phaseMsg = result!.broadcast!.find((m) => m.t === 'spy_phase');
      expect(phaseMsg).toBeDefined();
      expect(phaseMsg!.phase).toBe('talk');
      expect(phaseMsg!.alive).toEqual(expect.arrayContaining([1, 2, 3, 4]));
    });
  });

  describe('onAction — spy_vote', () => {
    function setupPlayingRoom() {
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
        makeMember({ userId: 4, seat: 3 as Seat }),
      ];
      const room = makeRoom(members);
      const st = room.game as ReturnType<typeof spyHandler.create>;
      // Initialize roles
      for (const m of members) {
        st.roles.set(m.userId, {
          role: m.userId === 1 ? 'spy' : 'civilian',
          word: m.userId === 1 ? '梨' : '苹果',
          alive: true,
        });
      }
      st.phase = 'vote';
      st.votes = new Map();
      room.phase = 'playing';

      // Mock getRoom to return the room for 800ms tally timer
      mockGetRoom.mockImplementation(() => room);

      return { room, members, st };
    }

    it('should reject non-spy_vote actions', () => {
      const { room, members } = setupPlayingRoom();
      const result = spyHandler.onAction(room, members[0], 'other_action', {});
      expect(result.error).toBe('未知的游戏操作');
    });

    it('should reject when not in vote phase', () => {
      const { room, members, st } = setupPlayingRoom();
      st.phase = 'talk';
      const result = spyHandler.onAction(room, members[0], 'spy_vote', { target: 2 });
      expect(result.error).toBe('当前不是投票阶段');
    });

    it('should reject vote from eliminated player', () => {
      const { room, members, st } = setupPlayingRoom();
      st.roles.get(1)!.alive = false;
      const result = spyHandler.onAction(room, members[0], 'spy_vote', { target: 2 });
      expect(result.error).toBe('出局玩家不能投票');
    });

    it('should reject vote for eliminated target', () => {
      const { room, members, st } = setupPlayingRoom();
      st.roles.get(3)!.alive = false;
      const result = spyHandler.onAction(room, members[0], 'spy_vote', { target: 3 });
      expect(result.error).toBe('投票目标已出局');
    });

    it('should reject self-vote in first round', () => {
      const { room, members } = setupPlayingRoom();
      const result = spyHandler.onAction(room, members[0], 'spy_vote', { target: 1 });
      expect(result.error).toBe('不能投自己');
    });

    it('should allow self-vote in revote', () => {
      const { room, members, st } = setupPlayingRoom();
      st.isRevote = true;
      st.revotePool = [1, 2];
      const result = spyHandler.onAction(room, members[0], 'spy_vote', { target: 1 });
      expect(result.error).toBeUndefined();
    });

    it('should reject vote for non-revotePool candidate during revote', () => {
      const { room, members, st } = setupPlayingRoom();
      st.isRevote = true;
      st.revotePool = [2, 3];
      const result = spyHandler.onAction(room, members[0], 'spy_vote', { target: 4 });
      expect(result.error).toBe('本轮只能投给平票候选人');
    });

    it('should accept valid vote', () => {
      const { room, members } = setupPlayingRoom();
      const result = spyHandler.onAction(room, members[0], 'spy_vote', { target: 2 });
      expect(result.error).toBeUndefined();

      const st = room.game as ReturnType<typeof spyHandler.create>;
      expect(st.votes.get(1)).toBe(2);
    });

    it('should accept null target (abstain)', () => {
      const { room, members } = setupPlayingRoom();
      const result = spyHandler.onAction(room, members[0], 'spy_vote', { target: null });
      expect(result.error).toBeUndefined();

      const st = room.game as ReturnType<typeof spyHandler.create>;
      expect(st.votes.get(1)).toBeNull();
    });

    it('should reject invalid target type', () => {
      const { room, members } = setupPlayingRoom();
      const result = spyHandler.onAction(room, members[0], 'spy_vote', { target: 'abc' });
      expect(result.error).toBe('无效的投票目标');
    });

    it('should broadcast vote update after valid vote', () => {
      const { room, members } = setupPlayingRoom();
      const bus = getRoomBus();

      spyHandler.onAction(room, members[0], 'spy_vote', { target: 2 });

      const voteUpdate = (bus.broadcast as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[1]?.t === 'spy_vote_update'
      );
      expect(voteUpdate).toBeDefined();
      expect(voteUpdate![1].votedCount).toBe(1);
      expect(voteUpdate![1].total).toBe(4);
    });

    it('should trigger immediate tally when all online players vote', async () => {
      const { room, members, st } = setupPlayingRoom();
      // Make only 2 players online (userId 1 and 2)
      members[2].online = false;
      members[3].online = false;

      const bus = getRoomBus();

      // Both online players vote for player 3 (who is offline but still alive)
      spyHandler.onAction(room, members[0], 'spy_vote', { target: 3 });
      spyHandler.onAction(room, members[1], 'spy_vote', { target: 3 });

      // All online players voted — tally should happen after 800ms
      await vi.advanceTimersByTimeAsync(800);

      // After tally: player 3 should be eliminated (2 votes)
      expect(st.roles.get(3)!.alive).toBe(false);

      // spy_vote_result should have been broadcast
      const voteResult = (bus.broadcast as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[1]?.t === 'spy_vote_result'
      );
      expect(voteResult).toBeDefined();
      expect(voteResult![1].out).toBe(3);
    });

    it('should not trigger tally when not all online players voted', () => {
      const { room, members, st } = setupPlayingRoom();

      // Only 1 of 4 online players votes
      spyHandler.onAction(room, members[0], 'spy_vote', { target: 2 });

      // Advance 800ms — tally should NOT happen
      vi.advanceTimersByTime(800);

      // No one should be eliminated
      expect(st.roles.get(2)!.alive).toBe(true);
    });
  });

  describe('tally via timer (all abstain / ties)', () => {
    function setupVoteRoom() {
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
        makeMember({ userId: 4, seat: 3 as Seat }),
      ];
      const room = makeRoom(members);
      const st = room.game as ReturnType<typeof spyHandler.create>;
      for (const m of members) {
        st.roles.set(m.userId, {
          role: m.userId === 1 ? 'spy' : 'civilian',
          word: m.userId === 1 ? '梨' : '苹果',
          alive: true,
        });
      }
      st.phase = 'vote';
      st.votes = new Map();
      room.phase = 'playing';

      // Mock getRoom to return the room for 800ms tally timer
      mockGetRoom.mockImplementation(() => room);

      return { room, members, st };
    }

    /** All online players vote via onAction (triggers 800ms timer) */
    function voteAll(room: Room, members: Member[], targets: (number | null)[]) {
      for (let i = 0; i < members.length; i++) {
        spyHandler.onAction(room, members[i], 'spy_vote', { target: targets[i] });
      }
    }

    it('should advance to next round when all abstain (no votes)', () => {
      const { room, members, st } = setupVoteRoom();
      const bus = getRoomBus();

      // All 4 online players abstain
      voteAll(room, members, [null, null, null, null]);

      vi.advanceTimersByTime(800);

      // All abstained → no elimination, round increments
      expect(st.round).toBe(2);

      // spy_vote_result with out=null
      const voteResult = (bus.broadcast as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[1]?.t === 'spy_vote_result'
      );
      expect(voteResult.length).toBeGreaterThan(0);
      expect(voteResult[0][1].out).toBeNull();
    });

    it('should trigger revote on first-round tie', async () => {
      const { room, members, st } = setupVoteRoom();

      // 2 votes for player 2, 2 votes for player 3 → tie
      // Player 1 and 3 vote for 2; player 2 and 4 vote for 3
      voteAll(room, members, [2, 3, 2, 3]);

      await vi.advanceTimersByTimeAsync(800);

      // Should be in revote state
      expect(st.isRevote).toBe(true);
      expect(st.revotePool).toEqual(expect.arrayContaining([2, 3]));
      expect(st.phase).toBe('vote');
    });

    it('should eliminate no one on revote tie (second tie)', () => {
      const { room, members, st } = setupVoteRoom();

      // Set up revote state
      st.isRevote = true;
      st.revotePool = [2, 3];

      // Tie again during revote: player 1 and 3 vote for 2; player 2 and 4 vote for 3
      voteAll(room, members, [2, 3, 2, 3]);

      vi.advanceTimersByTime(800);

      // No elimination, round increments
      expect(st.round).toBe(2);
      expect(st.isRevote).toBe(false);
      expect(st.revotePool).toBeNull();
      // All still alive
      for (const m of members) {
        expect(st.roles.get(m.userId)!.alive).toBe(true);
      }
    });

    it('should eliminate player with unique highest votes and continue game', () => {
      const { room, members, st } = setupVoteRoom();
      const bus = getRoomBus();

      // 3 votes for player 2, 1 vote for player 3
      // Player 1, 3, 4 vote for 2; player 2 votes for 3
      voteAll(room, members, [2, 3, 2, 2]);

      vi.advanceTimersByTime(800);

      // Player 2 eliminated
      expect(st.roles.get(2)!.alive).toBe(false);
      expect(st.round).toBe(2);

      // spy_eliminated broadcast
      const eliminated = (bus.broadcast as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[1]?.t === 'spy_eliminated'
      );
      expect(eliminated).toBeDefined();
      expect(eliminated![1].userId).toBe(2);
    });

    it('should result in civilian win when last spy is eliminated', () => {
      const { room, members, st } = setupVoteRoom();

      // Player 1 is spy. Players 2,3,4 vote for 1; player 1 votes for 2
      voteAll(room, members, [2, 1, 1, 1]);

      vi.advanceTimersByTime(800);

      // Spy (player 1) eliminated → civilian wins
      expect(st.phase).toBe('ended');
      expect(st.finalSummary).toBeDefined();
      expect(st.finalSummary!.winner).toBe('civilian');
    });

    it('should result in spy win when spies >= civilians after elimination', () => {
      // Set up a 5-player game with 1 spy
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
        makeMember({ userId: 4, seat: 3 as Seat }),
        makeMember({ userId: 5, seat: 4 as Seat }),
      ];
      const room = makeRoom(members);
      const st = room.game as ReturnType<typeof spyHandler.create>;

      // 1 spy, 4 civilians. Make 2 civilians already dead so after 1 more elimination spies >= civilians
      for (const m of members) {
        st.roles.set(m.userId, {
          role: m.userId === 1 ? 'spy' : 'civilian',
          word: m.userId === 1 ? '梨' : '苹果',
          alive: m.userId > 3 ? false : true, // players 4,5 already dead
        });
      }
      st.phase = 'vote';
      st.votes = new Map();
      room.phase = 'playing';

      // Mock getRoom for tally timer
      mockGetRoom.mockImplementation(() => room);

      // Remaining alive: 1(spy), 2(civ), 3(civ). All vote for player 2 (civilian).
      voteAll(room, [members[0], members[1], members[2]], [2, 3, 2]);

      vi.advanceTimersByTime(800);

      // Player 2 eliminated → alive: 1(spy), 3(civ) → spies(1) >= civilians(1) → spy wins
      expect(st.phase).toBe('ended');
      expect(st.finalSummary!.winner).toBe('spy');
    });

    it('should ignore votes for eliminated targets during tally', async () => {
      const { room, members, st } = setupVoteRoom();

      // Mark player 3 as offline (but still alive) so timer triggers without their vote
      members[2].online = false;

      // Online players 1, 2, 4 vote while player 3 is still alive
      // Player 1 and 2 vote for 3; player 4 votes for 2
      spyHandler.onAction(room, members[0], 'spy_vote', { target: 3 });
      spyHandler.onAction(room, members[1], 'spy_vote', { target: 3 });
      spyHandler.onAction(room, members[3], 'spy_vote', { target: 2 });
      // All 3 online players voted, timer scheduled for 800ms

      // Now mark player 3 as dead (simulating them quitting before tally)
      st.roles.get(3)!.alive = false;

      // Advance timer to trigger tally
      await vi.advanceTimersByTimeAsync(800);

      // Alive players at tally time are [1, 2, 4]. Votes for dead player 3 are ignored.
      // Player 2 has 1 valid vote (from player 4) → eliminated
      expect(st.roles.get(2)!.alive).toBe(false);
    });
  });

  describe('phase transitions (talk → vote → talk)', () => {
    it('should auto-transition from talk to vote after timer', () => {
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
        makeMember({ userId: 4, seat: 3 as Seat }),
      ];
      const room = makeRoom(members);
      const st = room.game as ReturnType<typeof spyHandler.create>;
      for (const m of members) {
        st.roles.set(m.userId, { role: 'civilian', word: '苹果', alive: true });
      }

      // Mock getRoom to return the room for timer callbacks
      mockGetRoom.mockImplementation(() => room);

      // start() sets up talk phase with timer
      spyHandler.start!(room);
      expect(st.phase).toBe('talk');

      // Advance past talk timer (TALK_SECONDS = 90)
      vi.advanceTimersByTime(90 * 1000);

      // Should transition to vote
      expect(st.phase).toBe('vote');
    });

    it('should auto-transition from vote to talk after vote timer (no one voted)', async () => {
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
        makeMember({ userId: 4, seat: 3 as Seat }),
      ];
      const room = makeRoom(members);
      const st = room.game as ReturnType<typeof spyHandler.create>;
      for (const m of members) {
        st.roles.set(m.userId, { role: 'civilian', word: '苹果', alive: true });
      }

      // Mock getRoom to return the room for timer callbacks
      mockGetRoom.mockImplementation(() => room);

      // start() sets up talk phase with timer
      spyHandler.start!(room);
      expect(st.phase).toBe('talk');

      // Advance past talk timer (TALK_SECONDS = 90) to enter vote phase
      await vi.advanceTimersByTimeAsync(90 * 1000);
      expect(st.phase).toBe('vote');

      // Advance past vote timer (VOTE_SECONDS = 60) to go back to talk phase
      await vi.advanceTimersByTimeAsync(60 * 1000);

      // Should go back to talk phase (no votes → no elimination → next round)
      expect(st.phase).toBe('talk');
      expect(st.round).toBe(2);
    });
  });

  describe('onPlayerQuit', () => {
    it('should mark player as not alive', () => {
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
        makeMember({ userId: 4, seat: 3 as Seat }),
      ];
      const room = makeRoom(members);
      const st = room.game as ReturnType<typeof spyHandler.create>;
      for (const m of members) {
        st.roles.set(m.userId, {
          role: m.userId === 1 ? 'spy' : 'civilian',
          word: 'test',
          alive: true,
        });
      }

      spyHandler.onPlayerQuit!(room, members[0]);
      expect(st.roles.get(1)!.alive).toBe(false);
    });

    it('should end game when spy quits and all spies are eliminated', () => {
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
        makeMember({ userId: 4, seat: 3 as Seat }),
      ];
      const room = makeRoom(members);
      const st = room.game as ReturnType<typeof spyHandler.create>;
      // Only 1 spy (userId: 1)
      for (const m of members) {
        st.roles.set(m.userId, {
          role: m.userId === 1 ? 'spy' : 'civilian',
          word: 'test',
          alive: true,
        });
      }

      const result = spyHandler.onPlayerQuit!(room, members[0]);
      expect(result).toBeDefined();
      expect(result!.ended!.reason).toContain('平民胜利');
    });

    it('should return undefined when game continues after quit', () => {
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
        makeMember({ userId: 4, seat: 3 as Seat }),
      ];
      const room = makeRoom(members);
      const st = room.game as ReturnType<typeof spyHandler.create>;
      // Civilian quits — game continues
      for (const m of members) {
        st.roles.set(m.userId, {
          role: m.userId === 4 ? 'spy' : 'civilian',
          word: 'test',
          alive: true,
        });
      }

      const result = spyHandler.onPlayerQuit!(room, members[0]); // civilian quits
      expect(result).toBeUndefined();
    });

    it('should return undefined when game already ended', () => {
      const members = [makeMember({ userId: 1, seat: 0 }), makeMember({ userId: 2, seat: 1 })];
      const room = makeRoom(members, 'ended');
      const st = room.game as ReturnType<typeof spyHandler.create>;
      st.roles.set(1, { role: 'spy', word: '梨', alive: true });
      st.roles.set(2, { role: 'civilian', word: '苹果', alive: true });

      const result = spyHandler.onPlayerQuit!(room, members[0]);
      expect(result).toBeUndefined();
    });

    it('should re-enter vote phase when alive player quits during voting', () => {
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
        makeMember({ userId: 4, seat: 3 as Seat }),
      ];
      const room = makeRoom(members);
      const st = room.game as ReturnType<typeof spyHandler.create>;
      for (const m of members) {
        st.roles.set(m.userId, {
          role: m.userId === 1 ? 'spy' : 'civilian',
          word: m.userId === 1 ? '梨' : '苹果',
          alive: true,
        });
      }
      st.phase = 'vote';
      st.votes = new Map();
      st.votes.set(1, 2); // player 1 already voted

      const bus = getRoomBus();

      // Player 2 quits during vote phase (still alive)
      const result = spyHandler.onPlayerQuit!(room, members[1]);

      // Game continues, should re-enter vote
      expect(st.phase).toBe('vote');
      // Votes should be reset (new vote round)
      expect(st.votes.size).toBe(0);

      // spy_phase broadcast should have been called for re-entering vote
      const phaseMsg = (bus.broadcast as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: any[]) => call[1]?.t === 'spy_phase' && call[1]?.phase === 'vote'
      );
      expect(phaseMsg).toBeDefined();
    });

    it('should result in spy win when enough civilians quit', () => {
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
        makeMember({ userId: 4, seat: 3 as Seat }),
      ];
      const room = makeRoom(members);
      const st = room.game as ReturnType<typeof spyHandler.create>;
      // 1 spy (player 1), 3 civilians. Kill 2 civilians first.
      for (const m of members) {
        st.roles.set(m.userId, {
          role: m.userId === 1 ? 'spy' : 'civilian',
          word: 'test',
          alive: true,
        });
      }
      st.roles.get(2)!.alive = false; // civilian already dead

      // Player 3 (civilian) quits → alive: spy(1) + civilian(4) → spies(1) >= civilians(1) → spy wins
      const result = spyHandler.onPlayerQuit!(room, members[2]);

      expect(result).toBeDefined();
      expect(result!.ended).toBeDefined();
      expect(result!.ended!.reason).toContain('卧底胜利');
    });
  });

  describe('serializeFor', () => {
    it('should only show viewer their own role and word', () => {
      const members = [makeMember({ userId: 1, seat: 0 }), makeMember({ userId: 2, seat: 1 })];
      const room = makeRoom(members);
      const st = room.game as ReturnType<typeof spyHandler.create>;
      st.roles.set(1, { role: 'spy', word: '梨', alive: true });
      st.roles.set(2, { role: 'civilian', word: '苹果', alive: true });
      st.pair = { civilian: '苹果', spy: '梨', category: '水果' };

      const serialized = spyHandler.serializeFor(room, members[0]);
      expect((serialized.me as any).word).toBe('梨');
      // Should not contain the other player's word
      const jsonStr = JSON.stringify(serialized);
      expect(jsonStr).not.toContain('苹果');
    });

    it('should list eliminated players with roles', () => {
      const members = [makeMember({ userId: 1, seat: 0 })];
      const room = makeRoom(members);
      const st = room.game as ReturnType<typeof spyHandler.create>;
      st.roles.set(1, { role: 'spy', word: '梨', alive: true });
      st.roles.set(2, { role: 'civilian', word: '苹果', alive: false });
      st.pair = { civilian: '苹果', spy: '梨', category: '水果' };

      const serialized = spyHandler.serializeFor(room, members[0]);
      const eliminated = serialized.eliminated as Array<{ userId: number; role: string }>;
      expect(eliminated).toHaveLength(1);
      expect(eliminated[0].userId).toBe(2);
      expect(eliminated[0].role).toBe('civilian');
    });

    it('should include finalSummary when game is ended', () => {
      const member = makeMember({ userId: 1 });
      const room = makeRoom([member]);
      const st = room.game as ReturnType<typeof spyHandler.create>;
      st.finalSummary = {
        winner: 'civilian',
        spyUserIds: [2],
        words: { civilian: '苹果', spy: '梨' },
      };
      st.pair = { civilian: '苹果', spy: '梨', category: '水果' };

      const serialized = spyHandler.serializeFor(room, member);
      expect(serialized.ended).toBeDefined();
      expect((serialized.ended as any).winner).toBe('civilian');
    });

    it('should return me as null when viewer has no role', () => {
      const member = makeMember({ userId: 99 });
      const room = makeRoom([member]);
      const st = room.game as ReturnType<typeof spyHandler.create>;
      st.roles.set(1, { role: 'spy', word: '梨', alive: true });
      st.pair = { civilian: '苹果', spy: '梨', category: '水果' };

      const serialized = spyHandler.serializeFor(room, member);
      expect(serialized.me).toBeNull();
    });

    it('should include pairCategory', () => {
      const member = makeMember({ userId: 1 });
      const room = makeRoom([member]);
      const st = room.game as ReturnType<typeof spyHandler.create>;
      st.roles.set(1, { role: 'spy', word: '梨', alive: true });
      st.pair = { civilian: '苹果', spy: '梨', category: '水果' };

      const serialized = spyHandler.serializeFor(room, member);
      expect(serialized.pairCategory).toBe('水果');
    });

    it('should include votedCount and total', () => {
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
      ];
      const room = makeRoom(members);
      const st = room.game as ReturnType<typeof spyHandler.create>;
      st.roles.set(1, { role: 'spy', word: '梨', alive: true });
      st.roles.set(2, { role: 'civilian', word: '苹果', alive: true });
      st.roles.set(3, { role: 'civilian', word: '苹果', alive: true });
      st.phase = 'vote';
      st.votes.set(1, 2);
      st.votes.set(2, 3);
      st.pair = { civilian: '苹果', spy: '梨', category: '水果' };

      const serialized = spyHandler.serializeFor(room, members[0]);
      expect(serialized.votedCount).toBe(2);
      expect(serialized.total).toBe(3);
    });

    it('should not leak other players words', () => {
      const members = [
        makeMember({ userId: 1, seat: 0 }),
        makeMember({ userId: 2, seat: 1 }),
        makeMember({ userId: 3, seat: 2 as Seat }),
      ];
      const room = makeRoom(members);
      const st = room.game as ReturnType<typeof spyHandler.create>;
      st.roles.set(1, { role: 'spy', word: '梨', alive: true });
      st.roles.set(2, { role: 'civilian', word: '苹果', alive: true });
      st.roles.set(3, { role: 'civilian', word: '苹果', alive: true });
      st.pair = { civilian: '苹果', spy: '梨', category: '水果' };

      const serialized = spyHandler.serializeFor(room, members[0]);
      const jsonStr = JSON.stringify(serialized);
      // Should contain own word '梨'
      expect(jsonStr).toContain('梨');
      // Should NOT contain other players' word '苹果'
      expect(jsonStr).not.toContain('苹果');
    });
  });
});
