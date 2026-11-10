// 游戏生命周期：开局、终局、重开、积分结算
import { getHandler } from './games/registry';
import { clearRoomTimers, type Room } from './roomManager';
import { logError } from '../utils/logger';
import { settleRankingChips } from '../services/battleChips';
import { REMATCH_AUTO_SECONDS } from '../config/constants';

/** 牌类（blackjack/zjh/ddz）每手自行实时结算积分，game_over 时不再发排名分 */
const CHIP_TABLE_GAMES = new Set(['blackjack', 'zjh', 'ddz']);

/** 再来一局表决超时自动重开（未表态视为同意）；0=关闭 */
export const REMATCH_AUTO_MS =
  Math.max(0, Number(process.env.REMATCH_AUTO_SECONDS ?? REMATCH_AUTO_SECONDS)) * 1000;

type BusBroadcastFn = (room: Room, msg: Record<string, unknown>, exceptUserId?: number) => void;
type BusSendToUserFn = (room: Room, userId: number, msg: Record<string, unknown>) => void;
type BroadcastFn = (
  room: Room,
  msg: Record<string, unknown>,
  exceptWs?: import('ws').WebSocket
) => void;

export interface GameFlowDeps {
  busBroadcast: BusBroadcastFn;
  busSendToUser: BusSendToUserFn;
  broadcast: BroadcastFn;
}

/** 局终积分结算：拦截 game_over，一处覆盖所有游戏的结束路径 */
export const settleGameChips = (room: Room, winnerSeatFromMsg: number): void => {
  if (room.chipSettled) return;
  room.chipSettled = true;
  if (CHIP_TABLE_GAMES.has(room.gameType)) return;
  const careerOn = (room.config as { career?: boolean } | undefined)?.career !== false;
  const ranking: Array<{ userId: number }> = [];
  const game = (room.game || {}) as { ranking?: Array<{ userId: number }> };
  if (Array.isArray(game.ranking) && game.ranking.length) {
    for (const r of game.ranking) ranking.push({ userId: r.userId });
  } else {
    const seated = [...room.members.values()]
      .filter((m) => m.seat >= 0)
      .sort((a, b) => a.seat - b.seat);
    const winner =
      winnerSeatFromMsg >= 0 ? seated.find((m) => m.seat === winnerSeatFromMsg) : undefined;
    if (winner) ranking.push({ userId: winner.userId });
    for (const m of seated) {
      if (!winner || m.userId !== winner.userId) ranking.push({ userId: m.userId });
    }
  }
  if (ranking.length) void settleRankingChips(room.gameType, ranking, careerOn);
};

export const startGame = (room: Room, deps: GameFlowDeps): void => {
  room.phase = 'playing';
  room.chipSettled = false;
  const handler = getHandler(room.gameType);
  for (const m of room.members.values()) {
    m.ready = false;
    m.rematch = false;
  }
  try {
    const result = handler.start?.(room);
    if (result?.broadcast) result.broadcast.forEach((msg) => deps.busBroadcast(room, msg));
    if (result?.toMember)
      result.toMember.forEach(({ userId, msg }) => deps.busSendToUser(room, userId, msg));
    if (result?.error) logError('ws', `${room.gameType} start 异常: ${result.error}`);
  } catch (err) {
    logError(
      'ws',
      `${room.gameType} start 抛错: ${err instanceof Error ? err.stack : String(err)}`
    );
    logError(
      'server',
      `${room.gameType} start 抛错: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  deps.broadcast(room, { t: 'game_start', phase: room.phase });
};

export const endGame = (
  room: Room,
  winnerSeat: number,
  reason: string,
  deps: GameFlowDeps
): void => {
  room.phase = 'ended';
  clearRoomTimers(room);
  deps.busBroadcast(room, { t: 'game_over', winnerSeat, reason });
};

/** 通用重开：重置游戏状态，必要时交换座位 */
export const restartGame = (room: Room, deps: GameFlowDeps): void => {
  const handler = getHandler(room.gameType);
  if (handler.rematchSwapSeats) {
    for (const m of room.members.values()) {
      if (m.seat === 0) m.seat = 1;
      else if (m.seat === 1) m.seat = 0;
    }
  }
  room.game = handler.create();
  room.phase = 'playing';
  room.chipSettled = false;
  for (const m of room.members.values()) {
    m.ready = false;
    m.rematch = false;
  }
  const result = handler.start?.(room);
  if (result?.broadcast) result.broadcast.forEach((msg) => deps.busBroadcast(room, msg));
  if (result?.toMember)
    result.toMember.forEach(({ userId, msg }) => deps.busSendToUser(room, userId, msg));
  deps.broadcast(room, { t: 'game_restart', phase: room.phase });
};
