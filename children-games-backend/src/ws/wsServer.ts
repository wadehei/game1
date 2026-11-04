// WebSocket 服务入口：挂载在 HTTP server 的 /ws 路径
// 职责：连接认证、房间进出、断线重连、定期清理
// 游戏逻辑 → gameFlow.ts / messageHandler.ts，通信工具 → messaging.ts
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from '../config';
import { logError } from '../utils/logger';
import { User } from '../models';
import { isTokenBlacklisted } from '../services/tokenService';
import {
  allRooms,
  getRoom,
  joinRoom,
  memberList,
  sweepIdle,
  TOTAL_MEMBER_LIMIT,
  type Member,
} from './roomManager';
import { getHandler, gameHandlers } from './games/registry';
import { setRoomBus } from './bus';
import { applyChipDelta, grantDailyRelief, CHIPS_JOIN_MIN } from '../services/battleChips';
import { send, broadcast, snapshotFor, broadcastSnapshot } from './messaging';
import { settleGameChips, type GameFlowDeps } from './gameFlow';
import {
  handleLeave,
  dispatchMessage,
  isKnownRoomAction,
  setMessageHandlerDeps,
} from './messageHandler';

interface Ctx {
  userId: number;
  roomId: string | null;
}

const clients = new WeakMap<WebSocket, Ctx>();

// ─── Bus 层：带积分结算拦截的广播 ───────────────────
const busBroadcast = (
  room: import('./roomManager').Room,
  msg: Record<string, unknown>,
  exceptUserId?: number
): void => {
  if (msg.t === 'game_over') settleGameChips(room, Number(msg.winnerSeat ?? -1));
  for (const m of room.members.values()) {
    if (m.ws && m.userId !== exceptUserId) send(m.ws, msg);
  }
};

const busSendToUser = (
  room: import('./roomManager').Room,
  userId: number,
  msg: Record<string, unknown>
): void => {
  const m = room.members.get(userId);
  if (m?.ws) send(m.ws, msg);
};

// 组装依赖
const flowDeps: GameFlowDeps = { busBroadcast, busSendToUser, broadcast };
setMessageHandlerDeps({ ...flowDeps, handleLeave });

// ─── 管理端踢人 ───────────────────
export const kickUserEverywhere = (userId: number, reason: string): void => {
  for (const room of allRooms()) {
    const me = room.members.get(userId);
    if (!me) continue;
    try {
      me.ws?.send(JSON.stringify({ t: 'closed', reason }));
    } catch {
      /* 忽略发送失败 */
    }
    handleLeave(room, userId);
    broadcast(room, { t: 'closed', reason });
    try {
      me.ws?.close(4008, reason);
    } catch {
      /* 连接可能已关闭 */
    }
  }
};

// ─── 初始化 ───────────────────
export const initWsServer = (server: Server): void => {
  const wss = new WebSocketServer({ server, path: '/ws' });
  setRoomBus({ broadcast: busBroadcast, sendToUser: busSendToUser });

  wss.on('connection', async (ws: WebSocket, req: import('http').IncomingMessage) => {
    let userId = 0;
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const token = url.searchParams.get('token') || '';
      const decoded = jwt.verify(token, config.jwt.secret) as {
        userId: number;
        type?: string;
        role?: string;
        jti?: string;
      };
      // 访问凭证类型校验：refresh/旧版长期用户令牌不得连接（env 管理员 JWT 无 type 仍兼容，SP-05 收尾）
      if (decoded.type !== 'access' && !(decoded.type === undefined && decoded.role === 'admin')) {
        throw new Error('token type denied');
      }
      // 已撤销（登出/黑名单）的 access token 不得再建立连接
      if (decoded.jti && (await isTokenBlacklisted(decoded.jti))) {
        throw new Error('token revoked');
      }
      userId = decoded.userId;
    } catch {
      ws.close(4001, '未登录');
      return;
    }

    const user = await User.findByPk(userId, {
      attributes: ['id', 'nickname', 'avatar', 'battleChips'],
    });
    if (!user) {
      ws.close(4002, '角色不存在');
      return;
    }

    let chips = user.battleChips ?? 1000;
    if (chips < CHIPS_JOIN_MIN) {
      chips = await grantDailyRelief(userId);
    }

    const ctx: Ctx = { userId, roomId: null };
    clients.set(ws, ctx);
    send(ws, { t: 'auth_ok', userId, chips });

    // 连接即带 roomId → 直接进房（重连也走这里）
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
      // 同一账号同时只在一桌
      for (const other of allRooms()) {
        if (other.id !== room.id && other.members.has(userId)) {
          handleLeave(other, userId);
        }
      }
      let member: Member;
      try {
        member = joinRoom(room, { userId, nickname: user.nickname, avatar: user.avatar, chips });
      } catch {
        send(ws, { t: 'error', message: '进入房间失败' });
        return;
      }
      member.ws = ws;
      ctx.roomId = room.id;
      send(ws, {
        t: 'joined',
        yourSeat: member.seat,
        gameTitle: handler.title,
        ...snapshotFor(room, member),
      });
      broadcast(room, { t: 'member_update', members: memberList(room) }, ws);
    }

    // ─── 消息处理 ───────────────────
    ws.on('message', (raw: Buffer) => {
      let msg: Record<string, unknown>;
      try {
        const parsed = JSON.parse(raw.toString());
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          send(ws, { t: 'error', message: '消息格式错误：需为 JSON 对象' });
          return;
        }
        msg = parsed;
      } catch {
        send(ws, { t: 'error', message: '消息解析失败：非有效 JSON' });
        return;
      }
      if (typeof msg.t !== 'string' || msg.t.length === 0) {
        send(ws, { t: 'error', message: '消息类型 (t) 缺失或无效' });
        return;
      }

      const currentCtx = clients.get(ws);
      if (!currentCtx) return;
      const room = currentCtx.roomId ? getRoom(currentCtx.roomId) : undefined;
      if (!room) {
        if (msg.t !== 'ping') send(ws, { t: 'error', message: '你还没有进入房间' });
        return;
      }
      const me = room.members.get(currentCtx.userId);
      if (!me) return;

      // 非房间级消息需确认为该游戏已知动作
      if (!isKnownRoomAction(msg.t)) {
        const handler = getHandler(room.gameType);
        if (handler.validActions && !handler.validActions.has(msg.t)) {
          send(ws, { t: 'error', message: `未知的游戏动作: ${msg.t}` });
          return;
        }
      }

      dispatchMessage(ws, room, me, currentCtx.userId, msg, (newRoomId) => {
        currentCtx.roomId = newRoomId;
      });
    });

    // ─── 断线处理：保留 60s 等重连 ───────────────────
    ws.on('close', () => {
      const closedCtx = clients.get(ws);
      clients.delete(ws);
      if (!closedCtx?.roomId) return;
      const room = getRoom(closedCtx.roomId);
      if (!room) return;
      const me = room.members.get(closedCtx.userId);
      if (!me) return;
      // 同账号新连接已接管时，旧连接关闭不能抹掉新连接
      if (me.ws && me.ws !== ws) return;

      me.online = false;
      me.ws = null;
      me.offlineAt = Date.now();
      broadcast(room, { t: 'member_update', members: memberList(room) });

      try {
        getHandler(room.gameType).onMemberOffline?.(room, me);
      } catch (err) {
        logError(
          'ws',
          `${room.gameType} offline 处理抛错: ${err instanceof Error ? err.stack : String(err)}`
        );
      }

      const timer = setTimeout(() => {
        const r = getRoom(room.id);
        const m = r?.members.get(closedCtx.userId);
        if (r && m && !m.online) {
          handleLeave(r, closedCtx.userId);
          if (getRoom(room.id)) broadcastSnapshot(r);
        }
      }, 60_000);
      timer.unref?.();
    });

    ws.on('error', (err) => {
      logError('ws', `WebSocket 连接错误: ${err.message}`);
    });
  });

  // 定期清理：空闲房间 + 过期语音
  setInterval(
    () => {
      try {
        sweepIdle();
      } catch (err) {
        logError('ws', `房间清理失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    5 * 60 * 1000
  ).unref();
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
