/**
 * useRoomEvents - 房间事件注册入口
 *
 * 按游戏类型拆分为独立模块：
 * - common: 所有游戏共享的通用事件
 * - gomoku/quiz/draw/spy/uno/blackjack/zjh/tank/ddz: 各游戏专用事件
 */
import type { RoomEventContext, WsLike } from './types';
import { registerCommon } from './common';
import { registerGomoku } from './gomoku';
import { registerQuiz } from './quiz';
import { registerDraw } from './draw';
import { registerSpy } from './spy';
import { registerUno } from './uno';
import { registerBlackjack } from './blackjack';
import { registerZjh } from './zjh';
import { registerTank } from './tank';
import { registerDdz } from './ddz';

// 重新导出类型供外部使用
export type { RoomEventContext, WsLike } from './types';

/**
 * 房间事件 composable
 *
 * @param ws - WebSocket 连接
 * @param ctx - 房间事件上下文
 * @returns registerAll 函数，用于注册所有事件
 */
export const useRoomEvents = (ws: WsLike, ctx: RoomEventContext) => {
  const registerAll = () => {
    registerCommon(ws, ctx);
    registerGomoku(ws, ctx);
    registerQuiz(ws, ctx);
    registerDraw(ws, ctx);
    registerSpy(ws, ctx);
    registerUno(ws, ctx);
    registerBlackjack(ws, ctx);
    registerZjh(ws, ctx);
    registerTank(ws, ctx);
    registerDdz(ws, ctx);
  };

  return { registerAll };
};
