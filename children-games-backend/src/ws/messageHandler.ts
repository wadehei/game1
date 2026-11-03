// 消息分发：根据消息类型路由到对应处理逻辑
import { getHandler } from './games/registry';
import {
  addChat,
  disbandRoom,
  getRoom,
  isHost,
  memberList,
  removeMember,
  addTimer,
  type Room,
  type ChatMsg,
  type Member,
} from './roomManager';
import { logError } from '../utils/logger';
import { send, broadcast, broadcastSnapshot } from './messaging';
import { startGame, endGame, restartGame, REMATCH_AUTO_MS, type GameFlowDeps } from './gameFlow';
import { filterChatMessage } from '../utils/contentFilter';
import type WebSocket from 'ws';

/** 已知房间级消息类型白名单（游戏动作由各 handler 自行校验） */
const KNOWN_ROOM_ACTIONS = new Set(['ping', 'ready', 'rematch', 'chat', 'leave', 'disband']);

export interface MessageHandlerDeps extends GameFlowDeps {
  handleLeave: (room: Room, userId: number) => void;
}

let deps: MessageHandlerDeps | null = null;

export const setMessageHandlerDeps = (d: MessageHandlerDeps): void => {
  deps = d;
};

const getDeps = (): MessageHandlerDeps => {
  if (!deps) throw new Error('messageHandler deps not initialized');
  return deps;
};

export const handleLeave = (room: Room, userId: number): void => {
  const quitter = room.members.get(userId);
  const result = removeMember(room, userId);
  if (result === 'empty') {
    disbandRoom(room);
    return;
  }
  if (result === 'resign' && quitter) {
    const quitResult = getHandler(room.gameType).onPlayerQuit?.(room, quitter);
    if (quitResult?.ended)
      endGame(room, quitResult.ended.winnerSeat, quitResult.ended.reason, getDeps());
  }
  broadcast(room, { t: 'member_left', userId });
  broadcastSnapshot(room);
};

/** 检查消息是否为已知房间级动作 */
export const isKnownRoomAction = (t: string): boolean => KNOWN_ROOM_ACTIONS.has(t);

export const dispatchMessage = (
  ws: WebSocket,
  room: Room,
  me: Member,
  userId: number,
  msg: Record<string, unknown>,
  updateRoomId: (roomId: string | null) => void
): void => {
  const d = getDeps();
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
        startGame(room, d);
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
        restartGame(room, d);
        broadcastSnapshot(room);
        break;
      }
      broadcast(room, {
        t: 'rematch_vote',
        userIds: players.filter((m) => m.rematch).map((m) => m.userId),
      });
      if (REMATCH_AUTO_MS > 0) {
        broadcast(room, { t: 'rematch_deadline', deadline: Date.now() + REMATCH_AUTO_MS });
        const roomId = room.id;
        const autoTimer = setTimeout(() => {
          const currentRoom = getRoom(roomId);
          if (currentRoom && currentRoom.phase === 'ended') restartGame(currentRoom, d);
        }, REMATCH_AUTO_MS);
        addTimer(room, autoTimer);
      }
      broadcastSnapshot(room);
      break;
    }

    case 'chat': {
      const msgKind = msg.kind;
      const kind: 'text' | 'emoji' | 'quick' =
        msgKind === 'text' || msgKind === 'emoji' || msgKind === 'quick' ? msgKind : 'text';
      const rawContent = String(msg.content || '')
        .trim()
        .slice(0, 200);
      if (!rawContent) return;
      if (me.lastChatAt && Date.now() - me.lastChatAt < 300) return;

      // 文本消息需要内容过滤（emoji/快捷消息跳过）
      let content = rawContent;
      if (kind === 'text') {
        const filterResult = filterChatMessage(rawContent);
        if (!filterResult.passed) {
          send(ws, { t: 'error', message: '消息包含不当内容，请修改后发送' });
          return;
        }
        content = filterResult.filtered;
      }

      me.lastChatAt = Date.now();
      const chat: ChatMsg = {
        userId: me.userId,
        nickname: me.nickname,
        kind,
        content,
        ts: Date.now(),
      };
      addChat(room, chat);
      broadcast(room, { t: 'chat', ...chat });
      break;
    }

    case 'leave': {
      handleLeave(room, userId);
      updateRoomId(null);
      send(ws, { t: 'left' });
      break;
    }

    case 'disband': {
      if (!isHost(room, userId)) {
        send(ws, { t: 'error', message: '只有房主能解散房间' });
        return;
      }
      broadcast(room, { t: 'closed', reason: '房主解散了房间' });
      disbandRoom(room);
      break;
    }

    default: {
      const handler = getHandler(room.gameType);
      let result;
      try {
        result = handler.onAction(room, me, msg.t as string, msg);
      } catch (err) {
        logError(
          'ws',
          `${room.gameType} action 抛错: ${err instanceof Error ? err.stack : String(err)}`
        );
        send(ws, { t: 'error', message: '操作处理异常' });
        return;
      }
      if (result.error) {
        send(ws, { t: 'error', message: result.error });
        return;
      }
      if (result.broadcast) result.broadcast.forEach((m) => broadcast(room, m));
      if (result.toMember)
        result.toMember.forEach(({ userId: uid, msg: m }) => {
          const member = room.members.get(uid);
          if (member?.ws) send(member.ws, m);
        });
      if (result.ended) {
        endGame(room, result.ended.winnerSeat, result.ended.reason, d);
        broadcastSnapshot(room);
      }
      break;
    }
  }
};
