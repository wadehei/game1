// 游戏 Handler 公共辅助函数
// 抽取自 blackjack.ts, zjh.ts, uno.ts, draw.ts, spy.ts 的重复逻辑

import type { Room, Member } from '../roomManager';

/**
 * 获取已就座的玩家列表（按座位号排序）
 * 适用于 blackjack, zjh, uno, draw 等需要座位管理的游戏
 */
export function getSeatedPlayers(room: Room): Member[] {
  return [...room.members.values()].filter((m) => m.seat >= 0).sort((a, b) => a.seat - b.seat);
}

/**
 * 清理定时器
 * 适用于所有使用 setTimeout 的游戏状态机
 */
export function clearGameTimer<T extends { timer: NodeJS.Timeout | null }>(state: T): void {
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
}

/**
 * 设置定时器（带清理旧定时器）
 */
export function setGameTimer<T extends { timer: NodeJS.Timeout | null }>(
  state: T,
  callback: () => void,
  delayMs: number
): NodeJS.Timeout {
  clearGameTimer(state);
  const timer = setTimeout(callback, delayMs);
  state.timer = timer;
  return timer;
}

/**
 * 构建排名数组（通用）
 */
export interface RankingEntry {
  userId: number;
  nickname: string;
  seat: number;
  score?: number;
  chips?: number;
  delta?: number;
}

export function buildRanking(
  players: Member[],
  getStats: (member: Member) => { score?: number; chips?: number; delta?: number }
): RankingEntry[] {
  return players
    .map((m) => ({
      userId: m.userId,
      nickname: m.nickname,
      seat: m.seat,
      ...getStats(m),
    }))
    .sort((a, b) => {
      // 优先按 score 降序，无 score 时按 chips 降序
      const aScore = a.score ?? a.chips ?? 0;
      const bScore = b.score ?? b.chips ?? 0;
      return bScore - aScore;
    });
}

/**
 * 格式化座位信息（用于日志/调试）
 */
export function formatSeats(room: Room): string {
  return getSeatedPlayers(room)
    .map((m) => `[${m.seat}]${m.nickname}`)
    .join(' ');
}
