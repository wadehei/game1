// WebSocket 服务：挂载在现有 HTTP server 的 /ws 路径
// 鉴权：连接时 query 带 token（复用角色登录 JWT）；房间加入用 query 的 roomId，断线重连同一路径自动回到原房间
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from '../config';
import { logError } from '../utils/logger';
import { User } from '../models';
import {
  addChat,
  createRoom,
  disbandRoom,
  getRoom,
  isHost,
  joinRoom,
  MAX_MEMBERS,
  memberList,
  removeMember,
  Room,
  sweepIdle,
  type ChatMsg,
  type Member,
} from './roomManager';
import { BLACK, BOARD_SIZE, placeStone, WHITE } from './gomoku';

interface Ctx {
  userId: number;
  roomId: string | null;
}

const clients = new WeakMap<WebSocket, Ctx>();

const send = (ws: WebSocket, obj: Record<string, unknown>): void => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
};

const broadcast = (room: Room, obj: Record<string, unknown>, exceptWs?: WebSocket): void => {
  for (const m of room.members.values()) {
    if (m.ws && m.ws !== exceptWs) send(m.ws, obj);
  }
};

/** 全量房间快照（含最近50条聊天），重连/状态变化时发 */
const snapshot = (room: Room) => ({
  roomId: room.id,
  gameType: room.gameType,
  hostUserId: room.hostUserId,
  phase: room.phase,
  members: memberList(room),
  game: {
    board: room.game.board,
    turn: room.game.turn,
    winner: room.game.winner,
    winLine: room.game.winLine,
    lastMove: room.game.lastMove,
  },
  chat: room.chat.slice(-50),
});

const startGame = (room: Room): void => {
  room.phase = 'playing';
  for (const m of room.members.values()) {
    m.ready = false;
    m.rematch = false;
  }
  broadcast(room, { t: 'game_start', phase: room.phase });
};

const endGame = (room: Room, winnerSeat: number, reason: string): void => {
  room.phase = 'ended';
  room.game.winner = winnerSeat === 0 ? 1 : winnerSeat === 1 ? 2 : 3;
  broadcast(room, { t: 'game_over', winnerSeat, reason });
};

const handleLeave = (room: Room, userId: number): void => {
  const result = removeMember(room, userId);
  if (result === 'empty') {
    disbandRoom(room); // 人走光→房间销毁，聊天语音一并清空
    return;
  }
  if (result === 'resign') {
    const quitter = userId;
    const winnerSeat = [...room.members.values()].find((m) => m.seat >= 0 && m.userId !== quitter)?.seat ?? -1;
    endGame(room, winnerSeat, '对方退出了对局');
  }
  broadcast(room, { t: 'member_left', userId });
  broadcast(room, { t: 'snapshot', ...snapshot(room) });
};

export const initWsServer = (server: Server): void => {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws: WebSocket, req: import('http').IncomingMessage) => {
    let userId = 0;
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const token = url.searchParams.get('token') || '';
      const decoded = jwt.verify(token, config.jwt.secret) as { userId: number };
      userId = decoded.userId;
    } catch {
      ws.close(4001, '未登录');
      return;
    }

    const user = await User.findByPk(userId, { attributes: ['id', 'nickname', 'avatar'] });
    if (!user) {
      ws.close(4002, '角色不存在');
      return;
    }
    clients.set(ws, { userId, roomId: null });
    send(ws, { t: 'auth_ok', userId });

    // 连接即带 roomId = 直接进房（重连也走这里，座位保留）
    const url = new URL(req.url || '/', 'http://localhost');
    const roomId = url.searchParams.get('roomId');
    if (roomId) {
      const room = getRoom(roomId);
      if (!room) {
        send(ws, { t: 'error', message: '房间不存在或已解散' });
        return;
      }
      let member: Member;
      if (!room.members.has(userId) && room.members.size >= MAX_MEMBERS) {
        send(ws, { t: 'error', message: '房间人满了（最多 8 人）' });
        return;
      }
      try {
        member = joinRoom(room, { userId, nickname: user.nickname, avatar: user.avatar });
      } catch {
        send(ws, { t: 'error', message: '进入房间失败' });
        return;
      }
      member.ws = ws;
      clients.set(ws, { userId, roomId: room.id });
      send(ws, { t: 'joined', yourSeat: member.seat, ...snapshot(room) });
      broadcast(room, { t: 'member_update', members: memberList(room) }, ws);
    }

    ws.on('message', (raw: Buffer) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const ctx = clients.get(ws);
      if (!ctx) return;
      const room = ctx.roomId ? getRoom(ctx.roomId) : undefined;
      if (!room) {
        if (msg.t !== 'ping') send(ws, { t: 'error', message: '你还没有进入房间' });
        return;
      }
      const me = room.members.get(ctx.userId);
      if (!me) return;
      room.lastActiveAt = Date.now();

      switch (msg.t) {
        case 'ping':
          send(ws, { t: 'pong' });
          break;

        case 'ready': {
          if (room.phase !== 'waiting' || me.seat < 0) return;
          me.ready = !me.ready;
          const players = [...room.members.values()].filter((m) => m.seat >= 0);
          if (players.length === 2 && players.every((m) => m.ready)) {
            startGame(room);
          }
          broadcast(room, { t: 'member_update', members: memberList(room) });
          broadcast(room, { t: 'snapshot', ...snapshot(room) });
          break;
        }

        case 'move': {
          if (room.phase !== 'playing' || me.seat < 0) return;
          const color = me.seat === 0 ? BLACK : WHITE;
          const err = placeStone(room.game, color, Number(msg.x), Number(msg.y));
          if (err) {
            send(ws, { t: 'error', message: err });
            return;
          }
          broadcast(room, {
            t: 'move',
            x: Number(msg.x),
            y: Number(msg.y),
            color,
            userId: me.userId,
            turn: room.game.turn,
            lastMove: room.game.lastMove,
            winner: room.game.winner,
            winLine: room.game.winLine,
          });
          if (room.game.winner !== 0) {
            room.phase = 'ended';
            const winnerSeat = room.game.winner === 1 ? 0 : room.game.winner === 2 ? 1 : -1;
            broadcast(room, { t: 'game_over', winnerSeat, reason: room.game.winner === 3 ? '棋盘已满' : '五连成线' });
          }
          break;
        }

        case 'resign': {
          if (room.phase !== 'playing' || me.seat < 0) return;
          const winnerSeat = me.seat === 0 ? 1 : 0;
          endGame(room, winnerSeat, '对方认输');
          break;
        }

        case 'rematch': {
          if (room.phase !== 'ended' || me.seat < 0) return;
          me.rematch = true;
          const players = [...room.members.values()].filter((m) => m.seat >= 0);
          if (players.length === 2 && players.every((m) => m.rematch)) {
            // 重开：交换黑白
            for (const m of room.members.values()) {
              if (m.seat === 0) m.seat = 1;
              else if (m.seat === 1) m.seat = 0;
            }
            room.game = { ...room.game, board: Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0)), turn: BLACK, winner: 0, winLine: [], moveCount: 0, lastMove: null };
            room.phase = 'playing';
            for (const m of room.members.values()) m.rematch = false;
            broadcast(room, { t: 'game_restart', phase: room.phase });
          } else {
            broadcast(room, { t: 'rematch_vote', userIds: players.filter((m) => m.rematch).map((m) => m.userId) });
          }
          broadcast(room, { t: 'snapshot', ...snapshot(room) });
          break;
        }

        case 'chat': {
          const kind = ['text', 'emoji', 'quick'].includes(msg.kind) ? msg.kind : 'text';
          const content = String(msg.content || '').trim().slice(0, 200);
          if (!content) return;
          // 轻量限流：同一人 300ms 内只收一条
          if (me.lastChatAt && Date.now() - me.lastChatAt < 300) return;
          me.lastChatAt = Date.now();
          const chat: ChatMsg = { userId: me.userId, nickname: me.nickname, kind, content, ts: Date.now() };
          addChat(room, chat);
          broadcast(room, { t: 'chat', ...chat });
          break;
        }

        case 'leave': {
          handleLeave(room, ctx.userId);
          ctx.roomId = null;
          send(ws, { t: 'left' });
          break;
        }

        case 'disband': {
          if (!isHost(room, ctx.userId)) {
            send(ws, { t: 'error', message: '只有房主能解散房间' });
            return;
          }
          broadcast(room, { t: 'closed', reason: '房主解散了房间' });
          disbandRoom(room); // 聊天与语音随房间一起清空
          break;
        }

        default:
          break;
      }
    });

    ws.on('close', () => {
      const ctx = clients.get(ws);
      clients.delete(ws);
      if (!ctx?.roomId) return;
      const room = getRoom(ctx.roomId);
      if (!room) return;
      const me = room.members.get(ctx.userId);
      if (!me) return;
      // 断线不立刻踢：保留成员 60 秒等重连；对局中超时按认输处理
      me.online = false;
      me.ws = null;
      me.offlineAt = Date.now();
      broadcast(room, { t: 'member_update', members: memberList(room) });
      const timer = setTimeout(() => {
        const r = getRoom(room.id);
        const m = r?.members.get(ctx.userId);
        if (r && m && !m.online) {
          handleLeave(r, ctx.userId);
          if (getRoom(room.id)) broadcast(r, { t: 'snapshot', ...snapshot(r) });
        }
      }, 60_000);
      timer.unref?.();
    });

    ws.on('error', (err) => {
      logError('ws', `WebSocket 连接错误: ${err.message}`);
    });
  });

  // 定期清理：空闲房间解散、过期语音清除
  setInterval(() => {
    try {
      sweepIdle();
    } catch (err) {
      logError('ws', `房间清理失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, 5 * 60 * 1000).unref();
};
