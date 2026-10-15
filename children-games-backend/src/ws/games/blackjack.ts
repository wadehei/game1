// 21点 handler：多手积分制（账号积分随打随结），庄家模式建房可选（轮庄/赢家坐庄/持续坐庄可让庄）
// 隐私：庄家暗牌 serializeFor 只发庄家本人；超时自动执行保守动作（下注默认10、操作默认停牌）
import type { Room, Member } from '../roomManager';
import { addTimer, clearRoomTimers, getRoom } from '../roomManager';
import type { ActionResult, GameHandler } from './types';
import { getRoomBus } from '../bus';
import { applyChipDelta, writeCareerRecords } from '../../services/battleChips';
import { buildDeck, handValue, isBlackjack, isBusted, payoutMultiplier, BET_OPTIONS, cardLabel, type Card } from './blackjack/engine';

const BET_SECONDS = Math.max(3, Number(process.env.BLACKJACK_BET_SECONDS) || 15);
const ACT_SECONDS = Math.max(3, Number(process.env.BLACKJACK_ACT_SECONDS) || 20);
const DEALER_STEP_MS = 700;
const DEFAULT_BET = 10;
const DEFAULT_ROUNDS = 8;
const NEXT_HAND_DELAY_MS = 4000; // 手间结算展示时长（前端有下一手倒计时）

export interface BJConfig {
  bankerMode: 'rotate' | 'winner' | 'keep';
  roundLimit: number;
  career: boolean;
}

interface BJHand {
  cards: Card[];
  stake: number;
  doubled: boolean;
  done: boolean;
  busted: boolean;
  natural: boolean;
}

interface BJState {
  round: number;
  totalRounds: number;
  handPhase: 'betting' | 'acting' | 'dealer' | 'settle';
  deadline: number;
  bankerSeat: number;
  nextBankerSeat: number | null; // winner 模式：本手结算时定下的下一手庄家
  deck: Card[];
  hands: Map<number, BJHand>;
  banker: { cards: Card[]; revealed: boolean };
  chips: Map<number, number>;
  initialChips: Map<number, number>; // 局初积分（生涯局记录的 delta 用）
  turnSeat: number;
  timer: NodeJS.Timeout | null;
  lastResults: Array<{ userId: number; outcome: string; delta: number; chips: number }> | null;
  ranking: Array<{ userId: number; nickname: string; chips: number; delta: number; seat: number }> | null;
  endReason: string;
  /** 个人下注流水（整局累计，serializeFor 只发本人）：每手一条，delta/outcome 结算时回填 */
  betLog: Map<number, Array<{ round: number; stake: number; doubled: boolean; delta: number | null; outcome: string | null }>>;
  config: BJConfig;
}

const seatedPlayers = (room: Room): Member[] => [...room.members.values()].filter((m) => m.seat >= 0).sort((a, b) => a.seat - b.seat);
/** 还有积分、能参与下注的闲家（排除离线：掉线立即停手，不再代下注/代打防放血） */
const activePlayers = (room: Room, st: BJState): Member[] =>
  seatedPlayers(room).filter((m) => m.seat !== st.bankerSeat && (st.chips.get(m.userId) || 0) > 0 && m.online);

const clearTimer = (st: BJState): void => {
  if (st.timer) clearTimeout(st.timer);
  st.timer = null;
};

const phasePayload = (room: Room, st: BJState) => ({
  t: 'blackjack_phase',
  round: st.round,
  totalRounds: st.totalRounds,
  phase: st.handPhase,
  bankerSeat: st.bankerSeat,
  turnSeat: st.handPhase === 'acting' ? st.turnSeat : -1,
  deadline: st.deadline,
  chips: [...st.chips].map(([userId, chips]) => ({ userId, chips })),
  betOptions: BET_OPTIONS,
  canPassBank: st.config.bankerMode === 'keep' && st.handPhase === 'betting',
});

const enterBetting = (room: Room, st: BJState, keepHand: boolean): void => {
  clearTimer(st);
  if (!keepHand) {
    st.deck = buildDeck();
    st.hands = new Map();
    st.banker = { cards: [], revealed: false };
    st.lastResults = null;
  }
  st.handPhase = 'betting';
  st.deadline = Date.now() + BET_SECONDS * 1000;
  getRoomBus().broadcast(room, phasePayload(room, st));

  const timer = setTimeout(() => {
    const r = getRoom(room.id);
    if (!r) return;
    const s = r.game as BJState;
    if (s.handPhase !== 'betting' || s.round !== st.round) return;
    // 超时：未下注的闲家默认下最小注（能给得起多少下多少）
    for (const m of activePlayers(r, s)) {
      if (!s.hands.has(m.userId)) {
        const chips = s.chips.get(m.userId) || 0;
        placeBet(r, m.userId, Math.min(DEFAULT_BET, chips));
      }
    }
    if ((r.game as BJState).handPhase === 'betting') dealCards(r);
  }, BET_SECONDS * 1000);
  st.timer = timer;
  addTimer(room, timer);
};

const placeBet = (room: Room, userId: number, amount: number): void => {
  const st = room.game as BJState;
  const chips = st.chips.get(userId) || 0;
  const stake = Math.max(0, Math.min(Math.trunc(amount), chips, Math.max(...BET_OPTIONS)));
  if (stake <= 0) return;
  st.chips.set(userId, chips - stake);
  st.hands.set(userId, { cards: [], stake, doubled: false, done: false, busted: false, natural: false });
  const log = st.betLog.get(userId) || [];
  log.push({ round: st.round, stake, doubled: false, delta: null, outcome: null });
  st.betLog.set(userId, log);
  // 统一在下注处广播（含超时默认下注），前端据此累积流水
  getRoomBus().broadcast(room, { t: 'blackjack_action', userId, action: 'bet', stake });
};

const dealCards = (room: Room): void => {
  const st = room.game as BJState;
  if (st.handPhase !== 'betting') return; // 防重入（超时与全员下完竞态）
  clearTimer(st);
  // 测试钩子：BLACKJACK_RIGGED=banker 时庄家固定 Blackjack（市面规则：庄家 BJ 立即开牌）
  if (process.env.BLACKJACK_RIGGED === 'banker') {
    st.banker.cards = [{ suit: '♠', rank: 1 }, { suit: '♥', rank: 13 }];
  }
  st.handPhase = 'acting';
  // 闲家各 2 张明牌，庄家 1 明 1 暗
  const bus = getRoomBus();
  const dealCardsTo = (uid: number) => {
    const h = st.hands.get(uid);
    if (!h) return;
    h.cards.push(st.deck.pop()!, st.deck.pop()!);
    h.natural = isBlackjack(h.cards);
    if (h.natural) h.done = true;
  };
  const actives = activePlayers(room, st);
  for (const m of actives) dealCardsTo(m.userId);
  if (process.env.BLACKJACK_RIGGED !== 'banker') {
    st.banker.cards = [st.deck.pop()!];
    st.banker.cards.push(st.deck.pop()!);
  }
  // 庄家 Blackjack：立即亮牌开牌，闲家不再行动（玩家 BJ 平局退注，其余输原注）
  if (isBlackjack(st.banker.cards)) {
    for (const [, h] of st.hands) h.done = true;
  }

  const publicHands = actives.map((m) => {
    const h = st.hands.get(m.userId)!;
    return { userId: m.userId, cards: h.cards.map(cardLabel), natural: h.natural, stake: h.stake };
  });
  bus.broadcast(room, {
    t: 'blackjack_deal',
    round: st.round,
    hands: publicHands,
    bankerUpcard: cardLabel(st.banker.cards[0]),
  });
  // 庄家暗牌点对点私发（快照只在进房/开局时发，中途看不到）
  const bankerMember = seatedPlayers(room).find((m) => m.seat === st.bankerSeat);
  if (bankerMember) {
    bus.sendToUser(room, bankerMember.userId, { t: 'blackjack_your_banker', cards: st.banker.cards.map(cardLabel) });
  }
  advanceTurn(room, st);
};

/** 找下一个需要行动的闲家；无人需要 → 庄家阶段 */
const advanceTurn = (room: Room, st: BJState): void => {
  const bus = getRoomBus();
  const candidates = activePlayers(room, st).filter((m) => !(st.hands.get(m.userId)?.done ?? true));
  if (candidates.length === 0) {
    enterDealer(room, st);
    return;
  }
  // 从当前 turnSeat 的下家开始找（首轮从庄家下家开始）
  let startIdx = candidates.findIndex((m) => m.seat > st.turnSeat);
  if (st.turnSeat < 0 || startIdx < 0) startIdx = 0;
  const next = candidates[startIdx];
  st.turnSeat = next.seat;
  st.handPhase = 'acting';
  st.deadline = Date.now() + ACT_SECONDS * 1000;
  bus.broadcast(room, phasePayload(room, st));

  const timer = setTimeout(() => {
    const r = getRoom(room.id);
    if (!r) return;
    const s = r.game as BJState;
    if (s.handPhase !== 'acting' || s.turnSeat !== next.seat || s.round !== st.round) return;
    const m = r.members.get(next.userId);
    if (!m) return;
    doStand(r, m); // 超时=停牌（保守）
  }, ACT_SECONDS * 1000);
  clearTimer(st);
  st.timer = timer;
  addTimer(room, timer);
};

const drawCard = (st: BJState): Card => st.deck.pop()!;

const doHit = (room: Room, member: Member): void => {
  const st = room.game as BJState;
  const h = st.hands.get(member.userId);
  if (!h || h.done) return;
  const card = drawCard(st);
  h.cards.push(card);
  const { total } = handValue(h.cards);
  if (total > 21) {
    h.busted = true;
    h.done = true;
  } else if (total === 21) {
    h.done = true; // 到 21 自动停牌
  }
  getRoomBus().broadcast(room, {
    t: 'blackjack_action',
    userId: member.userId,
    action: 'hit',
    card: cardLabel(card),
    total,
    busted: h.busted,
  });
  if (h.done) advanceTurn(room, st);
};

const doStand = (room: Room, member: Member): void => {
  const st = room.game as BJState;
  const h = st.hands.get(member.userId);
  if (!h || h.done) return;
  h.done = true;
  getRoomBus().broadcast(room, { t: 'blackjack_action', userId: member.userId, action: 'stand', total: handValue(h.cards).total });
  advanceTurn(room, st);
};

const enterDealer = (room: Room, st: BJState): void => {
  st.handPhase = 'dealer';
  st.banker.revealed = true;
  st.turnSeat = -1;
  st.deadline = 0;
  const bus = getRoomBus();
  bus.broadcast(room, { ...phasePayload(room, st), bankerCards: st.banker.cards.map(cardLabel), bankerValue: handValue(st.banker.cards).total });

  const step = (): void => {
    const r = getRoom(room.id);
    if (!r) return;
    const s = r.game as BJState;
    if (s.handPhase !== 'dealer') return;
    const { total } = handValue(s.banker.cards);
    if (total < 17 && s.deck.length) {
      const card = drawCard(s);
      s.banker.cards.push(card);
      const v = handValue(s.banker.cards).total;
      getRoomBus().broadcast(r, { t: 'blackjack_action', userId: -1, action: 'banker_hit', card: cardLabel(card), total: v });
      const t2 = setTimeout(step, DEALER_STEP_MS);
      addTimer(r, t2);
      return;
    }
    settleHand(r);
  };
  const t1 = setTimeout(step, DEALER_STEP_MS);
  addTimer(room, t1);
};

const settleHand = (room: Room): void => {
  const st = room.game as BJState;
  st.handPhase = 'settle';
  const bankerCards = st.banker.cards;
  const results: Array<{ userId: number; outcome: string; delta: number; chips: number }> = [];
  let bestWinnerSeat: number | null = null;
  let bestDelta = -Infinity;

  for (const [uid, h] of st.hands) {
    const mult = payoutMultiplier(h.cards, bankerCards, h.natural);
    const delta = mult === 0 ? -h.stake : Math.round(mult * h.stake) - h.stake;
    const chips = (st.chips.get(uid) || 0) + Math.round(mult * h.stake); // 平局退注/赢领回+彩头
    st.chips.set(uid, chips);
    const outcome = mult === 0 ? (h.busted ? 'bust' : 'lose') : mult === 1 ? 'push' : mult === 2.5 ? 'blackjack' : 'win';
    results.push({ userId: uid, outcome, delta, chips });
    const logEntry = (st.betLog.get(uid) || []).find((e) => e.round === st.round);
    if (logEntry) {
      logEntry.delta = delta;
      logEntry.outcome = outcome;
    }
    const m = room.members.get(uid);
    if (m) m.chips = chips;
    if (delta > bestDelta) {
      bestDelta = delta;
      bestWinnerSeat = m?.seat ?? null;
    }
    void applyChipDelta(uid, delta); // 每手实时入账（账号积分）
  }

  // winner 模式：本轮最大赢家做下一手庄家（全输/平则庄家连庄）
  if (st.config.bankerMode === 'winner' && bestWinnerSeat !== null && bestDelta > 0) {
    st.nextBankerSeat = bestWinnerSeat;
  }
  st.lastResults = results;
  getRoomBus().broadcast(room, {
    t: 'blackjack_settle',
    round: st.round,
    results,
    bankerCards: bankerCards.map(cardLabel),
    bankerValue: handValue(bankerCards).total,
    chips: [...st.chips].map(([userId, chips]) => ({ userId, chips })),
    nextDeadline: Date.now() + NEXT_HAND_DELAY_MS,
  });

  const timer = setTimeout(() => nextHand(room, (room.game as BJState).round), NEXT_HAND_DELAY_MS);
  addTimer(room, timer);
};

/** 庄家位推进：rotate 顺位 / winner 由 settle 指定 / keep 不变（可让庄） */
const nextBanker = (room: Room, st: BJState): number => {
  const seats: number[] = seatedPlayers(room).filter((m) => (st.chips.get(m.userId) || 0) > 0).map((m) => m.seat);
  if (st.config.bankerMode === 'winner' && st.nextBankerSeat !== null && seats.includes(st.nextBankerSeat)) {
    return st.nextBankerSeat;
  }
  if (st.config.bankerMode === 'keep') return st.bankerSeat;
  const sorted = seats.sort((a, b) => a - b);
  const idx = sorted.indexOf(st.bankerSeat);
  if (idx < 0) return sorted[0] ?? st.bankerSeat;
  return sorted[(idx + 1) % sorted.length];
};

const nextHand = (room: Room, expectRound: number): void => {
  const r = getRoom(room.id);
  if (!r || r.phase !== 'playing') return;
  const st = r.game as BJState;
  if (st.round !== expectRound) return;
  clearTimer(st);

  // 终局判断：打满手数，或场上只剩庄家一人有积分
  const chipHolders = seatedPlayers(r).filter((m) => (st.chips.get(m.userId) || 0) > 0);
  if (st.round >= st.totalRounds || chipHolders.length <= 1) {
    finish(r, chipHolders.length <= 1 ? '其他玩家积分已耗尽' : '手数已打满');
    return;
  }
  st.round += 1;
  st.turnSeat = -1;
  st.bankerSeat = nextBanker(r, st);
  st.nextBankerSeat = null;
  enterBetting(r, st, false);
};

const finish = (room: Room, reason: string): void => {
  const st = room.game as BJState;
  clearTimer(st);
  st.handPhase = 'settle';
  room.phase = 'ended';
  const ranking = seatedPlayers(room)
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
  bus.broadcast(room, { t: 'blackjack_final', ranking, reason });
  bus.broadcast(room, { t: 'game_over', winnerSeat: ranking[0]?.seat ?? -1, reason });

  // 局终写生涯（每手已实时入账，这里只记局流水）
  if (st.config.career) {
    void writeCareerRecords(
      'blackjack',
      ranking.map((r2, i) => ({ userId: r2.userId, result: `rank:${i + 1}`, chipsDelta: r2.delta, chipsAfter: r2.chips }))
    );
  }
};

export const blackjackHandler: GameHandler<BJState> = {
  type: 'blackjack',
  title: '21点',
  emoji: '🃏',
  desc: '庄闲比点，要牌停牌加倍，积分随账号永久跟随',
  minPlayers: 2,
  maxPlayers: 5,
  allowSpectators: true,
  rematchSwapSeats: false,

  normalizeConfig(config: any): any {
    const modes = ['rotate', 'winner', 'keep'];
    const mode = modes.includes(config?.bankerMode) ? config.bankerMode : 'rotate';
    const limit = Number(config?.roundLimit);
    return {
      bankerMode: mode,
      roundLimit: Number.isFinite(limit) ? Math.min(20, Math.max(2, Math.trunc(limit))) : DEFAULT_ROUNDS,
      career: config?.career !== false,
    };
  },

  create(): BJState {
    return {
      round: 0,
      totalRounds: DEFAULT_ROUNDS,
      handPhase: 'betting',
      deadline: 0,
      bankerSeat: 0,
      nextBankerSeat: null,
      deck: [],
      hands: new Map(),
      banker: { cards: [], revealed: false },
      chips: new Map(),
      initialChips: new Map(),
      turnSeat: -1,
      timer: null,
      lastResults: null,
      ranking: null,
      endReason: '',
      betLog: new Map(),
      config: { bankerMode: 'rotate', roundLimit: DEFAULT_ROUNDS, career: true },
    };
  },

  start(room): void {
    const st = room.game as BJState;
    st.config = blackjackHandler.normalizeConfig!(room.config);
    st.totalRounds = st.config.roundLimit;
    const players = seatedPlayers(room);
    // 积分以进房时的账号快照起步（每手结算实时落库）
    st.chips = new Map();
    st.initialChips = new Map();
    for (const m of players) {
      st.chips.set(m.userId, m.chips);
      st.initialChips.set(m.userId, m.chips);
    }
    // 首庄：keep 模式随机，其余座位 0（若座位 0 无积分取第一个有积分的）
    const funded = players.filter((m) => (st.chips.get(m.userId) || 0) > 0);
    if (st.config.bankerMode === 'keep') {
      st.bankerSeat = funded.length ? funded[Math.floor(Math.random() * funded.length)].seat : 0;
    } else {
      st.bankerSeat = funded.some((m) => m.seat === 0) ? 0 : (funded[0]?.seat ?? 0);
    }
    st.round = 1;
    st.turnSeat = -1;
    st.nextBankerSeat = null;
    st.ranking = null;
    st.endReason = '';
    st.betLog = new Map();
    enterBetting(room, st, false);
  },

  /** 掉线立即停手：进行中的手视作停牌，不再代打/代下注（60s 判离场前防放血） */
  onMemberOffline(room: Room, member: Member): void {
    const st = room.game as BJState;
    const h = st.hands.get(member.userId);
    if (h && !h.done) {
      h.done = true;
      if (st.handPhase === 'acting' && st.turnSeat === member.seat) advanceTurn(room, st);
    }
  },

  onPlayerQuit(room: Room, member: Member): ActionResult | void {
    const st = room.game as BJState;
    const h = st.hands.get(member.userId);
    if (h && !h.done) {
      // 对局中退出：已下注不退（视作弃），标记完成避免卡轮次
      h.done = true;
      h.busted = true;
      if (st.handPhase === 'acting' && st.turnSeat === member.seat) advanceTurn(room, st);
    }
    const remaining = seatedPlayers(room);
    if (remaining.length < 2 && room.phase === 'playing') {
      finish(room, '人数不足，提前结束');
      return { ended: { winnerSeat: st.ranking?.[0]?.seat ?? -1, reason: '人数不足，提前结束' } };
    }
    if (member.seat === st.bankerSeat && room.phase === 'playing' && st.handPhase !== 'settle') {
      // 庄家退出：退还未结算注金，庄位顺移重开本手
      for (const [uid, hh] of st.hands) {
        if (!hh.done) {
          st.chips.set(uid, (st.chips.get(uid) || 0) + hh.stake);
          st.hands.delete(uid);
          const log = st.betLog.get(uid);
          const idx = log ? log.findIndex((e) => e.round === st.round && e.delta === null) : -1;
          if (idx >= 0) log!.splice(idx, 1);
        }
      }
      st.bankerSeat = nextBanker(room, st);
      enterBetting(room, st, true);
    }
    return undefined;
  },

  onAction(room: Room, member: Member, action: string, payload: any): ActionResult {
    const st = room.game as BJState;
    const bus = getRoomBus();
    const isBanker = member.seat === st.bankerSeat;

    if (action === 'blackjack_bet') {
      if (room.phase !== 'playing' || st.handPhase !== 'betting') return { error: '现在不是下注时间' };
      if (isBanker) return { error: '庄家不下注' };
      if (st.hands.has(member.userId)) return { error: '你已经下过注了' };
      const amount = Math.trunc(Number(payload?.amount));
      if (!BET_OPTIONS.includes(amount)) return { error: '下注金额只能是 10/20/50/100' };
      const chips = st.chips.get(member.userId) || 0;
      if (amount > chips) return { error: '积分不足' };
      placeBet(room, member.userId, amount); // 广播统一在 placeBet 内
      // 全员下完立即发牌
      const pending = activePlayers(room, st).filter((m) => !st.hands.has(m.userId));
      if (pending.length === 0) dealCards(room);
      return {};
    }

    if (action === 'blackjack_pass_bank') {
      // keep 模式：庄家让庄给下家（下注阶段内，已下注的退注重来）
      if (room.phase !== 'playing' || st.handPhase !== 'betting') return { error: '现在不能让庄' };
      if (!isBanker || st.config.bankerMode !== 'keep') return { error: '只有持续坐庄模式下庄家可以让庄' };
      const next = activePlayers(room, st).filter((m) => m.seat > st.bankerSeat).sort((a, b) => a.seat - b.seat)[0]
        || activePlayers(room, st).sort((a, b) => a.seat - b.seat)[0];
      if (!next) return { error: '没有可以接庄的玩家' };
      for (const [uid, h] of st.hands) {
        st.chips.set(uid, (st.chips.get(uid) || 0) + h.stake);
        const log = st.betLog.get(uid);
        const idx = log ? log.findIndex((e) => e.round === st.round && e.delta === null) : -1;
        if (idx >= 0) log!.splice(idx, 1);
      }
      st.hands = new Map();
      st.bankerSeat = next.seat;
      bus.broadcast(room, { ...phasePayload(room, st), message: `${member.nickname} 让庄，${next.nickname} 接庄` });
      enterBetting(room, st, true);
      return {};
    }

    if (action === 'blackjack_hit' || action === 'blackjack_stand' || action === 'blackjack_double') {
      if (room.phase !== 'playing' || st.handPhase !== 'acting') return { error: '现在不是操作时间' };
      if (isBanker) return { error: '庄家不需要操作' };
      if (st.turnSeat !== member.seat) return { error: '还没轮到你' };
      const h = st.hands.get(member.userId);
      if (!h || h.done) return { error: '你已停牌' };
      if (action === 'blackjack_hit') {
        doHit(room, member);
        return {};
      }
      if (action === 'blackjack_stand') {
        doStand(room, member);
        return {};
      }
      // double：仅首两张后可用，需积分够追加
      if (h.cards.length !== 2) return { error: '只能在前两张后加倍' };
      const chips = st.chips.get(member.userId) || 0;
      if (chips < h.stake) return { error: '积分不足，无法加倍' };
      st.chips.set(member.userId, chips - h.stake);
      h.stake *= 2;
      h.doubled = true;
      const logEntry = (st.betLog.get(member.userId) || []).find((e) => e.round === st.round && e.delta === null);
      if (logEntry) {
        logEntry.stake = h.stake;
        logEntry.doubled = true;
      }
      const card = drawCard(st);
      h.cards.push(card);
      const { total } = handValue(h.cards);
      h.busted = total > 21;
      h.done = true;
      bus.broadcast(room, {
        t: 'blackjack_action',
        userId: member.userId,
        action: 'double',
        card: cardLabel(card),
        total,
        busted: h.busted,
        stake: h.stake,
      });
      advanceTurn(room, st);
      return {};
    }

    return { error: '未知的游戏操作' };
  },

  serializeFor(room: Room, viewer: Member): Record<string, unknown> {
    const st = room.game as BJState;
    const isBanker = viewer.seat === st.bankerSeat;
    const mine = st.hands.get(viewer.userId);
    const others = [...st.hands]
      .filter(([uid]) => uid !== viewer.userId)
      .map(([uid, h]) => ({
        userId: uid,
        cardCount: h.cards.length,
        stake: h.stake,
        done: h.done,
        busted: h.busted,
        natural: h.natural,
      }));
    return {
      round: st.round,
      totalRounds: st.totalRounds,
      phase: st.handPhase,
      deadline: st.deadline,
      bankerSeat: st.bankerSeat,
      isBanker,
      turnSeat: st.handPhase === 'acting' ? st.turnSeat : -1,
      myCards: mine ? mine.cards.map(cardLabel) : [],
      myStake: mine?.stake || 0,
      myDoubled: mine?.doubled || false,
      myDone: mine?.done || false,
      myBusted: mine?.busted || false,
      myNatural: mine?.natural || false,
      bankerCards: st.banker.revealed
        ? st.banker.cards.map(cardLabel)
        : isBanker
          ? st.banker.cards.map(cardLabel)
          : st.banker.cards.length
            ? [cardLabel(st.banker.cards[0])]
            : [],
      bankerValue: st.banker.revealed || isBanker ? handValue(st.banker.cards).total : null,
      others,
      chips: st.chips.size ? [...st.chips].map(([userId, chips]) => ({ userId, chips })) : [...room.members.values()].filter((m) => m.seat >= 0).map((m) => ({ userId: m.userId, chips: m.chips })),
      betOptions: BET_OPTIONS,
      canPassBank: st.config.bankerMode === 'keep' && st.handPhase === 'betting' && isBanker,
      lastResults: st.lastResults,
      // 投注明细全员可见：每手的押注（含加倍）与输赢
      betLedger: [...st.betLog].flatMap(([uid, entries]) => entries.map((e) => ({ ...e, userId: uid }))),
      ended: st.ranking ? { ranking: st.ranking, reason: st.endReason } : null,
    };
  },
};
