// 房间事件总线：游戏 handler 的定时器回调等异步场景需要向房间广播时使用
// wsServer 初始化时注册实现，handler 只依赖本模块，避免循环依赖
import type { Room } from './roomManager';

export interface RoomBus {
  broadcast(room: Room, msg: Record<string, unknown>, exceptUserId?: number): void;
  sendToUser(room: Room, userId: number, msg: Record<string, unknown>): void;
}

let bus: RoomBus | null = null;

export const setRoomBus = (b: RoomBus): void => {
  bus = b;
};

export const getRoomBus = (): RoomBus => {
  if (!bus) throw new Error('room bus 尚未初始化');
  return bus;
};
