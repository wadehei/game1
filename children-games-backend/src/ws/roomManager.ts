// 房间管理：纯内存实现。房间解散（人走光/超时/房主解散）即整对象销毁——聊天与语音随之清空，符合"不永久保留"的需求
import { getHandler } from './games/registry';
import type { GameType } from './games/types';

export type Phase = 'waiting' | 'playing' | 'ended';
export type Seat = 0 | 1 | -1; // -1=观战

export interface ChatMsg {
  userId: number;
  nickname: string;
  kind: 'text' | 'emoji' | 'quick';
  content: string;
  ts: number;
}

export interface RoomVoice {
  data: Buffer;
  mime: string;
  userId: number;
  nickname: string;
  duration: number; // 秒
  ts: number;
}

export interface Member {
  userId: number;
  nickname: string;
  avatar: string;
  seat: Seat;
  ready: boolean;
  rematch: boolean;
  online: boolean;
  ws: any; // WebSocket；断线时置 null，成员保留以便重连
  offlineAt: number;
  lastChatAt?: number; // 聊天限流
  chips: number; // 进房时的账号积分快照（座位格展示；牌类对局以 handler 内的桌面积分为准）
}

export interface Room {
  id: string;
  gameType: GameType;
  hostUserId: number;
  members: Map<number, Member>;
  phase: Phase;
  game: any; // 由对应 GameHandler 创建与管理
  config: any; // 建房配置（handler 白名单校验后存入，对局期间不可改）
  chat: ChatMsg[]; // 上限 100 条，环形截断
  voices: Map<string, RoomVoice>;
  timers: NodeJS.Timeout[]; // 游戏定时器（题目推进/回合倒计时等），解散时统一清除
  chipSettled?: boolean; // 本局积分是否已结算（防 game_over 重复发放；rematch 时重置）
  createdAt: number;
  lastActiveAt: number;
}

export const ROOM_IDLE_MS = 2 * 60 * 60 * 1000; // 2小时无活动自动解散
export const VOICE_TTL_MS = 60 * 60 * 1000; // 语音最多留存1小时（房间不散也会过期）
export const MAX_MEMBERS = 8;

const rooms = new Map<string, Room>();

export const getRoom = (id: string): Room | undefined => rooms.get(id);

export const allRooms = (): Iterable<Room> => rooms.values();

export const roomCount = (): number => rooms.size;

export const createRoom = (
  user: { userId: number; nickname: string; avatar: string },
  gameType: GameType,
  config?: any
): Room => {
  let id: string;
  do {
    id = String(1000 + Math.floor(Math.random() * 9000));
  } while (rooms.has(id));

  const room: Room = {
    id,
    gameType,
    hostUserId: user.userId,
    members: new Map(),
    phase: 'waiting',
    game: getHandler(gameType).create(),
    config: config || {},
    chat: [],
    voices: new Map(),
    timers: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };
  rooms.set(id, room);
  return room;
};

export const joinRoom = (
  room: Room,
  user: { userId: number; nickname: string; avatar: string; chips?: number }
): Member => {
  const existing = room.members.get(user.userId);
  if (existing) {
    // 重连：恢复在线（顺带刷新积分快照）
    existing.online = true;
    if (typeof user.chips === 'number') existing.chips = user.chips;
    room.lastActiveAt = Date.now();
    return existing;
  }
  const taken = new Set([...room.members.values()].map((m) => m.seat));
  const maxSeats = getHandler(room.gameType).maxPlayers;
  // 对局/终局阶段加入一律观战（市面标准：本局已开始不下场，下一局可入座）
  let seat: Seat = -1;
  if (room.phase === 'waiting') {
    for (let i = 0; i < maxSeats; i += 1) {
      if (!taken.has(i as Seat)) {
        seat = i as Seat;
        break;
      }
    }
  }
  const member: Member = {
    userId: user.userId,
    nickname: user.nickname,
    avatar: user.avatar,
    seat,
    ready: false,
    rematch: false,
    online: true,
    ws: null,
    offlineAt: 0,
    chips: typeof user.chips === 'number' ? user.chips : 1000,
  };
  room.members.set(user.userId, member);
  room.lastActiveAt = Date.now();
  return member;
};

/** 成员移除；房间空了返回 'empty'，对局中玩家退出返回 'resign'（由调用方判负） */
export const removeMember = (room: Room, userId: number): 'empty' | 'resign' | 'ok' => {
  const m = room.members.get(userId);
  if (!m) return 'ok';
  room.members.delete(userId);
  room.lastActiveAt = Date.now();

  if (room.members.size === 0) return 'empty';
  if (room.hostUserId === userId) {
    // 房主走了，转移给最早加入的成员
    const next = room.members.values().next().value;
    if (next) room.hostUserId = next.userId;
  }
  if (m.seat >= 0 && room.phase === 'playing') return 'resign';
  return 'ok';
};

export const disbandRoom = (room: Room): void => {
  rooms.delete(room.id);
  room.timers.forEach(clearTimeout);
  room.timers = [];
  room.chat = [];
  room.voices.clear();
  room.members.clear();
};

/** 游戏定时器登记：解散房间时统一清除，防止销毁后仍触发 */
export const addTimer = (room: Room, timer: NodeJS.Timeout): void => {
  room.timers.push(timer);
  timer.unref?.();
};

export const clearRoomTimers = (room: Room): void => {
  room.timers.forEach(clearTimeout);
  room.timers = [];
};

export const TOTAL_MEMBER_LIMIT = 12; // 成员总数上限（含观战）

export const addChat = (room: Room, msg: ChatMsg): void => {
  room.chat.push(msg);
  if (room.chat.length > 100) room.chat.splice(0, room.chat.length - 100);
  room.lastActiveAt = Date.now();
};

export const storeVoice = (room: Room, voice: RoomVoice, id: string): void => {
  room.voices.set(id, voice);
  room.lastActiveAt = Date.now();
};

export const getVoice = (room: Room, id: string): RoomVoice | undefined => room.voices.get(id);

/** 给快照用的精简成员列表 */
export const memberList = (room: Room) =>
  [...room.members.values()].map((m) => ({
    userId: m.userId,
    nickname: m.nickname,
    avatar: m.avatar,
    seat: m.seat,
    ready: m.ready,
    online: m.online,
    chips: m.chips,
  }));

export const isHost = (room: Room, userId: number): boolean => room.hostUserId === userId;

/** 周期清理：解散空闲超时房间、清过期语音。返回解散的房间数 */
export const sweepIdle = (): number => {
  const now = Date.now();
  let swept = 0;
  for (const room of rooms.values()) {
    for (const [id, v] of room.voices) {
      if (now - v.ts > VOICE_TTL_MS) room.voices.delete(id);
    }
    if (now - room.lastActiveAt > ROOM_IDLE_MS) {
      rooms.delete(room.id);
      swept += 1;
    }
  }
  return swept;
};
