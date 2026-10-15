// 三张牌比大小 handler：发 3 张闷牌（look 才私发，防客户端偷看）、闷/看双轨注码、比牌/弃牌/强制开牌
// 积分每手实时落库；超时动作建房可选（弃牌/跟注）；特殊 235 建房开关
import type { Room, Member } from '../roomManager';
import { addTimer, clearRoomTimers, getRoom } from '../roomManager';
import type { ActionResult, GameHandler } from './types';
import { getRoomBus } from '../bus';
import { applyChipDelta, writeCareerRecords } from '../../services/battleChips';
import { cardLabel, type Card } from './blackjack/engine';
import { buildZjhDeck, compareZjh, handRank, typeName } from './zjh/engine';

const BET_SECONDS = Math.max(5, Number(process.env.ZJH_BET_SECONDS) || 25);
const ANTE = 10;
const RAISE_STEPS = [10, 20, 50];
const STAKE_CAP = 100;
const COMPARE_MIN_ROUND = 3; // 前 2 轮禁比牌（roundNo 从 1 起）
const FORCE_SHOWDOWN_ROUND = 6; // 第 6 轮结束强制开牌
const DEFAULT_ROUNDS = 15;
const NEXT_HAND_DELAY_MS = 4000; // 手间结算展示时长（前端有下一手倒计时）
const FORCE_FOLD_AFTER_TIMEOUTS = 3; // 连续超时自动跟注达到此次数 → 强制弃牌（防掉线挂机被放血）

export interface ZjhConfig {
  special235: boolean;
  timeoutFold: boolean;
  roundLimit: number;
  career: boolean;
  /** rotate=轮庄（默认） / winner=赢家坐庄（市面常见） */
  bankerMode: 'rotate' | 'winner';
  /** 前 N 轮强制闷牌（0=不限制） */
  mustBlindRounds: number;
}

interface ZjhPlayer {
  cards: Card[]; // 未看牌时为空（look/compare/showdown 时才从牌堆发出）
  seen: boolean;
  folded: boolean;
  allIn: boolean;
  betTotal: number;
  /** 连续超时自动跟注次数（手动操作即清零；达 FORCE_FOLD_AFTER_TIMEOUTS 强制弃牌） */
  timeoutCalls: number;
}

interface ZjhState {
  round: number;
  totalRounds: number;
  handPhase: 'betting' | 'showdown' | 'settle';
  deadline: number;
  dealerSeat: number;
  deck: Card[];
  players: Map<number, ZjhPlayer>;
  pot: number;
  stake: number;
  roundNo: number;
  turnSeat: number;
  chips: Map<number, number>;
  handStartChips: Map<number, number>;
  initialChips: Map<number, number>;
  timer: NodeJS.Timeout | null;
  ranking: Array<{ userId: number; nickname: string; chips: number; delta: number; seat: number }> | null;
  endReason: string;
  lastWinnerSeat: number | null; // winner 坐庄模式：本手赢家做下一手庄
  /** 个人下注流水（整局累计，serializeFor 只发本人）：每手一条，底注/跟注/比牌累加 betTotal，结算回填 delta/ended */
  betLog: Map<number, Array<{ round: number; betTotal: number; delta: number | null; ended: string | null }>>;
  config: ZjhConfig;
}

const seatPlayers = (room: Room): Member[] => [...room.members.values()].filter((m) => m.seat >= 0).sort((a, b) => a.seat - b.seat);
const aliveSeats = (room: Room, st: ZjhState): number[] =>
  [...st.players]
    .filter(([uid, p]) => !p.folded && room.members.has(uid))
    .map(([uid]) => room.members.get(uid)!.seat)
    .sort((a, b) => a - b);
/** 还能行动（未弃/未 allIn/有筹码）的座位 */
const activeSeats = (room: Room, st: ZjhState): number[] =>
  aliveSeats(room, st).filter((seat) => {
    const m = seatPlayers(room).find((x) => x.seat === seat);
    if (!m) return false;
    const p = st.players.get(m.userId)!;
    return !p.allIn && (st.chips.get(m.userId) || 0) > 0;
  });

const clearTimer = (st: ZjhState): void => {
  if (st.timer) clearTimeout(st.timer);
  st.timer = null;
};

/** 本手流水条目（无则 null） */
const handLogEntry = (st: ZjhState, uid: number) => (st.betLog.get(uid) || []).find((e) => e.round === st.round) || null;

/** 本手结算：按玩家回填每手净输赢与结束方式 */
const markHandSettled = (st: ZjhState, winnerUid: number, winAmount: number): void => {
  for (const [uid, p] of st.players) {
    const entry = handLogEntry(st, uid);
    if (!entry) continue;
    entry.delta = (uid === winnerUid ? winAmount : 0) - p.betTotal;
    entry.ended = uid === winnerUid ? 'win' : p.folded ? 'fold' : 'showdown';
  }
};

/** 移除本手流水条目（退款路径用） */
const dropHandLog = (st: ZjhState, uid: number): void => {
  const log = st.betLog.get(uid);
  if (!log) return;
  const idx = log.findIndex((e) => e.round === st.round);
  if (idx >= 0) log.splice(idx, 1);
};

const phasePayload = (room: Room, st: ZjhState) => ({
  t: 'zjh_phase',
  round: st.round,
  totalRounds: st.totalRounds,
  phase: st.handPhase,
  dealerSeat: st.dealerSeat,
  pot: st.pot,
  stake: st.stake,
  roundNo: st.roundNo,
  turnSeat: st.handPhase === 'betting' ? st.turnSeat : -1,
  deadline: st.deadline,
  compareMinRound: COMPARE_MIN_ROUND,
  aliveCount: aliveSeats(room, st).length,
  entrants: [...st.players].filter(([, p]) => !p.folded).map(([uid]) => uid),
  chips: [...st.chips].map(([userId, chips]) => ({ userId, chips })),
  raiseSteps: RAISE_STEPS,
  stakeCap: STAKE_CAP,
});

/** 从牌堆给玩家发 3 张（look / compare / showdown 时才发，防未看牌客户端被偷） */
const dealTo = (st: ZjhState, uid: number): Card[] => {
  const p = st.players.get(uid)!;
  if (!p.cards.length) p.cards = [st.deck.pop()!, st.deck.pop()!, st.deck.pop()!];
  return p.cards;
};

const armTurnTimer = (room: Room, st: ZjhState): void => {
  clearTimer(st);
  st.deadline = Date.now() + BET_SECONDS * 1000;
  const seat = st.turnSeat;
  const timer = setTimeout(() => {
    const r = getRoom(room.id);
    if (!r) return;
    const s = r.game as ZjhState;
    if (s.handPhase !== 'betting' || s.turnSeat !== seat) return;
    const m = seatPlayers(r).find((x) => x.seat === seat);
    if (!m) return;
    if (s.config.timeoutFold) {
      doFold(r, m, true);
    } else {
      const p = s.players.get(m.userId);
      if (p) p.timeoutCalls += 1;
      if (p && p.timeoutCalls >= FORCE_FOLD_AFTER_TIMEOUTS) {
        doFold(r, m, true); // 连续超时太多次：强制弃牌，防止掉线挂机一直自动跟注放血
      } else {
        doCall(r, m, true);
      }
    }
  }, BET_SECONDS * 1000);
  st.timer = timer;
  addTimer(room, timer);
};

const startHand = (room: Room): void => {
  const st = room.game as ZjhState;
  clearTimer(st);
  st.handPhase = 'betting';
  st.deck = buildZjhDeck();
  st.pot = 0;
  st.stake = ANTE;
  st.roundNo = 1;
  st.players = new Map();
  st.handStartChips = new Map();

  const players = seatPlayers(room);
  for (const m of players) {
    st.handStartChips.set(m.userId, st.chips.get(m.userId) || 0);
    const chips = st.chips.get(m.userId) || 0;
    if (chips < ANTE) {
      // 连底注都付不起：本手观战（保留座位）
      st.players.set(m.userId, { cards: [], seen: false, folded: true, allIn: false, betTotal: 0, timeoutCalls: 0 });
      continue;
    }
    st.chips.set(m.userId, chips - ANTE);
    st.pot += ANTE;
    st.players.set(m.userId, { cards: [], seen: false, folded: false, allIn: false, betTotal: ANTE, timeoutCalls: 0 });
    const log = st.betLog.get(m.userId) || [];
    log.push({ round: st.round, betTotal: ANTE, delta: null, ended: null });
    st.betLog.set(m.userId, log);
  }
  getRoomBus().broadcast(room, phasePayload(room, st));
  advanceTurn(room, st, true);
};

const advanceTurn = (room: Room, st: ZjhState, first: boolean): void => {
  // 牌局已分：只剩一家 → 免摊牌赢池
  const alive = aliveSeats(room, st);
  if (alive.length <= 1) {
    winByFold(room, alive[0]);
    return;
  }
  const active = activeSeats(room, st);
  if (active.length <= 1) {
    // 只剩一家有行动力（其余 allIn）：直接摊牌
    showdown(room);
    return;
  }

  let nextSeat: number;
  if (first) {
    const start = active.filter((s) => s > st.dealerSeat);
    nextSeat = start[0] ?? active[0];
  } else {
    const after = active.filter((s) => s > st.turnSeat);
    nextSeat = after[0] ?? active[0];
    if (nextSeat <= st.turnSeat) st.roundNo += 1; // 绕回一圈，轮数+1
  }
  // 轮数用尽强制开牌
  if (st.roundNo > FORCE_SHOWDOWN_ROUND) {
    showdown(room);
    return;
  }
  st.turnSeat = nextSeat;
  getRoomBus().broadcast(room, phasePayload(room, st));
  armTurnTimer(room, st);
};

const doCall = (room: Room, member: Member, auto = false): void => {
  const st = room.game as ZjhState;
  const p = st.players.get(member.userId)!;
  if (!auto) p.timeoutCalls = 0; // 手动跟注清零连续超时计数
  const cost = p.seen ? st.stake * 2 : st.stake;
  const chips = st.chips.get(member.userId) || 0;
  const paid = Math.min(cost, chips);
  st.chips.set(member.userId, chips - paid);
  st.pot += paid;
  p.betTotal += paid;
  const entry = handLogEntry(st, member.userId);
  if (entry) entry.betTotal += paid;
  if (paid < cost) p.allIn = true;
  getRoomBus().broadcast(room, {
    t: 'zjh_action',
    userId: member.userId,
    nickname: member.nickname,
    action: auto ? 'timeout_call' : 'call',
    cost: paid,
    allIn: p.allIn,
    pot: st.pot,
    stake: st.stake,
  });
  advanceTurn(room, st, false);
};

const doFold = (room: Room, member: Member, auto = false): void => {
  const st = room.game as ZjhState;
  const p = st.players.get(member.userId);
  if (!p || p.folded) return;
  if (!auto) p.timeoutCalls = 0; // 手动弃牌清零连续超时计数
  p.folded = true;
  getRoomBus().broadcast(room, {
    t: 'zjh_action',
    userId: member.userId,
    nickname: member.nickname,
    action: auto ? 'timeout_fold' : 'fold',
    aliveCount: aliveSeats(room, st).length,
  });
  advanceTurn(room, st, false);
};

const doLook = (room: Room, member: Member): void => {
  const st = room.game as ZjhState;
  const p = st.players.get(member.userId)!;
  p.seen = true;
  p.timeoutCalls = 0; // 手动看牌清零连续超时计数
  const cards = dealTo(st, member.userId);
  getRoomBus().broadcast(room, { t: 'zjh_action', userId: member.userId, nickname: member.nickname, action: 'look' });
  // 点对点私发自己的牌（防偷看核心：未看牌者的牌不在任何广播/快照里）
  getRoomBus().sendToUser(room, member.userId, { t: 'zjh_your_cards', cards: cards.map(cardLabel), rank: typeName(handRank(cards)) });
};

const doCompare = (room: Room, me: Member, target: Member): void => {
  const st = room.game as ZjhState;
  const myP = st.players.get(me.userId)!;
  // 比牌费 = 自己跟注价的 2 倍（闷 2×单注 / 看 4×单注——看牌比闷牌贵一倍）
  const cost = myP.seen ? st.stake * 4 : st.stake * 2;
  const chips = st.chips.get(me.userId) || 0;
  if (chips < cost) return;
  myP.timeoutCalls = 0; // 手动比牌清零连续超时计数
  st.chips.set(me.userId, chips - cost);
  st.pot += cost;
  myP.betTotal += cost;
  const myEntry = handLogEntry(st, me.userId);
  if (myEntry) myEntry.betTotal += cost;
  myP.seen = true;
  const myCards = dealTo(st, me.userId);
  const oppCards = dealTo(st, target.userId);
  const win = compareZjh(myCards, oppCards, st.config.special235) > 0;
  const winner = win ? me : target;
  const loser = win ? target : me;
  st.players.get(loser.userId)!.folded = true;
  const bus = getRoomBus();
  bus.broadcast(room, {
    t: 'zjh_compare',
    from: me.userId,
    to: target.userId,
    winner: winner.userId,
    loser: loser.userId,
    pot: st.pot,
    aliveCount: aliveSeats(room, st).length,
  });
  bus.sendToUser(room, me.userId, {
    t: 'zjh_compare_cards',
    oppCards: oppCards.map(cardLabel),
    oppType: typeName(handRank(oppCards)),
    myCards: myCards.map(cardLabel),
    myType: typeName(handRank(myCards)),
    result: win ? 'win' : 'lose',
  });
  bus.sendToUser(room, target.userId, {
    t: 'zjh_compare_cards',
    oppCards: myCards.map(cardLabel),
    oppType: typeName(handRank(myCards)),
    myCards: oppCards.map(cardLabel),
    myType: typeName(handRank(oppCards)),
    result: win ? 'lose' : 'win',
  });
  advanceTurn(room, st, false);
};

const winByFold = (room: Room, seat: number | undefined): void => {
  const st = room.game as ZjhState;
  clearTimer(st);
  st.handPhase = 'settle';
  if (seat === undefined) {
    // 没有存活玩家（极端：全员弃/掉线）——池子按投入退回
    for (const [uid, p] of st.players) {
      st.chips.set(uid, (st.chips.get(uid) || 0) + p.betTotal);
      dropHandLog(st, uid);
    }
    st.pot = 0;
  } else {
    const m = seatPlayers(room).find((x) => x.seat === seat)!;
    const winAmount = st.pot;
    st.chips.set(m.userId, (st.chips.get(m.userId) || 0) + winAmount);
    st.pot = 0;
    st.lastWinnerSeat = seat;
    markHandSettled(st, m.userId, winAmount);
    const deltas = [...st.chips]
      .filter(([uid]) => st.handStartChips.has(uid))
      .map(([uid, chips]) => ({
        userId: uid,
        nickname: room.members.get(uid)?.nickname || `角色${uid}`,
        delta: chips - (st.handStartChips.get(uid) || 0),
        chips,
      }));
    for (const d of deltas) {
      if (d.delta) void applyChipDelta(d.userId, d.delta);
      const mm = room.members.get(d.userId);
      if (mm) mm.chips = d.chips;
    }
    getRoomBus().broadcast(room, {
      t: 'zjh_settle',
      round: st.round,
      winner: m.userId,
      winnerNickname: m.nickname,
      reason: 'others_folded',
      winAmount,
      reveals: null,
      deltas,
      nextDeadline: Date.now() + NEXT_HAND_DELAY_MS,
    });
  }
  const timer = setTimeout(() => nextHand(room, (room.game as ZjhState).round), NEXT_HAND_DELAY_MS);
  addTimer(room, timer);
};

const showdown = (room: Room): void => {
  const st = room.game as ZjhState;
  clearTimer(st);
  st.handPhase = 'showdown';
  const alive = aliveSeats(room, st);
  const reveals = alive.map((seat) => {
    const m = seatPlayers(room).find((x) => x.seat === seat)!;
    const cards = dealTo(st, m.userId);
    return { userId: m.userId, nickname: m.nickname, cards: cards.map(cardLabel), typeName: typeName(handRank(cards)) };
  });
  let winnerSeat = alive[0];
  for (let i = 1; i < alive.length; i += 1) {
    const a = st.players.get(seatPlayers(room).find((x) => x.seat === winnerSeat)!.userId)!;
    const b = st.players.get(seatPlayers(room).find((x) => x.seat === alive[i])!.userId)!;
    if (compareZjh(b.cards, a.cards, st.config.special235) > 0) winnerSeat = alive[i];
  }
  getRoomBus().broadcast(room, { t: 'zjh_showdown', reveals });
  const wm = seatPlayers(room).find((x) => x.seat === winnerSeat)!;
  settleHand(room, wm, 'showdown', reveals);
};

const settleHand = (
  room: Room,
  winner: Member,
  reason: 'others_folded' | 'showdown',
  reveals: Array<{ userId: number; nickname: string; cards: string[]; typeName: string }> | null
): void => {
  const st = room.game as ZjhState;
  st.handPhase = 'settle';
  const winAmount = st.pot;
  st.chips.set(winner.userId, (st.chips.get(winner.userId) || 0) + winAmount);
  st.pot = 0;
  st.lastWinnerSeat = winner.seat;
  markHandSettled(st, winner.userId, winAmount);
  const wm = room.members.get(winner.userId);
  if (wm) wm.chips = st.chips.get(winner.userId) || 0;

  const deltas = [...st.chips]
    .filter(([uid]) => st.handStartChips.has(uid))
    .map(([uid, chips]) => ({
      userId: uid,
      nickname: room.members.get(uid)?.nickname || `角色${uid}`,
      delta: chips - (st.handStartChips.get(uid) || 0),
      chips,
    }));
  for (const d of deltas) {
    if (d.delta) void applyChipDelta(d.userId, d.delta); // 每手实时入账
    const m = room.members.get(d.userId);
    if (m) m.chips = d.chips;
  }
  getRoomBus().broadcast(room, {
    t: 'zjh_settle',
    round: st.round,
    winner: winner.userId,
    winnerNickname: winner.nickname,
    reason,
    winAmount,
    reveals, // 弃牌胜不亮牌（null）
    deltas,
    nextDeadline: Date.now() + NEXT_HAND_DELAY_MS,
  });

  const timer = setTimeout(() => nextHand(room, (room.game as ZjhState).round), NEXT_HAND_DELAY_MS);
  addTimer(room, timer);
};

const nextHand = (room: Room, expectRound: number): void => {
  const r = getRoom(room.id);
  if (!r || r.phase !== 'playing') return;
  const st = r.game as ZjhState;
  if (st.round !== expectRound) return;
  clearTimer(st);
  const funded = seatPlayers(r).filter((m) => (st.chips.get(m.userId) || 0) >= ANTE);
  if (st.round >= st.totalRounds || funded.length <= 1) {
    finish(r, funded.length <= 1 ? '其他玩家积分已耗尽' : '手数已打满');
    return;
  }
  st.round += 1;
  const seats: number[] = funded.map((m) => m.seat);
  if (st.config.bankerMode === 'winner' && st.lastWinnerSeat !== null && seats.includes(st.lastWinnerSeat)) {
    st.dealerSeat = st.lastWinnerSeat; // 赢家坐庄
  } else {
    const idx = seats.indexOf(st.dealerSeat);
    st.dealerSeat = idx < 0 ? seats[0] : seats[(idx + 1) % seats.length]; // 轮庄
  }
  startHand(r);
};

const finish = (room: Room, reason: string): void => {
  const st = room.game as ZjhState;
  clearTimer(st);
  st.handPhase = 'settle';
  room.phase = 'ended';
  const ranking = seatPlayers(room)
    .map((m) => ({
      userId: m.userId,
      nickname: m.nickname,
      chips: st.chips.get(m.userId) || 0,
      delta: (st.chips.get(m.userId) || 0) - (st.initialChips.get(m.userId) || 0),
      seat: m.seat,
    }))
    .sort((a, b) => b.chips - a.chips);
  st.ranking = ranking;
  const bus = getRoomBus();
  bus.broadcast(room, { t: 'zjh_final', ranking, reason });
  bus.broadcast(room, { t: 'game_over', winnerSeat: ranking[0]?.seat ?? -1, reason });
  if (st.config.career) {
    void writeCareerRecords(
      'zjh',
      ranking.map((r2, i) => ({ userId: r2.userId, result: `rank:${i + 1}`, chipsDelta: r2.delta, chipsAfter: r2.chips }))
    );
  }
};

export const zjhHandler: GameHandler<ZjhState> = {
  type: 'zjh',
  title: '三张牌比大小',
  emoji: '♠️',
  desc: '闷看加注比牌，积分随账号永久跟随',
  minPlayers: 2,
  maxPlayers: 6,
  allowSpectators: true,
  rematchSwapSeats: false,

  normalizeConfig(config: any): any {
    return {
      special235: config?.special235 !== false,
      timeoutFold: config?.timeoutFold !== false,
      roundLimit: Number.isFinite(Number(config?.roundLimit))
        ? Math.min(30, Math.max(2, Math.trunc(Number(config.roundLimit))))
        : DEFAULT_ROUNDS,
      career: config?.career !== false,
      bankerMode: config?.bankerMode === 'winner' ? 'winner' : 'rotate',
      mustBlindRounds: Number.isFinite(Number(config?.mustBlindRounds))
        ? Math.min(3, Math.max(0, Math.trunc(Number(config.mustBlindRounds))))
        : 0,
    };
  },

  create(): ZjhState {
    return {
      round: 0,
      totalRounds: DEFAULT_ROUNDS,
      handPhase: 'betting',
      deadline: 0,
      dealerSeat: 0,
      deck: [],
      players: new Map(),
      pot: 0,
      stake: ANTE,
      roundNo: 1,
      turnSeat: -1,
      chips: new Map(),
      handStartChips: new Map(),
      initialChips: new Map(),
      timer: null,
      ranking: null,
      endReason: '',
      lastWinnerSeat: null,
      betLog: new Map(),
      config: { special235: true, timeoutFold: true, roundLimit: DEFAULT_ROUNDS, career: true, bankerMode: 'rotate', mustBlindRounds: 0 },
    };
  },

  start(room): void {
    const st = room.game as ZjhState;
    st.config = zjhHandler.normalizeConfig!(room.config);
    st.totalRounds = st.config.roundLimit;
    const players = seatPlayers(room);
    st.chips = new Map();
    st.initialChips = new Map();
    for (const m of players) {
      st.chips.set(m.userId, m.chips);
      st.initialChips.set(m.userId, m.chips);
    }
    const funded = players.filter((m) => (st.chips.get(m.userId) || 0) >= ANTE);
    st.dealerSeat = funded[0]?.seat ?? 0; // 首手庄=第一个有积分的座位，之后轮庄
    st.round = 1;
    st.ranking = null;
    st.endReason = '';
    st.betLog = new Map();
    startHand(room);
  },

  onPlayerQuit(room: Room, member: Member): ActionResult | void {
    const st = room.game as ZjhState;
    const p = st.players.get(member.userId);
    if (p && !p.folded) {
      p.folded = true;
      if (st.handPhase === 'betting' && st.turnSeat === member.seat) advanceTurn(room, st, false);
    }
    // 退出视作弃牌：本手流水立即按投入亏损结算（此后不再参与本手结算）
    const quitEntry = p ? handLogEntry(st, member.userId) : null;
    if (quitEntry && quitEntry.delta === null) {
      quitEntry.delta = -p!.betTotal;
      quitEntry.ended = 'fold';
    }
    st.players.delete(member.userId);
    const remaining = seatPlayers(room);
    if (remaining.length < 2 && room.phase === 'playing') {
      finish(room, '人数不足，提前结束');
      return { ended: { winnerSeat: st.ranking?.[0]?.seat ?? -1, reason: '人数不足，提前结束' } };
    }
    if (room.phase === 'playing' && st.handPhase === 'betting') {
      const alive = aliveSeats(room, st);
      if (alive.length <= 1) winByFold(room, alive[0]);
    }
    return undefined;
  },

  onAction(room: Room, member: Member, action: string, payload: any): ActionResult {
    const st = room.game as ZjhState;
    if (room.phase !== 'playing' || st.handPhase !== 'betting') return { error: '当前不是下注阶段' };
    const p = st.players.get(member.userId);
    if (!p) return { error: '你不在本手牌局中' };
    if (p.folded) return { error: '你已弃牌' };
    if (p.allIn) return { error: '你已 all-in，等待开牌' };

    if (action === 'zjh_look') {
      if (p.seen) return { error: '你已经看过牌了' };
      if (st.roundNo <= st.config.mustBlindRounds && st.config.mustBlindRounds > 0) {
        return { error: `前 ${st.config.mustBlindRounds} 轮必须闷牌` };
      }
      doLook(room, member);
      return {};
    }
    if (st.turnSeat !== member.seat) return { error: '还没轮到你' };

    if (action === 'zjh_call') {
      doCall(room, member);
      return {};
    }
    if (action === 'zjh_fold') {
      doFold(room, member);
      return {};
    }
    if (action === 'zjh_raise') {
      const amount = Math.trunc(Number(payload?.amount));
      if (!RAISE_STEPS.includes(amount)) return { error: '加注档位只能是 10/20/50' };
      if (st.stake >= STAKE_CAP) return { error: '单注已封顶' };
      const newStake = Math.min(STAKE_CAP, st.stake + amount);
      const p2 = st.players.get(member.userId)!;
      const cost = p2.seen ? newStake * 2 : newStake;
      if ((st.chips.get(member.userId) || 0) < cost) return { error: '积分不足，无法加注' };
      st.stake = newStake;
      doCall(room, member); // 按新注价支付
      return {};
    }
    if (action === 'zjh_compare') {
      if (st.roundNo < COMPARE_MIN_ROUND) return { error: `第 ${COMPARE_MIN_ROUND} 轮起才能比牌` };
      const targetSeat = Number(payload?.target);
      const target = seatPlayers(room).find((x) => x.seat === targetSeat);
      if (!target || target.userId === member.userId) return { error: '无效的比牌对象' };
      const tp = st.players.get(target.userId);
      if (!tp || tp.folded) return { error: '对方已弃牌' };
      if (tp.allIn) return { error: '对方已 all-in，不能与其比牌' };
      // 比牌费 = 自己跟注价的 2 倍（闷 2×单注 / 看 4×单注）
      const cost = p.seen ? st.stake * 4 : st.stake * 2;
      if ((st.chips.get(member.userId) || 0) < cost) return { error: '积分不足，无法比牌' };
      doCompare(room, member, target);
      return {};
    }
    return { error: '未知的游戏操作' };
  },

  serializeFor(room: Room, viewer: Member): Record<string, unknown> {
    const st = room.game as ZjhState;
    const mine = st.players.get(viewer.userId);
    const others = [...st.players]
      .filter(([uid]) => uid !== viewer.userId && room.members.has(uid))
      .map(([uid, p]) => {
        const m = room.members.get(uid)!;
        return {
          userId: uid,
          nickname: m.nickname,
          seat: m.seat,
          seen: p.seen,
          folded: p.folded,
          allIn: p.allIn,
          betTotal: p.betTotal,
          cardCount: p.cards.length ? p.cards.length : p.folded ? 0 : 3, // 弃牌前一律按 3 张显示（不泄露是否已看牌时发过）
        };
      });
    return {
      round: st.round,
      totalRounds: st.totalRounds,
      phase: st.handPhase,
      deadline: st.deadline,
      dealerSeat: st.dealerSeat,
      pot: st.pot,
      stake: st.stake,
      roundNo: st.roundNo,
      turnSeat: st.handPhase === 'betting' ? st.turnSeat : -1,
      compareMinRound: COMPARE_MIN_ROUND,
      // 防偷看核心：未看牌时绝不发自己的牌
      myCards: mine && mine.seen ? mine.cards.map(cardLabel) : null,
      myRank: mine && mine.seen && mine.cards.length ? typeName(handRank(mine.cards)) : null,
      mySeen: mine?.seen || false,
      myFolded: mine?.folded || false,
      myAllIn: mine?.allIn || false,
      myBetTotal: mine?.betTotal || 0,
      others,
      chips: st.chips.size ? [...st.chips].map(([userId, chips]) => ({ userId, chips })) : [...room.members.values()].filter((m) => m.seat >= 0).map((m) => ({ userId: m.userId, chips: m.chips })),
      raiseSteps: RAISE_STEPS,
      stakeCap: STAKE_CAP,
      special235: st.config.special235,
      myBetLog: st.betLog.get(viewer.userId) || [],
      ended: st.ranking ? { ranking: st.ranking, reason: st.endReason } : null,
    };
  },
};
