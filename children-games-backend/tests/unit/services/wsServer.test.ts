import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WebSocket } from 'ws';

// ─── Shared state for mock capture ─────────────────────────
let connectionHandler: ((ws: WebSocket, req: any) => void) | null = null;

// ─── Mocks ───────────────────────────────────────────────

vi.mock('ws', () => {
  class WebSocketServerMock {
    on = vi.fn((event: string, cb: any) => {
      if (event === 'connection') connectionHandler = cb;
    });
  }
  return {
    WebSocketServer: WebSocketServerMock,
    WebSocket: { OPEN: 1 },
  };
});

vi.mock('jsonwebtoken', () => ({
  default: { verify: vi.fn() },
  verify: vi.fn(),
}));

vi.mock('../../../src/config', () => ({
  config: { jwt: { secret: 'test_secret' } },
}));

vi.mock('../../../src/utils/logger', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock('../../../src/models', () => ({
  User: { findByPk: vi.fn() },
}));

vi.mock('../../../src/ws/roomManager', () => ({
  addChat: vi.fn(),
  allRooms: vi.fn().mockReturnValue([]),
  createRoom: vi.fn(),
  disbandRoom: vi.fn(),
  getRoom: vi.fn(),
  isHost: vi.fn(),
  joinRoom: vi.fn(),
  memberList: vi.fn().mockReturnValue([]),
  removeMember: vi.fn(),
  sweepIdle: vi.fn(),
  TOTAL_MEMBER_LIMIT: 12,
  clearRoomTimers: vi.fn(),
  addTimer: vi.fn(),
}));

vi.mock('../../../src/ws/games/registry', () => ({
  getHandler: vi.fn(),
  gameHandlers: {},
}));

vi.mock('../../../src/ws/bus', () => ({
  setRoomBus: vi.fn(),
}));

vi.mock('../../../src/services/battleChips', () => ({
  settleRankingChips: vi.fn(),
  applyChipDelta: vi.fn(),
  grantDailyRelief: vi.fn(),
  CHIPS_JOIN_MIN: 100,
}));

vi.mock('../../../src/config/constants', () => ({
  REMATCH_AUTO_SECONDS: 30,
}));

import { initWsServer, kickUserEverywhere, listGameTypes } from '../../../src/ws/wsServer';
import { User } from '../../../src/models';
import {
  getRoom,
  allRooms,
  joinRoom,
  removeMember,
  disbandRoom,
  isHost,
  addChat,
} from '../../../src/ws/roomManager';
import { getHandler } from '../../../src/ws/games/registry';
import { grantDailyRelief } from '../../../src/services/battleChips';
import jwt from 'jsonwebtoken';

const mockUser = vi.mocked(User);
const mockGetRoom = vi.mocked(getRoom);
const mockAllRooms = vi.mocked(allRooms);
const mockGetHandler = vi.mocked(getHandler);
const mockJoinRoom = vi.mocked(joinRoom);
const mockRemoveMember = vi.mocked(removeMember);
const mockDisbandRoom = vi.mocked(disbandRoom);
const mockIsHost = vi.mocked(isHost);
const mockGrantDailyRelief = vi.mocked(grantDailyRelief);
const mockAddChat = vi.mocked(addChat);

// ─── Helpers ─────────────────────────────────────────────

const createMockWs = (): any => ({
  readyState: 1,
  send: vi.fn(),
  close: vi.fn(),
  on: vi.fn(),
});

const defaultHandler = {
  type: 'gomoku',
  title: '五子棋',
  emoji: '♟️',
  desc: '五子棋对战',
  minPlayers: 2,
  maxPlayers: 2,
  allowSpectators: true,
  rematchSwapSeats: false,
  validActions: new Set(['place']),
  create: () => ({}),
  onAction: () => ({}),
  serializeFor: () => ({}),
  start: vi.fn().mockReturnValue({}),
  onPlayerQuit: vi.fn(),
  onMemberOffline: vi.fn(),
};

// Default auth success
const setupAuth = (chips = 500) => {
  vi.mocked(jwt.verify).mockReturnValue({ userId: 1, type: 'access' } as any);
  mockUser.findByPk.mockResolvedValue({
    id: 1,
    nickname: 'Test',
    avatar: '',
    battleChips: chips,
  } as any);
};

describe('wsServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectionHandler = null;
    mockAllRooms.mockReturnValue([] as any);
    mockGetHandler.mockReturnValue(defaultHandler as any);
  });

  // ─── initWsServer ─────────────────────────────────────
  describe('initWsServer', () => {
    it('should create WebSocket server and register connection handler', () => {
      initWsServer({} as any);
      expect(connectionHandler).toBeTruthy();
    });

    it('should not throw on init', () => {
      expect(() => initWsServer({} as any)).not.toThrow();
    });
  });

  // ─── Auth ─────────────────────────────────────────────
  describe('connection handler - auth', () => {
    it('should reject connection without valid token', async () => {
      initWsServer({} as any);
      const ws = createMockWs();
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new Error('bad');
      });
      await connectionHandler!(ws, { url: '/ws?token=invalid' });
      expect(ws.close).toHaveBeenCalledWith(4001, '未登录');
    });

    it('should reject when token is missing', async () => {
      initWsServer({} as any);
      const ws = createMockWs();
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new Error('no token');
      });
      await connectionHandler!(ws, { url: '/ws' });
      expect(ws.close).toHaveBeenCalledWith(4001, '未登录');
    });

    it('should reject connection when user not found', async () => {
      initWsServer({} as any);
      const ws = createMockWs();
      vi.mocked(jwt.verify).mockReturnValue({ userId: 999, type: 'access' } as any);
      mockUser.findByPk.mockResolvedValue(null);
      await connectionHandler!(ws, { url: '/ws?token=valid' });
      expect(ws.close).toHaveBeenCalledWith(4002, '角色不存在');
    });

    it('should send auth_ok on successful auth', async () => {
      initWsServer({} as any);
      const ws = createMockWs();
      setupAuth(500);
      await connectionHandler!(ws, { url: '/ws?token=valid' });
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ t: 'auth_ok', userId: 1, chips: 500 }));
    });

    it('should grant daily relief when chips below threshold', async () => {
      initWsServer({} as any);
      const ws = createMockWs();
      setupAuth(50);
      mockGrantDailyRelief.mockResolvedValue(1000);
      await connectionHandler!(ws, { url: '/ws?token=valid' });
      expect(mockGrantDailyRelief).toHaveBeenCalledWith(1);
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ t: 'auth_ok', userId: 1, chips: 1000 })
      );
    });

    it('should NOT grant relief when chips above threshold', async () => {
      initWsServer({} as any);
      const ws = createMockWs();
      setupAuth(500);
      await connectionHandler!(ws, { url: '/ws?token=valid' });
      expect(mockGrantDailyRelief).not.toHaveBeenCalled();
    });
  });

  // ─── Room Join ────────────────────────────────────────
  describe('connection handler - room join', () => {
    it('should join room when roomId is provided', async () => {
      initWsServer({} as any);
      const ws = createMockWs();
      setupAuth();
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        members: new Map(),
        phase: 'waiting',
        config: {},
        chat: [],
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockJoinRoom.mockReturnValue({
        userId: 1,
        seat: 0,
        ws: null,
        nickname: 'Test',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      } as any);

      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });
      expect(mockJoinRoom).toHaveBeenCalled();
      const joinedCall = (ws.send as any).mock.calls.find(
        (c: any[]) => JSON.parse(c[0]).t === 'joined'
      );
      expect(joinedCall).toBeTruthy();
    });

    it('should send error when room does not exist', async () => {
      initWsServer({} as any);
      const ws = createMockWs();
      setupAuth();
      mockGetRoom.mockReturnValue(undefined);

      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=9999' });
      const errCall = (ws.send as any).mock.calls.find((c: any[]) => {
        const msg = JSON.parse(c[0]);
        return msg.t === 'error' && msg.message.includes('房间不存在');
      });
      expect(errCall).toBeTruthy();
    });

    it('should send error when room is full', async () => {
      initWsServer({} as any);
      const ws = createMockWs();
      setupAuth();
      const membersMap = new Map(Array.from({ length: 12 }, (_, i) => [i + 1, {}]));
      membersMap.has = vi.fn().mockReturnValue(false);
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        members: membersMap,
        phase: 'waiting',
        config: {},
        chat: [],
      };
      mockGetRoom.mockReturnValue(mockRoom);

      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });
      const errCall = (ws.send as any).mock.calls.find((c: any[]) => {
        const msg = JSON.parse(c[0]);
        return msg.t === 'error' && msg.message.includes('人满');
      });
      expect(errCall).toBeTruthy();
    });

    it('should auto-leave other rooms when joining', async () => {
      initWsServer({} as any);
      const ws = createMockWs();
      setupAuth();
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        members: new Map(),
        phase: 'waiting',
        config: {},
        chat: [],
      };
      const otherRoom: any = {
        id: '5678',
        gameType: 'gomoku',
        members: new Map([[1, { userId: 1 }]]),
        phase: 'waiting',
        chat: [],
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom, otherRoom] as any);
      mockJoinRoom.mockReturnValue({ userId: 1, seat: 0 } as any);

      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });
      expect(mockRemoveMember).toHaveBeenCalled();
    });

    it('should handle joinRoom throwing', async () => {
      initWsServer({} as any);
      const ws = createMockWs();
      setupAuth();
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        members: new Map(),
        phase: 'waiting',
        config: {},
        chat: [],
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockJoinRoom.mockImplementation(() => {
        throw new Error('fail');
      });

      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });
      const errCall = (ws.send as any).mock.calls.find((c: any[]) => {
        const msg = JSON.parse(c[0]);
        return msg.t === 'error' && msg.message.includes('进入房间失败');
      });
      expect(errCall).toBeTruthy();
    });
  });

  // ─── Message Validation ───────────────────────────────
  describe('message handler - validation', () => {
    let messageHandler: ((raw: Buffer) => void) | null = null;

    const setupConnection = async (ws: any) => {
      ws.on = vi.fn((event: string, cb: any) => {
        if (event === 'message') messageHandler = cb;
      });
      setupAuth();
      await connectionHandler!(ws, { url: '/ws?token=valid' });
    };

    beforeEach(() => {
      initWsServer({} as any);
      messageHandler = null;
    });

    it('should reject non-JSON messages', async () => {
      const ws = createMockWs();
      await setupConnection(ws);
      messageHandler!(Buffer.from('not json'));
      const err = (ws.send as any).mock.calls.find((c: any[]) => {
        const msg = JSON.parse(c[0]);
        return msg.t === 'error' && msg.message.includes('解析失败');
      });
      expect(err).toBeTruthy();
    });

    it('should reject array messages', async () => {
      const ws = createMockWs();
      await setupConnection(ws);
      messageHandler!(Buffer.from('[1,2,3]'));
      const err = (ws.send as any).mock.calls.find((c: any[]) => {
        const msg = JSON.parse(c[0]);
        return msg.t === 'error' && msg.message.includes('格式错误');
      });
      expect(err).toBeTruthy();
    });

    it('should reject null messages', async () => {
      const ws = createMockWs();
      await setupConnection(ws);
      messageHandler!(Buffer.from('null'));
      const err = (ws.send as any).mock.calls.find((c: any[]) => {
        const msg = JSON.parse(c[0]);
        return msg.t === 'error' && msg.message.includes('格式错误');
      });
      expect(err).toBeTruthy();
    });

    it('should reject messages without t field', async () => {
      const ws = createMockWs();
      await setupConnection(ws);
      messageHandler!(Buffer.from(JSON.stringify({ foo: 'bar' })));
      const err = (ws.send as any).mock.calls.find((c: any[]) => {
        const msg = JSON.parse(c[0]);
        return msg.t === 'error' && msg.message.includes('类型');
      });
      expect(err).toBeTruthy();
    });

    it('should reject empty t field', async () => {
      const ws = createMockWs();
      await setupConnection(ws);
      messageHandler!(Buffer.from(JSON.stringify({ t: '' })));
      const err = (ws.send as any).mock.calls.find((c: any[]) => {
        const msg = JSON.parse(c[0]);
        return msg.t === 'error' && msg.message.includes('类型');
      });
      expect(err).toBeTruthy();
    });

    it('should reject non-string t field', async () => {
      const ws = createMockWs();
      await setupConnection(ws);
      messageHandler!(Buffer.from(JSON.stringify({ t: 123 })));
      const err = (ws.send as any).mock.calls.find((c: any[]) => {
        const msg = JSON.parse(c[0]);
        return msg.t === 'error' && msg.message.includes('类型');
      });
      expect(err).toBeTruthy();
    });

    it('should error for non-ping when not in room', async () => {
      const ws = createMockWs();
      await setupConnection(ws);
      messageHandler!(Buffer.from(JSON.stringify({ t: 'chat', content: 'hi' })));
      const err = (ws.send as any).mock.calls.find((c: any[]) => {
        const msg = JSON.parse(c[0]);
        return msg.t === 'error' && msg.message.includes('房间');
      });
      expect(err).toBeTruthy();
    });

    it('should silently ignore ping when not in room', async () => {
      const ws = createMockWs();
      await setupConnection(ws);
      messageHandler!(Buffer.from(JSON.stringify({ t: 'ping' })));
      // ping without room does NOT send pong; it just returns silently
      const pong = (ws.send as any).mock.calls.find((c: any[]) => JSON.parse(c[0]).t === 'pong');
      expect(pong).toBeUndefined();
    });
  });

  // ─── Room Actions ─────────────────────────────────────
  describe('message handler - room actions', () => {
    let messageHandler: ((raw: Buffer) => void) | null = null;
    let ws: any;
    let mockRoom: any;

    const setupRoom = (overrides: any = {}) => {
      mockRoom = {
        id: '1234',
        gameType: 'gomoku',
        hostUserId: 1,
        phase: 'waiting',
        lastActiveAt: 0,
        members: new Map([
          [
            1,
            {
              userId: 1,
              ws,
              seat: 0,
              nickname: 'Test',
              avatar: '',
              ready: false,
              rematch: false,
              online: true,
              offlineAt: 0,
              chips: 500,
            },
          ],
        ]),
        config: {},
        chat: [],
        ...overrides,
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom] as any);
    };

    beforeEach(async () => {
      initWsServer({} as any);
      messageHandler = null;
      ws = createMockWs();
      ws.on = vi.fn((event: string, cb: any) => {
        if (event === 'message') messageHandler = cb;
      });
      setupAuth();
      mockJoinRoom.mockReturnValue({
        userId: 1,
        seat: 0,
        ws,
        nickname: 'Test',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      } as any);
      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });
    });

    it('should handle ping in room', () => {
      setupRoom();
      messageHandler!(Buffer.from(JSON.stringify({ t: 'ping' })));
      const pong = (ws.send as any).mock.calls.find((c: any[]) => JSON.parse(c[0]).t === 'pong');
      expect(pong).toBeTruthy();
    });

    it('should update lastActiveAt on action', () => {
      setupRoom();
      mockRoom.lastActiveAt = 0;
      messageHandler!(Buffer.from(JSON.stringify({ t: 'ping' })));
      expect(mockRoom.lastActiveAt).toBeGreaterThan(0);
    });

    it('should reject unknown game actions', () => {
      setupRoom();
      mockGetHandler.mockReturnValue({
        ...defaultHandler,
        validActions: new Set(['place']),
      } as any);
      messageHandler!(Buffer.from(JSON.stringify({ t: 'hack_action' })));
      const err = (ws.send as any).mock.calls.find((c: any[]) => {
        const msg = JSON.parse(c[0]);
        return msg.t === 'error' && msg.message.includes('未知');
      });
      expect(err).toBeTruthy();
    });

    it('should route valid game actions to handler', () => {
      const onAction = vi.fn().mockReturnValue({});
      setupRoom();
      mockGetHandler.mockReturnValue({
        ...defaultHandler,
        validActions: new Set(['place']),
        onAction,
      } as any);
      messageHandler!(Buffer.from(JSON.stringify({ t: 'place', row: 3, col: 4 })));
      expect(onAction).toHaveBeenCalled();
    });

    it('should handle handler.onAction throwing', () => {
      setupRoom();
      mockGetHandler.mockReturnValue({
        ...defaultHandler,
        validActions: new Set(['place']),
        onAction: () => {
          throw new Error('boom');
        },
      } as any);
      messageHandler!(Buffer.from(JSON.stringify({ t: 'place' })));
      const err = (ws.send as any).mock.calls.find((c: any[]) => {
        const msg = JSON.parse(c[0]);
        return msg.t === 'error' && msg.message.includes('操作处理异常');
      });
      expect(err).toBeTruthy();
    });

    it('should send error from handler result', () => {
      setupRoom();
      mockGetHandler.mockReturnValue({
        ...defaultHandler,
        validActions: new Set(['place']),
        onAction: () => ({ error: 'Invalid move' }),
      } as any);
      messageHandler!(Buffer.from(JSON.stringify({ t: 'place' })));
      const err = (ws.send as any).mock.calls.find((c: any[]) => {
        const msg = JSON.parse(c[0]);
        return msg.t === 'error' && msg.message === 'Invalid move';
      });
      expect(err).toBeTruthy();
    });

    it('should end game when handler returns ended', () => {
      setupRoom();
      mockGetHandler.mockReturnValue({
        ...defaultHandler,
        validActions: new Set(['place']),
        onAction: () => ({ ended: { winnerSeat: 0, reason: 'five-in-row' } }),
      } as any);
      messageHandler!(Buffer.from(JSON.stringify({ t: 'place' })));
      expect(mockRoom.phase).toBe('ended');
    });

    it('should broadcast handler result messages', () => {
      const otherWs = createMockWs();
      setupRoom({
        members: new Map([
          [
            1,
            {
              userId: 1,
              ws,
              seat: 0,
              nickname: 'Test',
              avatar: '',
              ready: false,
              rematch: false,
              online: true,
              offlineAt: 0,
              chips: 500,
            },
          ],
          [
            2,
            {
              userId: 2,
              ws: otherWs,
              seat: 1,
              nickname: 'Bot',
              avatar: '',
              ready: false,
              rematch: false,
              online: true,
              offlineAt: 0,
              chips: 500,
            },
          ],
        ]),
      });
      mockGetHandler.mockReturnValue({
        ...defaultHandler,
        validActions: new Set(['place']),
        onAction: () => ({ broadcast: [{ t: 'piece_placed' }] }),
      } as any);
      messageHandler!(Buffer.from(JSON.stringify({ t: 'place' })));
      expect(otherWs.send).toHaveBeenCalled();
    });

    it('should handle handler result with toMember', () => {
      const otherWs = createMockWs();
      setupRoom({
        members: new Map([
          [
            1,
            {
              userId: 1,
              ws,
              seat: 0,
              nickname: 'Me',
              avatar: '',
              ready: false,
              rematch: false,
              online: true,
              offlineAt: 0,
              chips: 500,
            },
          ],
          [
            2,
            {
              userId: 2,
              ws: otherWs,
              seat: 1,
              nickname: 'Other',
              avatar: '',
              ready: false,
              rematch: false,
              online: true,
              offlineAt: 0,
              chips: 500,
            },
          ],
        ]),
      });
      mockGetHandler.mockReturnValue({
        ...defaultHandler,
        validActions: new Set(['place']),
        onAction: () => ({ toMember: [{ userId: 2, msg: { t: 'your_turn' } }] }),
      } as any);
      messageHandler!(Buffer.from(JSON.stringify({ t: 'place' })));
      expect(otherWs.send).toHaveBeenCalled();
    });

    it('should trigger settleGameChips when game ends via handler', () => {
      setupRoom({
        gameType: 'gomoku',
        chipSettled: false,
        game: { ranking: [{ userId: 1 }, { userId: 2 }] },
        config: { career: true },
      });
      mockGetHandler.mockReturnValue({
        ...defaultHandler,
        validActions: new Set(['place']),
        onAction: () => ({ ended: { winnerSeat: 0, reason: 'done' } }),
      } as any);
      messageHandler!(Buffer.from(JSON.stringify({ t: 'place' })));
      expect(mockRoom.chipSettled).toBe(true);
      expect(mockRoom.phase).toBe('ended');
    });

    it('should skip settleGameChips for chip-table games (blackjack)', () => {
      setupRoom({ gameType: 'blackjack', chipSettled: false, game: {}, config: {} });
      mockGetHandler.mockReturnValue({
        ...defaultHandler,
        validActions: new Set(['hit']),
        onAction: () => ({ ended: { winnerSeat: 0, reason: 'bust' } }),
      } as any);
      messageHandler!(Buffer.from(JSON.stringify({ t: 'hit' })));
      // chipSettled is set to true but early-returns for blackjack
      expect(mockRoom.chipSettled).toBe(true);
    });

    it('should not re-settle if chipSettled is already true', () => {
      setupRoom({ gameType: 'gomoku', chipSettled: true, game: {}, config: {} });
      mockGetHandler.mockReturnValue({
        ...defaultHandler,
        validActions: new Set(['place']),
        onAction: () => ({ ended: { winnerSeat: 0, reason: 'done' } }),
      } as any);
      messageHandler!(Buffer.from(JSON.stringify({ t: 'place' })));
      // Should not throw, and chipSettled remains true
      expect(mockRoom.chipSettled).toBe(true);
    });

    it('should use fallback ranking from members when game.ranking is empty', () => {
      const m1 = {
        userId: 1,
        ws,
        seat: 0,
        nickname: 'A',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const m2 = {
        userId: 2,
        ws: createMockWs(),
        seat: 1,
        nickname: 'B',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      setupRoom({
        gameType: 'gomoku',
        chipSettled: false,
        game: {},
        config: {},
        members: new Map([
          [1, m1],
          [2, m2],
        ]),
      });
      mockGetHandler.mockReturnValue({
        ...defaultHandler,
        validActions: new Set(['place']),
        onAction: () => ({ ended: { winnerSeat: 0, reason: 'win' } }),
      } as any);
      messageHandler!(Buffer.from(JSON.stringify({ t: 'place' })));
      expect(mockRoom.chipSettled).toBe(true);
    });
  });

  // ─── Chat ─────────────────────────────────────────────
  describe('message handler - chat', () => {
    let messageHandler: ((raw: Buffer) => void) | null = null;
    let ws: any;
    let mockRoom: any;

    beforeEach(async () => {
      initWsServer({} as any);
      messageHandler = null;
      ws = createMockWs();
      ws.on = vi.fn((event: string, cb: any) => {
        if (event === 'message') messageHandler = cb;
      });
      setupAuth();
      mockRoom = {
        id: '1234',
        gameType: 'gomoku',
        hostUserId: 1,
        phase: 'waiting',
        lastActiveAt: 0,
        members: new Map([
          [
            1,
            {
              userId: 1,
              ws,
              seat: 0,
              nickname: 'Test',
              avatar: '',
              ready: false,
              rematch: false,
              online: true,
              offlineAt: 0,
              chips: 500,
            },
          ],
        ]),
        config: {},
        chat: [],
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockJoinRoom.mockReturnValue(mockRoom.members.get(1) as any);
      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });
    });

    it('should handle chat message', () => {
      messageHandler!(Buffer.from(JSON.stringify({ t: 'chat', kind: 'text', content: 'Hello!' })));
      expect(mockAddChat).toHaveBeenCalled();
    });

    it('should default to text kind when kind is invalid', () => {
      messageHandler!(Buffer.from(JSON.stringify({ t: 'chat', kind: 'invalid', content: 'Hi' })));
      expect(mockAddChat.mock.calls[0][1].kind).toBe('text');
    });

    it('should accept emoji kind', () => {
      messageHandler!(Buffer.from(JSON.stringify({ t: 'chat', kind: 'emoji', content: '🎉' })));
      expect(mockAddChat.mock.calls[0][1].kind).toBe('emoji');
    });

    it('should ignore empty chat content', () => {
      messageHandler!(Buffer.from(JSON.stringify({ t: 'chat', kind: 'text', content: '   ' })));
      expect(mockAddChat).not.toHaveBeenCalled();
    });

    it('should truncate content to 200 chars', () => {
      messageHandler!(
        Buffer.from(JSON.stringify({ t: 'chat', kind: 'text', content: 'a'.repeat(300) }))
      );
      expect(mockAddChat.mock.calls[0][1].content.length).toBe(200);
    });

    it('should throttle chat within 300ms', () => {
      const member = mockRoom.members.get(1);
      member.lastChatAt = Date.now();
      messageHandler!(
        Buffer.from(JSON.stringify({ t: 'chat', kind: 'text', content: 'too fast' }))
      );
      expect(mockAddChat).not.toHaveBeenCalled();
    });
  });

  // ─── Ready ────────────────────────────────────────────
  describe('message handler - ready', () => {
    let messageHandler: ((raw: Buffer) => void) | null = null;
    let ws: any;

    beforeEach(() => {
      initWsServer({} as any);
      messageHandler = null;
      ws = createMockWs();
      ws.on = vi.fn((event: string, cb: any) => {
        if (event === 'message') messageHandler = cb;
      });
      setupAuth();
    });

    it('should toggle ready state', async () => {
      const member = {
        userId: 1,
        ws,
        seat: 0,
        nickname: 'Test',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        hostUserId: 1,
        phase: 'waiting',
        lastActiveAt: 0,
        members: new Map([[1, member]]),
        config: {},
        chat: [],
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockJoinRoom.mockReturnValue(member as any);
      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });

      messageHandler!(Buffer.from(JSON.stringify({ t: 'ready' })));
      expect(member.ready).toBe(true);
    });

    it('should ignore ready when phase is not waiting', async () => {
      const member = {
        userId: 1,
        ws,
        seat: 0,
        nickname: 'Test',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        hostUserId: 1,
        phase: 'playing',
        lastActiveAt: 0,
        members: new Map([[1, member]]),
        config: {},
        chat: [],
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockJoinRoom.mockReturnValue(member as any);
      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });

      messageHandler!(Buffer.from(JSON.stringify({ t: 'ready' })));
      expect(member.ready).toBe(false);
    });

    it('should ignore ready for spectators (seat -1)', async () => {
      const member = {
        userId: 1,
        ws,
        seat: -1,
        nickname: 'Viewer',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        hostUserId: 1,
        phase: 'waiting',
        lastActiveAt: 0,
        members: new Map([[1, member]]),
        config: {},
        chat: [],
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockJoinRoom.mockReturnValue(member as any);
      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });

      messageHandler!(Buffer.from(JSON.stringify({ t: 'ready' })));
      expect(member.ready).toBe(false);
    });

    it('should start game when all players ready', async () => {
      const startMock = vi.fn().mockReturnValue({});
      const m1 = {
        userId: 1,
        ws,
        seat: 0,
        nickname: 'A',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const m2 = {
        userId: 2,
        ws: createMockWs(),
        seat: 1,
        nickname: 'B',
        avatar: '',
        ready: true,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        hostUserId: 1,
        phase: 'waiting',
        lastActiveAt: 0,
        members: new Map([
          [1, m1],
          [2, m2],
        ]),
        config: {},
        chat: [],
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockGetHandler.mockReturnValue({ ...defaultHandler, start: startMock } as any);
      mockJoinRoom.mockReturnValue(m1 as any);
      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });

      messageHandler!(Buffer.from(JSON.stringify({ t: 'ready' })));
      // startGame resets ready=false for all, so check phase transition instead
      expect(mockRoom.phase).toBe('playing');
    });
  });

  // ─── Leave & Disband ──────────────────────────────────
  describe('message handler - leave & disband', () => {
    let messageHandler: ((raw: Buffer) => void) | null = null;
    let ws: any;

    beforeEach(() => {
      initWsServer({} as any);
      messageHandler = null;
      ws = createMockWs();
      ws.on = vi.fn((event: string, cb: any) => {
        if (event === 'message') messageHandler = cb;
      });
      setupAuth();
    });

    it('should handle leave message', async () => {
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        hostUserId: 2,
        phase: 'waiting',
        lastActiveAt: 0,
        members: new Map([
          [
            1,
            {
              userId: 1,
              ws,
              seat: 0,
              nickname: 'Test',
              avatar: '',
              ready: false,
              rematch: false,
              online: true,
              offlineAt: 0,
              chips: 500,
            },
          ],
          [
            2,
            {
              userId: 2,
              ws: createMockWs(),
              seat: 1,
              nickname: 'Host',
              avatar: '',
              ready: false,
              rematch: false,
              online: true,
              offlineAt: 0,
              chips: 500,
            },
          ],
        ]),
        config: {},
        chat: [],
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockRemoveMember.mockReturnValue('ok');
      mockJoinRoom.mockReturnValue(mockRoom.members.get(1) as any);
      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });

      messageHandler!(Buffer.from(JSON.stringify({ t: 'leave' })));
      const left = (ws.send as any).mock.calls.find((c: any[]) => JSON.parse(c[0]).t === 'left');
      expect(left).toBeTruthy();
    });

    it('should disband when empty after leave', async () => {
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        hostUserId: 1,
        phase: 'waiting',
        lastActiveAt: 0,
        members: new Map([
          [
            1,
            {
              userId: 1,
              ws,
              seat: 0,
              nickname: 'Test',
              avatar: '',
              ready: false,
              rematch: false,
              online: true,
              offlineAt: 0,
              chips: 500,
            },
          ],
        ]),
        config: {},
        chat: [],
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockRemoveMember.mockReturnValue('empty');
      mockJoinRoom.mockReturnValue(mockRoom.members.get(1) as any);
      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });

      messageHandler!(Buffer.from(JSON.stringify({ t: 'leave' })));
      expect(mockDisbandRoom).toHaveBeenCalledWith(mockRoom);
    });

    it('should reject disband from non-host', async () => {
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        hostUserId: 2,
        phase: 'waiting',
        lastActiveAt: 0,
        members: new Map([
          [
            1,
            {
              userId: 1,
              ws,
              seat: 0,
              nickname: 'Test',
              avatar: '',
              ready: false,
              rematch: false,
              online: true,
              offlineAt: 0,
              chips: 500,
            },
          ],
        ]),
        config: {},
        chat: [],
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockIsHost.mockReturnValue(false);
      mockJoinRoom.mockReturnValue(mockRoom.members.get(1) as any);
      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });

      messageHandler!(Buffer.from(JSON.stringify({ t: 'disband' })));
      const err = (ws.send as any).mock.calls.find((c: any[]) => {
        const msg = JSON.parse(c[0]);
        return msg.t === 'error' && msg.message.includes('房主');
      });
      expect(err).toBeTruthy();
    });

    it('should broadcast closed when host disbands', async () => {
      const otherWs = createMockWs();
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        hostUserId: 1,
        phase: 'waiting',
        lastActiveAt: 0,
        members: new Map([
          [
            1,
            {
              userId: 1,
              ws,
              seat: 0,
              nickname: 'Host',
              avatar: '',
              ready: false,
              rematch: false,
              online: true,
              offlineAt: 0,
              chips: 500,
            },
          ],
          [
            2,
            {
              userId: 2,
              ws: otherWs,
              seat: 1,
              nickname: 'Other',
              avatar: '',
              ready: false,
              rematch: false,
              online: true,
              offlineAt: 0,
              chips: 500,
            },
          ],
        ]),
        config: {},
        chat: [],
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockIsHost.mockReturnValue(true);
      mockRemoveMember.mockReturnValue('empty');
      mockJoinRoom.mockReturnValue(mockRoom.members.get(1) as any);
      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });

      messageHandler!(Buffer.from(JSON.stringify({ t: 'disband' })));
      expect(mockDisbandRoom).toHaveBeenCalledWith(mockRoom);
    });
  });

  // ─── kickUserEverywhere ───────────────────────────────
  describe('kickUserEverywhere', () => {
    it('should kick user and close connection', () => {
      const ws = createMockWs();
      const mockRoom: any = {
        id: '1234',
        chat: [],
        members: new Map([
          [
            1,
            {
              userId: 1,
              ws,
              seat: 0,
              nickname: 'Test',
              avatar: '',
              ready: false,
              rematch: false,
              online: true,
              offlineAt: 0,
              chips: 500,
            },
          ],
        ]),
      };
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockRemoveMember.mockReturnValue('ok');

      kickUserEverywhere(1, 'admin kicked');
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ t: 'closed', reason: 'admin kicked' }));
      expect(ws.close).toHaveBeenCalledWith(4008, 'admin kicked');
    });

    it('should handle user not in any room', () => {
      mockAllRooms.mockReturnValue([] as any);
      expect(() => kickUserEverywhere(999, 'reason')).not.toThrow();
    });

    it('should disband room if user was last member', () => {
      const ws = createMockWs();
      const mockRoom: any = {
        id: '1234',
        chat: [],
        members: new Map([
          [
            1,
            {
              userId: 1,
              ws,
              seat: 0,
              nickname: 'Solo',
              avatar: '',
              ready: false,
              rematch: false,
              online: true,
              offlineAt: 0,
              chips: 500,
            },
          ],
        ]),
      };
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockRemoveMember.mockReturnValue('empty');

      kickUserEverywhere(1, 'cleanup');
      expect(mockDisbandRoom).toHaveBeenCalledWith(mockRoom);
    });
  });

  // ─── Start game & restartGame ─────────────────────────
  describe('startGame & restartGame', () => {
    let messageHandler: ((raw: Buffer) => void) | null = null;
    let ws: any;

    beforeEach(() => {
      initWsServer({} as any);
      messageHandler = null;
      ws = createMockWs();
      ws.on = vi.fn((event: string, cb: any) => {
        if (event === 'message') messageHandler = cb;
      });
      setupAuth();
    });

    it('should call handler.start with broadcast when game starts', async () => {
      const startMock = vi.fn().mockReturnValue({ broadcast: [{ t: 'cards_dealt' }] });
      const m1 = {
        userId: 1,
        ws,
        seat: 0,
        nickname: 'A',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const m2 = {
        userId: 2,
        ws: createMockWs(),
        seat: 1,
        nickname: 'B',
        avatar: '',
        ready: true,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        hostUserId: 1,
        phase: 'waiting',
        lastActiveAt: 0,
        members: new Map([
          [1, m1],
          [2, m2],
        ]),
        config: {},
        chat: [],
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockGetHandler.mockReturnValue({ ...defaultHandler, start: startMock } as any);
      mockJoinRoom.mockReturnValue(m1 as any);
      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });

      // Ready up → triggers startGame
      messageHandler!(Buffer.from(JSON.stringify({ t: 'ready' })));
      expect(startMock).toHaveBeenCalled();
    });

    it('should handle handler.start returning toMember', async () => {
      const otherWs = createMockWs();
      const startMock = vi
        .fn()
        .mockReturnValue({ toMember: [{ userId: 2, msg: { t: 'your_cards' } }] });
      const m1 = {
        userId: 1,
        ws,
        seat: 0,
        nickname: 'A',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const m2 = {
        userId: 2,
        ws: otherWs,
        seat: 1,
        nickname: 'B',
        avatar: '',
        ready: true,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        hostUserId: 1,
        phase: 'waiting',
        lastActiveAt: 0,
        members: new Map([
          [1, m1],
          [2, m2],
        ]),
        config: {},
        chat: [],
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockGetHandler.mockReturnValue({ ...defaultHandler, start: startMock } as any);
      mockJoinRoom.mockReturnValue(m1 as any);
      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });

      messageHandler!(Buffer.from(JSON.stringify({ t: 'ready' })));
      expect(otherWs.send).toHaveBeenCalled();
    });

    it('should log error when handler.start returns error', async () => {
      const startMock = vi.fn().mockReturnValue({ error: 'setup failed' });
      const m1 = {
        userId: 1,
        ws,
        seat: 0,
        nickname: 'A',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const m2 = {
        userId: 2,
        ws: createMockWs(),
        seat: 1,
        nickname: 'B',
        avatar: '',
        ready: true,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        hostUserId: 1,
        phase: 'waiting',
        lastActiveAt: 0,
        members: new Map([
          [1, m1],
          [2, m2],
        ]),
        config: {},
        chat: [],
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockGetHandler.mockReturnValue({ ...defaultHandler, start: startMock } as any);
      mockJoinRoom.mockReturnValue(m1 as any);
      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });

      // Should not throw
      messageHandler!(Buffer.from(JSON.stringify({ t: 'ready' })));
      expect(mockRoom.phase).toBe('playing');
    });

    it('should handle handler.start throwing', async () => {
      const startMock = vi.fn().mockImplementation(() => {
        throw new Error('boom');
      });
      const m1 = {
        userId: 1,
        ws,
        seat: 0,
        nickname: 'A',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const m2 = {
        userId: 2,
        ws: createMockWs(),
        seat: 1,
        nickname: 'B',
        avatar: '',
        ready: true,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        hostUserId: 1,
        phase: 'waiting',
        lastActiveAt: 0,
        members: new Map([
          [1, m1],
          [2, m2],
        ]),
        config: {},
        chat: [],
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockGetHandler.mockReturnValue({ ...defaultHandler, start: startMock } as any);
      mockJoinRoom.mockReturnValue(m1 as any);
      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });

      // Should not throw
      expect(() => messageHandler!(Buffer.from(JSON.stringify({ t: 'ready' })))).not.toThrow();
    });

    it('should trigger restartGame when both players rematch', async () => {
      const startMock = vi.fn().mockReturnValue({});
      const m1 = {
        userId: 1,
        ws,
        seat: 0,
        nickname: 'A',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const m2 = {
        userId: 2,
        ws: createMockWs(),
        seat: 1,
        nickname: 'B',
        avatar: '',
        ready: false,
        rematch: true,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        hostUserId: 1,
        phase: 'ended',
        lastActiveAt: 0,
        members: new Map([
          [1, m1],
          [2, m2],
        ]),
        config: {},
        chat: [],
        game: {},
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockGetHandler.mockReturnValue({
        ...defaultHandler,
        start: startMock,
        rematchSwapSeats: false,
      } as any);
      mockJoinRoom.mockReturnValue(m1 as any);
      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });

      messageHandler!(Buffer.from(JSON.stringify({ t: 'rematch' })));
      // Both players rematch → restartGame called → phase becomes 'playing'
      expect(mockRoom.phase).toBe('playing');
      expect(startMock).toHaveBeenCalled();
    });

    it('should swap seats when rematchSwapSeats is true', async () => {
      const m1 = {
        userId: 1,
        ws,
        seat: 0,
        nickname: 'A',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const m2 = {
        userId: 2,
        ws: createMockWs(),
        seat: 1,
        nickname: 'B',
        avatar: '',
        ready: false,
        rematch: true,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        hostUserId: 1,
        phase: 'ended',
        lastActiveAt: 0,
        members: new Map([
          [1, m1],
          [2, m2],
        ]),
        config: {},
        chat: [],
        game: {},
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockGetHandler.mockReturnValue({
        ...defaultHandler,
        start: vi.fn().mockReturnValue({}),
        rematchSwapSeats: true,
      } as any);
      mockJoinRoom.mockReturnValue(m1 as any);
      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });

      messageHandler!(Buffer.from(JSON.stringify({ t: 'rematch' })));
      // Seats should be swapped
      expect(m1.seat).toBe(1);
      expect(m2.seat).toBe(0);
    });

    it('should broadcast rematch_vote when not all players voted', async () => {
      const otherWs = createMockWs();
      const m1 = {
        userId: 1,
        ws,
        seat: 0,
        nickname: 'A',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const m2 = {
        userId: 2,
        ws: otherWs,
        seat: 1,
        nickname: 'B',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        hostUserId: 1,
        phase: 'ended',
        lastActiveAt: 0,
        members: new Map([
          [1, m1],
          [2, m2],
        ]),
        config: {},
        chat: [],
        game: {},
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockGetHandler.mockReturnValue({ ...defaultHandler, rematchSwapSeats: false } as any);
      mockJoinRoom.mockReturnValue(m1 as any);
      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });

      messageHandler!(Buffer.from(JSON.stringify({ t: 'rematch' })));
      // Only m1 voted; m2 hasn't → should broadcast rematch_vote
      const voteCall = otherWs.send.mock.calls.find((c: any[]) => {
        const msg = JSON.parse(c[0]);
        return msg.t === 'rematch_vote';
      });
      expect(voteCall).toBeTruthy();
    });

    it('should ignore rematch when phase is not ended', async () => {
      const m1 = {
        userId: 1,
        ws,
        seat: 0,
        nickname: 'A',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        hostUserId: 1,
        phase: 'playing',
        lastActiveAt: 0,
        members: new Map([[1, m1]]),
        config: {},
        chat: [],
        game: {},
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockJoinRoom.mockReturnValue(m1 as any);
      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });

      messageHandler!(Buffer.from(JSON.stringify({ t: 'rematch' })));
      expect(m1.rematch).toBe(false); // not set
    });
  });

  // ─── handleLeave resign ──────────────────────────────
  describe('handleLeave resign flow', () => {
    let messageHandler: ((raw: Buffer) => void) | null = null;
    let ws: any;

    beforeEach(() => {
      initWsServer({} as any);
      messageHandler = null;
      ws = createMockWs();
      ws.on = vi.fn((event: string, cb: any) => {
        if (event === 'message') messageHandler = cb;
      });
      setupAuth();
    });

    it('should call onPlayerQuit when player leaves during playing phase', async () => {
      const onPlayerQuit = vi.fn().mockReturnValue({});
      const m1 = {
        userId: 1,
        ws,
        seat: 0,
        nickname: 'A',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const m2 = {
        userId: 2,
        ws: createMockWs(),
        seat: 1,
        nickname: 'B',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        hostUserId: 2,
        phase: 'playing',
        lastActiveAt: 0,
        members: new Map([
          [1, m1],
          [2, m2],
        ]),
        config: {},
        chat: [],
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockRemoveMember.mockReturnValue('resign');
      mockGetHandler.mockReturnValue({ ...defaultHandler, onPlayerQuit } as any);
      mockJoinRoom.mockReturnValue(m1 as any);
      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });

      messageHandler!(Buffer.from(JSON.stringify({ t: 'leave' })));
      expect(onPlayerQuit).toHaveBeenCalled();
    });

    it('should end game when onPlayerQuit returns ended', async () => {
      const onPlayerQuit = vi
        .fn()
        .mockReturnValue({ ended: { winnerSeat: 1, reason: 'opponent left' } });
      const m1 = {
        userId: 1,
        ws,
        seat: 0,
        nickname: 'A',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const m2 = {
        userId: 2,
        ws: createMockWs(),
        seat: 1,
        nickname: 'B',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        hostUserId: 2,
        phase: 'playing',
        lastActiveAt: 0,
        members: new Map([
          [1, m1],
          [2, m2],
        ]),
        config: {},
        chat: [],
        chipSettled: false,
        game: {},
      };
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockRemoveMember.mockReturnValue('resign');
      mockGetHandler.mockReturnValue({ ...defaultHandler, onPlayerQuit } as any);
      mockJoinRoom.mockReturnValue(m1 as any);
      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });

      messageHandler!(Buffer.from(JSON.stringify({ t: 'leave' })));
      expect(mockRoom.phase).toBe('ended');
    });
  });

  // ─── Close handler ────────────────────────────────────
  describe('close handler', () => {
    it('should handle close without errors', async () => {
      let closeHandler: (() => void) | null = null;
      const ws: any = {
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn((e: string, cb: any) => {
          if (e === 'close') closeHandler = cb;
        }),
      };
      initWsServer({} as any);
      setupAuth();
      await connectionHandler!(ws, { url: '/ws?token=valid' });
      expect(closeHandler).toBeTruthy();
      expect(() => closeHandler!()).not.toThrow();
    });

    it('should mark member offline on close', async () => {
      let closeHandler: (() => void) | null = null;
      const ws: any = {
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn((e: string, cb: any) => {
          if (e === 'close') closeHandler = cb;
        }),
      };
      const member = {
        userId: 1,
        ws,
        seat: 0,
        nickname: 'Test',
        avatar: '',
        ready: false,
        rematch: false,
        online: true,
        offlineAt: 0,
        chips: 500,
      };
      const mockRoom: any = {
        id: '1234',
        gameType: 'gomoku',
        hostUserId: 1,
        phase: 'waiting',
        members: new Map([[1, member]]),
        config: {},
        chat: [],
      };

      initWsServer({} as any);
      setupAuth();
      ws.on = vi.fn((event: string, cb: any) => {
        if (event === 'close') closeHandler = cb;
        if (event === 'message') {
          /* noop */
        }
      });
      mockGetRoom.mockReturnValue(mockRoom);
      mockAllRooms.mockReturnValue([mockRoom] as any);
      mockJoinRoom.mockReturnValue(member as any);
      await connectionHandler!(ws, { url: '/ws?token=valid&roomId=1234' });

      closeHandler!();
      expect(member.online).toBe(false);
      expect(member.ws).toBeNull();
      expect(member.offlineAt).toBeGreaterThan(0);
    });
  });

  // ─── Error handler ────────────────────────────────────
  describe('error handler', () => {
    it('should handle error event', async () => {
      let errorHandler: ((err: Error) => void) | null = null;
      const ws: any = {
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn((e: string, cb: any) => {
          if (e === 'error') errorHandler = cb;
        }),
      };
      initWsServer({} as any);
      setupAuth();
      await connectionHandler!(ws, { url: '/ws?token=valid' });
      expect(errorHandler).toBeTruthy();
      expect(() => errorHandler!(new Error('test'))).not.toThrow();
    });
  });

  // ─── listGameTypes ────────────────────────────────────
  describe('listGameTypes', () => {
    it('should return an array', () => {
      expect(Array.isArray(listGameTypes())).toBe(true);
    });
  });
});
