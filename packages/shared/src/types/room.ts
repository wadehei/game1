/**
 * 房间/对战相关类型定义
 */

import type { Seat } from './common';

/**
 * 房间成员信息
 */
export interface MemberInfo {
  userId: number;
  nickname: string;
  avatar: string;
  seat: Seat;
  ready: boolean;
  online: boolean;
  chips?: number;
}

/**
 * 聊天消息
 */
export interface ChatItem {
  userId: number;
  nickname: string;
  kind: 'text' | 'emoji' | 'quick';
  content: string;
  ts: number;
}

/**
 * 语音消息（前端视图）
 */
export interface VoiceItem {
  voiceId: string;
  userId: number;
  nickname: string;
  duration: number;
  ts: number;
}

/**
 * 语音消息（后端存储）
 */
export interface RoomVoice extends VoiceItem {
  data: Buffer;
  mime: string;
}

/**
 * 房间信息快照
 */
export interface RoomSnapshot {
  roomId: string;
  gameType: string;
  hostUserId: number;
  phase: 'waiting' | 'playing' | 'ended';
  members: MemberInfo[];
  game: Record<string, unknown>;
  chat: ChatItem[];
}
