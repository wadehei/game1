/**
 * useRoomEvents - 五子棋事件处理
 */
import { soundManager } from '@/utils/sound';
import type { RoomEventContext, WsLike } from './types';
import type { GomokuGameState, GomokuMoveEvent } from '../wsTypes';

export function registerGomoku(ws: WsLike, ctx: RoomEventContext) {
  const { board, game, gameEvents } = ctx;

  ws.on('move', (m: GomokuMoveEvent) => {
    if (board.value[m.y]) board.value[m.y][m.x] = m.color;
    if (game.value && 'turn' in game.value) {
      (game.value as GomokuGameState).turn = m.turn;
      (game.value as GomokuGameState).lastMove = m.lastMove;
      if (m.winner) {
        (game.value as GomokuGameState).winner = m.winner;
        (game.value as GomokuGameState).winLine = m.winLine || [];
      }
    }
    soundManager.playClick();
  });
}
