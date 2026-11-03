// 通信工具：WebSocket 消息发送、广播、快照
import { WebSocket } from 'ws';
import { getHandler } from './games/registry';
import { memberList, type Room, type Member } from './roomManager';

export const send = (ws: WebSocket, obj: Record<string, unknown>): void => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
};

export const broadcast = (room: Room, msg: Record<string, unknown>, exceptWs?: WebSocket): void => {
  for (const m of room.members.values()) {
    if (m.ws && m.ws !== exceptWs) send(m.ws, msg);
  }
};

/** 快照：game 段按观看者序列化（私发信息的地基） */
export const snapshotFor = (room: Room, viewer: Member): Record<string, unknown> => ({
  roomId: room.id,
  gameType: room.gameType,
  hostUserId: room.hostUserId,
  phase: room.phase,
  members: memberList(room),
  game: getHandler(room.gameType).serializeFor(room, viewer),
  chat: room.chat.slice(-50),
});

export const broadcastSnapshot = (room: Room, exceptWs?: WebSocket): void => {
  for (const m of room.members.values()) {
    if (m.ws && m.ws !== exceptWs) send(m.ws, { t: 'snapshot', ...snapshotFor(room, m) });
  }
};
