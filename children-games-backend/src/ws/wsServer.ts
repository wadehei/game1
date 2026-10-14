// WebSocket 服务：挂载在现有 HTTP server 的 /ws 路径
// 鉴权：连接时 query 带 token（复用角色登录 JWT）；roomId 相同的连接自动进/回房间
// 游戏逻辑全部路由到 games/ 下的 GameHandler，本文件只管房间生命周期与消息分发
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
  memberList,
  removeMember,
  Room,
  sweepIdle,
  TOTAL_MEMBER_LIMIT,
  clearRoomTimers,
  type ChatMsg,
  type Member,
} from './roomManager';
import { getHandler, gameHandlers } from './games/registry';
import { setRoomBus } from './bus';

interface Ctx {
  userId: number;
  roomId: string | null;
}

const clients = new WeakMap<WebSocket, Ctx>();

const send = (ws: WebSocket, obj: Record<string, unknown>): void => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
};

const broadcast = (room: Room, msg: Record<string, unknown>, exceptWs?: WebSocket): void => {
  for (const m of room.members.values()) {
    if (m.ws && m.ws !== exceptWs) send(m.ws, msg);
  }
};

/** 快照：game 段按观看者序列化（私发信息的地基） */
const snapshotFor = (room: Room, viewer: Member): Record<string, unknown> => ({
  roomId: room.id,
  gameType: room.gameType,
  hostUserId: room.hostUserId,
  phase: room.phase,
  members: memberList(room),
  game: getHandler(room.gameType).serializeFor(room, viewer),
  chat: room.chat.slice(-50),
});

const broadcastSnapshot = (room: Room, exceptWs?: WebSocket): void => {
  for (const m of room.members.values()) {
    if (m.ws && m.ws !== exceptWs) send(m.ws, { t: 'snapshot', ...snapshotFor(room, m) });
  }
};

const busBroadcast = (room: Room, msg: Record<string, unknown>, exceptUserId?: number): void => {
  for (const m of room.members.values()) {
    if (m.ws && m.userId !== exceptUserId) send(m.ws, msg);
  }
};

const busSendToUser = (room: Room, userId: number, msg: Record<string, unknown>): void => {
  const m = room.members.get(userId);
  if (m?.ws) send(m.ws, msg);
};

const startGame = (room: Room): void => {
  room.phase = 'playing';
  const handler = getHandler(room.gameType);
  for (const m of room.members.values()) {
    m.ready = false;
    m.rematch = false;
  }
  const result = handler.start?.(room);
  if (result?.broadcast) result.broadcast.forEach((msg) => busBroadcast(room, msg));
  if (result?.toMember) result.toMember.forEach(({ userId, msg }) => busSendToUser(room, userId, msg));
  if (result?.error) logError('ws', `${room.gameType} start 异常: ${result.error}`);
  broadcast(room, { t: 'game_start', phase: room.phase });
};

const endGame = (room: Room, winnerSeat: number, reason: string): void => {
  room.phase = 'ended';
  clearRoomTimers(room);
  broadcast(room, { t: 'game_over', winnerSeat, reason });
};

/** 通用重开：重置游戏状态，必要时交换座位；由 rematch 表决触发 */
const restartGame = (room: Room): void => {
  const handler = getHandler(room.gameType);
  if (handler.rematchSwapSeats) {
    for (const m of room.members.values()) {
      if (m.seat === 0) m.seat = 1;
      else if (m.seat === 1) m.seat = 0;
    }
  }
  room.game = handler.create();
  room.phase = 'playing';
  for (const m of room.members.values()) {
    m.ready = false;
    m.rematch = false;
  }
  const result = handler.start?.(room);
  if (result?.broadcast) result.broadcast.forEach((msg) => busBroadcast(room, msg));
  if (result?.toMember) result.toMember.forEach(({ userId, msg }) => busSendToUser(room, userId, msg));
  broadcast(room, { t: 'game_restart', phase: room.phase });
};

const handleLeave = (room: Room, userId: number): void => {
  const quitter = room.members.get(userId);
  const result = removeMember(room, userId);
  if (result === 'empty') {
    disbandRoom(room); // 人走光→房间销毁，聊天语音一并清空
    return;
  }
  if (result === 'resign' && quitter) {
    const quitResult = getHandler(room.gameType).onPlayerQuit?.(room, quitter);
    const ended = quitResult?.ended;
    endGame(room, ended ? ended.winnerSeat : -1, ended ? ended.reason : '对方退出了对局');
  }
  broadcast(room, { t: 'member_left', userId });
  broadcastSnapshot(room);
};

export const initWsServer = (server: Server): void => {
  const wss = new WebSocketServer({ server, path: '/ws' });

  setRoomBus({ broadcast: busBroadcast, sendToUser: busSendToUser });

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
      const handler = getHandler(room.gameType);
      if (!room.members.has(userId) && room.members.size >= TOTAL_MEMBER_LIMIT) {
        send(ws, { t: 'error', message: `房间人满（最多 ${TOTAL_MEMBER_LIMIT} 人）` });
        return;
      }
      let member: Member;
      try {
        member = joinRoom(room, { userId, nickname: user.nickname, avatar: user.avatar });
      } catch {
        send(ws, { t: 'error', message: '进入房间失败' });
        return;
      }
      member.ws = ws;
      clients.set(ws, { userId, roomId: room.id });
      send(ws, { t: 'joined', yourSeat: member.seat, gameTitle: handler.title, ...snapshotFor(room, member) });
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
          const handler = getHandler(room.gameType);
          me.ready = !me.ready;
          const players = [...room.members.values()].filter((m) => m.seat >= 0);
          if (players.length >= handler.minPlayers && players.every((m) => m.ready)) {
            startGame(room);
            broadcastSnapshot(room);
            return;
          }
          broadcast(room, { t: 'member_update', members: memberList(room) });
          break;
        }

        case 'rematch': {
          if (room.phase !== 'ended' || me.seat < 0) return;
          me.rematch = true;
          const players = [...room.members.values()].filter((m) => m.seat >= 0);
          if (players.length >= 2 && players.every((m) => m.rematch)) {
            restartGame(room);
          } else {
            broadcast(room, { t: 'rematch_vote', userIds: players.filter((m) => m.rematch).map((m) => m.userId) });
          }
          broadcastSnapshot(room);
          break;
        }

        case 'chat': {
          const kind = ['text', 'emoji', 'quick'].includes(msg.kind) ? msg.kind : 'text';
          const content = String(msg.content || '').trim().slice(0, 200);
          if (!content) return;
          if (me.lastChatAt && Date.now() - me.lastChatAt < 300) return; // 防刷屏
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

        default: {
          // 游戏动作：路由到对应 handler
          const handler = getHandler(room.gameType);
          const result = handler.onAction(room, me, msg.t, msg);
          if (result.error) {
            send(ws, { t: 'error', message: result.error });
            return;
          }
          if (result.broadcast) result.broadcast.forEach((m) => broadcast(room, m));
          if (result.toMember) result.toMember.forEach(({ userId: uid, msg: m }) => busSendToUser(room, uid, m));
          if (result.ended) {
            endGame(room, result.ended.winnerSeat, result.ended.reason);
            broadcastSnapshot(room);
          }
          break;
        }
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
      // 断线不立刻踢：保留成员 60 秒等重连；对局中超时按游戏规则处置（五子棋判负）
      me.online = false;
      me.ws = null;
      me.offlineAt = Date.now();
      broadcast(room, { t: 'member_update', members: memberList(room) });
      const timer = setTimeout(() => {
        const r = getRoom(room.id);
        const m = r?.members.get(ctx.userId);
        if (r && m && !m.online) {
          handleLeave(r, ctx.userId);
          if (getRoom(room.id)) broadcastSnapshot(r);
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

// 供大厅展示的游戏列表
export const listGameTypes = () =>
  Object.values(gameHandlers).map((h) => ({
    type: h.type,
    title: h.title,
    emoji: h.emoji,
    desc: h.desc,
    minPlayers: h.minPlayers,
    maxPlayers: h.maxPlayers,
  }));
