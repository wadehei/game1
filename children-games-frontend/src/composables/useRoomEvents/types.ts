/**
 * useRoomEvents - 共享类型定义
 */
import type { Ref } from 'vue';
import type { MemberInfo, ChatItem, VoiceItem, S2CSnapshot } from '@children-games/shared';
import type { GameState, GameEvents, TypedWsLike, TypedRoomEventContext } from '../wsTypes';

export type RoomEventContext = TypedRoomEventContext;

export type WsLike = TypedWsLike;

/** 游戏事件注册函数签名 */
export type GameEventRegistrar = (ws: WsLike, ctx: RoomEventContext) => void;
