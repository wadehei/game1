// 游戏 Handler 公共辅助函数
// 抽取自 blackjack.ts, zjh.ts, uno.ts, draw.ts, spy.ts 的重复逻辑

import { addTimer } from '../roomManager';
import type { Room, Member } from '../roomManager';
import { getRoomBus } from '../bus';
import { writeCareerRecords } from '../../services/battleChips';

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

/**
 * 按座位号找已就座成员（无则 undefined）
 */
export function seatedAt(room: Room, seat: number): Member | undefined {
  return getSeatedPlayers(room).find((m) => m.seat === seat);
}

// ─── 牌类共享（blackjack / zjh）────────────────────────────
// 两款积分牌类游戏的同构块：积分快照、每手流水、终局收尾、序列化视图。
// 规则差异（庄位轮转/下注校验/结算引擎）不入此文件，勿过度抽象。

/** 局终排名条目（chips 类对战统一形状） */
export interface ChipRankingEntry {
  userId: number;
  nickname: string;
  chips: number;
  delta: number;
  seat: number;
}

/** 每手投注流水的公共字段（zjh: betTotal/ended；blackjack: stake/doubled/outcome 各自扩展） */
export interface RoundLogEntry {
  round: number;
  delta: number | null;
}

/** 追加一条本手流水 */
export function appendRoundLog<T extends RoundLogEntry>(
  log: Map<number, T[]>,
  userId: number,
  entry: T
): void {
  const arr = log.get(userId) || [];
  arr.push(entry);
  log.set(userId, arr);
}

/** 找本手流水条目（每手仅一条；无则 null） */
export function findRoundLog<T extends RoundLogEntry>(
  log: Map<number, T[]>,
  userId: number,
  round: number
): T | null {
  return (log.get(userId) || []).find((e) => e.round === round) || null;
}

/** 删除本手流水条目（退款路径）；onlyPending=true 时只删未结算（delta===null）的 */
export function dropRoundLog<T extends RoundLogEntry>(
  log: Map<number, T[]>,
  userId: number,
  round: number,
  onlyPending: boolean
): boolean {
  const arr = log.get(userId);
  if (!arr) return false;
  const idx = arr.findIndex((e) => e.round === round && (!onlyPending || e.delta === null));
  if (idx < 0) return false;
  arr.splice(idx, 1);
  return true;
}

/** 开局积分快照：chips 起步复制自进房时的账号积分，initialChips 留作终局 delta 依据 */
export function initChipSnapshots<
  S extends { chips: Map<number, number>; initialChips: Map<number, number> },
>(st: S, players: Member[]): void {
  st.chips = new Map();
  st.initialChips = new Map();
  for (const m of players) {
    st.chips.set(m.userId, m.chips);
    st.initialChips.set(m.userId, m.chips);
  }
}

/** 挂起状态定时器（清旧 + 登记到房间，销毁时统一清理） */
export function armStateTimer<T extends { timer: NodeJS.Timeout | null }>(
  room: Room,
  state: T,
  callback: () => void,
  delayMs: number
): void {
  clearGameTimer(state);
  const timer = setTimeout(callback, delayMs);
  state.timer = timer;
  addTimer(room, timer);
}

/**
 * 下一手前置守卫（nextHand 共用）：打满手数或有积分玩家不足两家 → 终局
 * 返回 finish=true 时 reason 与两游戏既有文案一致
 */
export function nextHandGate(
  room: Room,
  st: { round: number; totalRounds: number; chips: Map<number, number> },
  isFunded: (m: Member) => boolean
): { finish: boolean; reason: string } {
  const funded = getSeatedPlayers(room).filter(isFunded);
  if (st.round >= st.totalRounds || funded.length <= 1) {
    return { finish: true, reason: funded.length <= 1 ? '其他玩家积分已耗尽' : '手数已打满' };
  }
  return { finish: false, reason: '' };
}

/**
 * 局终收尾（finish 共用）：排名 → <game>_final + game_over 广播 → 生涯局流水
 * room.phase = 'ended' 由本函数置位；handPhase 留给各 handler 自己收
 */
export function finishChipGame<
  S extends {
    timer: NodeJS.Timeout | null;
    chips: Map<number, number>;
    initialChips: Map<number, number>;
    ranking: ChipRankingEntry[] | null;
    endReason: string;
    config: { career: boolean };
  },
>(room: Room, st: S, gameType: string, finalEvent: string, reason: string): void {
  clearGameTimer(st);
  room.phase = 'ended';
  st.ranking = buildRanking(getSeatedPlayers(room), (m) => ({
    chips: st.chips.get(m.userId) || 0,
    delta: (st.chips.get(m.userId) || 0) - (st.initialChips.get(m.userId) || 0),
  })) as ChipRankingEntry[];
  const bus = getRoomBus();
  bus.broadcast(room, { t: finalEvent, ranking: st.ranking, reason } as Parameters<
    typeof bus.broadcast
  >[1]);
  bus.broadcast(room, { t: 'game_over', winnerSeat: st.ranking[0]?.seat ?? -1, reason });
  // 局终写生涯（每手已实时入账，这里只记局流水）
  if (st.config.career) {
    void writeCareerRecords(
      gameType,
      st.ranking.map((r, i) => ({
        userId: r.userId,
        result: `rank:${i + 1}`,
        chipsDelta: r.delta,
        chipsAfter: r.chips,
      }))
    );
  }
}

/** serializeFor 的 chips 视图：局内有积分快照用快照，否则回落成员携带值 */
export function chipsView(
  chips: Map<number, number>,
  room: Room
): Array<{ userId: number; chips: number }> {
  return chips.size
    ? [...chips].map(([userId, c]) => ({ userId, chips: c }))
    : [...room.members.values()]
        .filter((m) => m.seat >= 0)
        .map((m) => ({ userId: m.userId, chips: m.chips }));
}

/** betLedger 视图：流水展开并附 userId（投注明细全员可见） */
export function betLedgerView<T extends RoundLogEntry>(
  betLog: Map<number, T[]>
): Array<T & { userId: number }> {
  return [...betLog].flatMap(([uid, entries]) => entries.map((e) => ({ ...e, userId: uid })));
}
