// 五子棋 GameHandler：包装 ../gomoku.ts 纯逻辑，行为与一期完全一致
import type { Room, Member } from '../roomManager';
import type { ActionResult, GameHandler } from './types';
import { createGomoku, placeStone, BLACK, WHITE, type GomokuState } from '../gomoku';

const colorOf = (seat: number): number => (seat === 0 ? BLACK : WHITE);

export const gomokuHandler: GameHandler<GomokuState> = {
  type: 'gomoku',
  title: '五子棋',
  emoji: '⚫',
  desc: '15路棋盘，黑棋先手，五连成线获胜',
  minPlayers: 2,
  maxPlayers: 2,
  allowSpectators: true,
  rematchSwapSeats: true,

  create: () => createGomoku(),

  onAction(room: Room, member: Member, action: string, payload: any): ActionResult {
    const seat = member.seat;

    if (action === 'move') {
      if (room.phase !== 'playing' || seat < 0) return { error: '当前不能落子' };
      const color = colorOf(seat);
      const x = Number(payload?.x);
      const y = Number(payload?.y);
      const err = placeStone(room.game, color, x, y);
      if (err) return { error: err };

      const broadcast: Array<Record<string, unknown>> = [
        {
          t: 'move',
          x,
          y,
          color,
          userId: member.userId,
          turn: room.game.turn,
          lastMove: room.game.lastMove,
          winner: room.game.winner,
          winLine: room.game.winLine,
        },
      ];

      let ended: ActionResult['ended'] = null;
      if (room.game.winner !== 0) {
        ended = {
          winnerSeat: room.game.winner === 1 ? 0 : room.game.winner === 2 ? 1 : -1,
          reason: room.game.winner === 3 ? '棋盘已满' : '五连成线',
        };
      }
      return { broadcast, ended };
    }

    if (action === 'resign') {
      if (room.phase !== 'playing' || seat < 0) return { error: '当前无法认输' };
      return { ended: { winnerSeat: seat === 0 ? 1 : 0, reason: '对方认输' } };
    }

    return { error: '未知的游戏操作' };
  },

  onPlayerQuit(room: Room, member: Member): ActionResult | void {
    if (room.phase !== 'playing' || member.seat < 0) return;
    return { ended: { winnerSeat: member.seat === 0 ? 1 : 0, reason: '对方退出了对局' } };
  },

  serializeFor(room: Room, _viewer: Member): Record<string, unknown> {
    const g = room.game;
    return {
      board: g.board,
      turn: g.turn,
      winner: g.winner,
      winLine: g.winLine,
      lastMove: g.lastMove,
    };
  },
};
