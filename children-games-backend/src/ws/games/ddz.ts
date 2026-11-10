// 斗地主 handler：叫分定地主（无抢地主）、全套牌型引擎、炸弹/火箭/春天倍数、底封顶零和结算
// 无底注设计：中途退出不损失积分，直接按当前桌面积分终局（人数不足）
import type { Room, Member } from '../roomManager';
import { addTimer, getRoom, type Seat } from '../roomManager';
import type { ActionResult, GameHandler } from './types';
import { getRoomBus } from '../bus';
import { applyChipDelta } from '../../services/battleChips';
import {
  autoFollow,
  autoLead,
  buildDeck,
  canBeat,
  multiplierOf,
  parseHand,
  sortCards,
  typeName,
  type DdzHand,
} from './ddz/engine';
import {
  armStateTimer,
  betLedgerView,
  chipsView,
  clearGameTimer,
  finishChipGame,
  getSeatedPlayers,
  initChipSnapshots,
  nextHandGate,
  seatedAt,
  type ChipRankingEntry,
} from './helpers';

const BID_SECONDS = Math.max(5, Number(process.env.DDZ_BID_SECONDS) || 15);
const PLAY_SECONDS = Math.max(5, Number(process.env.DDZ_PLAY_SECONDS) || 25);
const NEXT_HAND_DELAY_MS = 4000;
const DEFAULT_ROUNDS = 2;
const DEFAULT_BASE_UNIT = 10;
const BASE_UNITS = [5, 10, 20];
const HAND_CARDS = 17; // 每人 17 张，3 张底牌

export interface DdzConfig {
  roundLimit: number;
  baseUnit: number;
  career: boolean;
}

interface DdzPlayer {
  cards: string[];
  isLandlord: boolean;
  playedHands: number; // 本局已出牌手数（春天判定）
  bid: number | null; // 本局叫分（null=未叫，0=不叫）
}

/** 每局流水条目（无渐进下注，每局一条） */
interface DdzBetEntry {
  round: number;
  bid: number;
  multiplier: number;
  role: 'landlord' | 'farmer';
  delta: number | null;
  ended: string | null;
}

interface DdzState {
  round: number;
  totalRounds: number;
  handPhase: 'bidding' | 'playing' | 'settle';
  deadline: number;
  turnSeat: number;
  bidStartSeat: number;
  bidStartOffset: number; // 全不叫重发时轮发起叫座位
  bidBestScore: number;
  bidBestSeat: number | null;
  bidCount: number;
  landlordSeat: number | null;
  bidBase: number;
  multiplier: number;
  bottomCards: string[];
  players: Map<number, DdzPlayer>;
  lastPlay: { seat: number; userId: number; cards: string[]; hand: DdzHand } | null;
  passCount: number;
  leadSeat: number; // 当前出牌权归属（其出牌无需压牌）
  chips: Map<number, number>;
  handStartChips: Map<number, number>;
  initialChips: Map<number, number>;
  timer: NodeJS.Timeout | null;
  ranking: ChipRankingEntry[] | null;
  endReason: string;
  betLog: Map<number, DdzBetEntry[]>;
  config: DdzConfig;
}

/** 按座位序取 3 人（min/max=3 保证恰好三家） */
const seats = (room: Room): Member[] => getSeatedPlayers(room).slice(0, 3);

/** 下一个行动座位（三家固定轮转） */
const nextSeatOf = (room: Room, seat: number): number => {
  const ss = seats(room).map((m) => m.seat);
  const idx = ss.indexOf(seat as Seat);
  return ss[(idx + 1) % ss.length];
};

const phasePayload = (room: Room, st: DdzState) => ({
  t: 'ddz_phase',
  round: st.round,
  totalRounds: st.totalRounds,
  phase: st.handPhase,
  turnSeat: st.handPhase === 'settle' ? -1 : st.turnSeat,
  leadSeat: st.handPhase === 'playing' ? st.leadSeat : -1,
  landlordSeat: st.landlordSeat,
  bidStartSeat: st.bidStartSeat,
  bidBestScore: st.bidBestScore,
  bidBase: st.bidBase,
  baseUnit: st.config.baseUnit,
  multiplier: st.multiplier,
  bottomCards: st.landlordSeat !== null ? sortCards(st.bottomCards) : null,
  lastPlay: st.lastPlay
    ? {
        seat: st.lastPlay.seat,
        userId: st.lastPlay.userId,
        cards: st.lastPlay.cards,
        cardType: typeName(st.lastPlay.hand),
      }
    : null,
  deadline: st.deadline,
  chips: [...st.chips].map(([userId, chips]) => ({ userId, chips })),
});

/** 发牌并进入叫分阶段 */
const startHand = (room: Room): void => {
  const st = room.game as DdzState;
  clearGameTimer(st);
  const players = seats(room);
  const deck = buildDeck();
  st.handPhase = 'bidding';
  st.landlordSeat = null;
  st.bidBase = 0;
  st.multiplier = 1;
  st.bottomCards = deck.slice(HAND_CARDS * 3);
  st.lastPlay = null;
  st.passCount = 0;
  st.leadSeat = -1;
  st.bidBestScore = 0;
  st.bidBestSeat = null;
  st.bidCount = 0;
  st.players = new Map();
  st.handStartChips = new Map();

  players.forEach((m, i) => {
    st.handStartChips.set(m.userId, st.chips.get(m.userId) || 0);
    st.players.set(m.userId, {
      cards: sortCards(deck.slice(i * HAND_CARDS, (i + 1) * HAND_CARDS)),
      isLandlord: false,
      playedHands: 0,
      bid: null,
    });
  });

  const startIdx = (st.round - 1 + st.bidStartOffset) % players.length;
  st.bidStartSeat = players[startIdx].seat;
  st.turnSeat = st.bidStartSeat;

  const bus = getRoomBus();
  bus.broadcast(room, phasePayload(room, st));
  for (const m of players) {
    const p = st.players.get(m.userId)!;
    bus.sendToUser(room, m.userId, { t: 'ddz_your_cards', cards: p.cards, phase: 'bidding' });
  }
  armBidTimer(room, st);
};

const armBidTimer = (room: Room, st: DdzState): void => {
  st.deadline = Date.now() + BID_SECONDS * 1000;
  const seat = st.turnSeat;
  armStateTimer(
    room,
    st,
    () => {
      const r = getRoom(room.id);
      if (!r) return;
      const s = r.game as DdzState;
      if (s.handPhase !== 'bidding' || s.turnSeat !== seat) return;
      const m = seatedAt(r, seat);
      if (m) doBid(r, m, 0, true); // 超时=不叫
    },
    BID_SECONDS * 1000
  );
};

const armPlayTimer = (room: Room, st: DdzState): void => {
  st.deadline = Date.now() + PLAY_SECONDS * 1000;
  const seat = st.turnSeat;
  armStateTimer(
    room,
    st,
    () => {
      const r = getRoom(room.id);
      if (!r) return;
      const s = r.game as DdzState;
      if (s.handPhase !== 'playing' || s.turnSeat !== seat) return;
      const m = seatedAt(r, seat);
      if (!m) return;
      const p = s.players.get(m.userId)!;
      if (seat === s.leadSeat || !s.lastPlay) {
        doPlay(r, m, autoLead(p.cards), true); // 出牌权在手：自动出最小单张
      } else {
        const mv = autoFollow(p.cards, s.lastPlay.hand);
        if (mv) doPlay(r, m, mv, true);
        else doPass(r, m, true);
      }
    },
    PLAY_SECONDS * 1000
  );
};

const doBid = (room: Room, member: Member, score: number, auto = false): void => {
  const st = room.game as DdzState;
  const p = st.players.get(member.userId)!;
  p.bid = score;
  st.bidCount += 1;
  if (score > st.bidBestScore) {
    st.bidBestScore = score;
    st.bidBestSeat = member.seat;
  }
  const bus = getRoomBus();
  bus.broadcast(room, {
    t: 'ddz_bid',
    userId: member.userId,
    nickname: member.nickname,
    seat: member.seat,
    score,
    auto,
    bestScore: st.bidBestScore,
    bidCount: st.bidCount,
  });
  // 3 分封顶立即定地主；三家常叫完有叫分者定地主，全不叫重发
  if (score === 3 || st.bidCount >= 3) {
    if (st.bidBestSeat !== null) decideLandlord(room);
    else {
      st.bidStartOffset += 1;
      getRoomBus().broadcast(room, { t: 'ddz_redeal', round: st.round });
      startHand(room);
    }
    return;
  }
  st.turnSeat = nextSeatOf(room, member.seat);
  bus.broadcast(room, phasePayload(room, st));
  armBidTimer(room, st);
};

/** 叫分完成：地主拿底牌（公开翻出），进入出牌阶段 */
const decideLandlord = (room: Room): void => {
  const st = room.game as DdzState;
  const landlordSeat = st.bidBestSeat!;
  st.landlordSeat = landlordSeat;
  st.bidBase = st.bidBestScore;
  const lm = seatedAt(room, landlordSeat)!;
  const lp = st.players.get(lm.userId)!;
  lp.isLandlord = true;
  lp.cards = sortCards([...lp.cards, ...st.bottomCards]);

  st.handPhase = 'playing';
  st.leadSeat = landlordSeat;
  st.turnSeat = landlordSeat;
  st.passCount = 0;
  st.lastPlay = null;

  const bus = getRoomBus();
  bus.broadcast(room, { t: 'ddz_bottom', cards: sortCards(st.bottomCards), landlordSeat });
  bus.sendToUser(room, lm.userId, { t: 'ddz_your_cards', cards: lp.cards, phase: 'playing' });
  bus.broadcast(room, phasePayload(room, st));
  armPlayTimer(room, st);
};

/** 出牌：校验→去牌→倍数→广播→终局/推进 */
const doPlay = (room: Room, member: Member, cards: string[], auto = false): void => {
  const st = room.game as DdzState;
  const p = st.players.get(member.userId)!;
  // 牌必须全在自己手里（按张数核对，防重复选同一张）
  const handCount = new Map<string, number>();
  for (const c of p.cards) handCount.set(c, (handCount.get(c) || 0) + 1);
  const playCount = new Map<string, number>();
  for (const c of cards) playCount.set(c, (playCount.get(c) || 0) + 1);
  for (const [c, n] of playCount) {
    if ((handCount.get(c) || 0) < n) {
      getRoomBus().sendToUser(room, member.userId, { t: 'ddz_error', error: '出牌包含不存在的牌' });
      return;
    }
  }
  const hand = parseHand(cards);
  if (!hand) {
    getRoomBus().sendToUser(room, member.userId, { t: 'ddz_error', error: '不是合法牌型' });
    return;
  }
  const isLead = member.seat === st.leadSeat || !st.lastPlay;
  if (!isLead && !canBeat(hand, st.lastPlay!.hand)) {
    getRoomBus().sendToUser(room, member.userId, { t: 'ddz_error', error: '压不过上家的牌' });
    return;
  }
  for (const c of cards) {
    const idx = p.cards.indexOf(c);
    p.cards.splice(idx, 1);
  }
  p.playedHands += 1;
  st.multiplier *= multiplierOf(hand);
  st.lastPlay = { seat: member.seat, userId: member.userId, cards, hand };
  st.passCount = 0;
  st.leadSeat = member.seat;

  const bus = getRoomBus();
  bus.broadcast(room, {
    t: 'ddz_play',
    userId: member.userId,
    nickname: member.nickname,
    seat: member.seat,
    cards,
    cardType: typeName(hand),
    multiplier: st.multiplier,
    remain: p.cards.length,
    auto,
  });
  if (p.cards.length === 0) {
    settleHand(room, member, 'done');
    return;
  }
  st.turnSeat = nextSeatOf(room, member.seat);
  bus.broadcast(room, phasePayload(room, st));
  armPlayTimer(room, st);
};

const doPass = (room: Room, member: Member, auto = false): void => {
  const st = room.game as DdzState;
  if (member.seat === st.leadSeat || !st.lastPlay) {
    getRoomBus().sendToUser(room, member.userId, { t: 'ddz_error', error: '你有出牌权，必须出牌' });
    return;
  }
  st.passCount += 1;
  const bus = getRoomBus();
  bus.broadcast(room, {
    t: 'ddz_pass',
    userId: member.userId,
    nickname: member.nickname,
    seat: member.seat,
    passCount: st.passCount,
    auto,
  });
  if (st.passCount >= 2) {
    // 两家连续过：出牌权回到最后出牌者（可任意出）
    st.leadSeat = st.lastPlay.seat;
    st.turnSeat = st.leadSeat;
    st.passCount = 0;
    bus.broadcast(room, phasePayload(room, st));
    armPlayTimer(room, st);
    return;
  }
  st.turnSeat = nextSeatOf(room, member.seat);
  bus.broadcast(room, phasePayload(room, st));
  armPlayTimer(room, st);
};

/** 本局结算：底封顶（保证三家都付得起）→ 零和 delta → 实时入账 → 流水回填 */
const settleHand = (room: Room, winner: Member, reason: 'done' | 'quit'): void => {
  const st = room.game as DdzState;
  clearGameTimer(st);
  st.handPhase = 'settle';
  const landlordSeat = st.landlordSeat!;
  const landlordWin = winner.seat === landlordSeat;

  // 春天/反春判定（×2）
  let spring: 'spring' | 'anti' | null = null;
  const lmUid = seatedAt(room, landlordSeat)?.userId;
  if (landlordWin) {
    const farmersIdle = [...st.players].every(([uid, p]) => p.isLandlord || p.playedHands === 0);
    if (farmersIdle && st.players.size === 3) spring = 'spring';
  } else if (lmUid !== undefined && st.players.get(lmUid)!.playedHands <= 1) {
    spring = 'anti';
  }
  if (spring) st.multiplier *= 2;

  // 底封顶：S 不超过农民最少筹码 / 地主筹码的一半（保证付得起，零和不破）
  let s = st.bidBase * st.config.baseUnit * st.multiplier;
  const farmerChips = [...st.players]
    .filter(([, p]) => !p.isLandlord)
    .map(([uid]) => st.chips.get(uid) || 0);
  const landlordChips = st.chips.get(lmUid ?? -1) || 0;
  const cap = Math.min(
    farmerChips.length ? Math.min(...farmerChips) : s,
    Math.floor(landlordChips / 2) || s
  );
  s = Math.max(0, Math.min(s, cap));

  const landlordDelta = landlordWin ? 2 * s : -2 * s;
  const farmerDelta = landlordWin ? -s : s;
  const deltas = [...st.players].map(([uid, p]) => {
    const delta = p.isLandlord ? landlordDelta : farmerDelta;
    const chips = (st.chips.get(uid) || 0) + delta;
    st.chips.set(uid, chips);
    const label = p.isLandlord
      ? landlordWin
        ? '地主胜'
        : '地主负'
      : landlordWin
        ? '农民负'
        : '农民胜';
    appendLog(st, uid, {
      round: st.round,
      bid: st.bidBase,
      multiplier: st.multiplier,
      role: p.isLandlord ? 'landlord' : 'farmer',
      delta,
      ended: reason === 'quit' ? `${label}(退出)` : label,
    });
    return {
      userId: uid,
      nickname: room.members.get(uid)?.nickname || `角色${uid}`,
      delta,
      chips,
      role: p.isLandlord ? ('landlord' as const) : ('farmer' as const),
    };
  });
  for (const d of deltas) {
    if (d.delta) void applyChipDelta(d.userId, d.delta); // 每局实时入账
    const m = room.members.get(d.userId);
    if (m) m.chips = d.chips;
  }

  getRoomBus().broadcast(room, {
    t: 'ddz_settle',
    round: st.round,
    winner: winner.userId,
    winnerNickname: winner.nickname,
    landlordSeat,
    landlordWin,
    spring,
    reason,
    bid: st.bidBase,
    baseUnit: st.config.baseUnit,
    multiplier: st.multiplier,
    unitScore: s,
    deltas,
    bottomCards: sortCards(st.bottomCards),
    nextDeadline: Date.now() + NEXT_HAND_DELAY_MS,
  });

  const timer = setTimeout(() => nextHand(room, (room.game as DdzState).round), NEXT_HAND_DELAY_MS);
  addTimer(room, timer);
};

/** 追加一条本局流水 */
const appendLog = (st: DdzState, uid: number, entry: DdzBetEntry): void => {
  const arr = st.betLog.get(uid) || [];
  arr.push(entry);
  st.betLog.set(uid, arr);
};

const nextHand = (room: Room, expectRound: number): void => {
  const r = getRoom(room.id);
  if (!r || r.phase !== 'playing') return;
  const st = r.game as DdzState;
  if (st.round !== expectRound) return;
  clearGameTimer(st);
  const gate = nextHandGate(r, st, (m) => (st.chips.get(m.userId) || 0) > 0);
  if (gate.finish) {
    finish(r, gate.reason);
    return;
  }
  st.round += 1;
  startHand(r);
};

const finish = (room: Room, reason: string): void => {
  const st = room.game as DdzState;
  st.handPhase = 'settle';
  finishChipGame(room, st, 'ddz', 'ddz_final', reason);
};

export const ddzHandler: GameHandler<DdzState> = {
  type: 'ddz',
  title: '斗地主',
  emoji: '🃏',
  desc: '叫分抢地主，炸弹春天翻倍，积分随账号永久跟随',
  minPlayers: 3,
  maxPlayers: 3,
  allowSpectators: true,
  rematchSwapSeats: false,
  validActions: new Set(['ddz_bid', 'ddz_play', 'ddz_pass']),

  normalizeConfig(config: Record<string, unknown>): Record<string, unknown> {
    const unit = Number(config?.baseUnit);
    return {
      roundLimit: Number.isFinite(Number(config?.roundLimit))
        ? Math.min(5, Math.max(1, Math.trunc(Number(config.roundLimit))))
        : DEFAULT_ROUNDS,
      baseUnit: BASE_UNITS.includes(unit) ? unit : DEFAULT_BASE_UNIT,
      career: config?.career !== false,
    };
  },

  create(): DdzState {
    return {
      round: 0,
      totalRounds: DEFAULT_ROUNDS,
      handPhase: 'bidding',
      deadline: 0,
      turnSeat: -1,
      bidStartSeat: -1,
      bidStartOffset: 0,
      bidBestScore: 0,
      bidBestSeat: null,
      bidCount: 0,
      landlordSeat: null,
      bidBase: 0,
      multiplier: 1,
      bottomCards: [],
      players: new Map(),
      lastPlay: null,
      passCount: 0,
      leadSeat: -1,
      chips: new Map(),
      handStartChips: new Map(),
      initialChips: new Map(),
      timer: null,
      ranking: null,
      endReason: '',
      betLog: new Map(),
      config: {
        roundLimit: DEFAULT_ROUNDS,
        baseUnit: DEFAULT_BASE_UNIT,
        career: true,
      },
    };
  },

  start(room): void {
    const st = room.game as DdzState;
    st.config = ddzHandler.normalizeConfig!(room.config) as DdzConfig;
    st.totalRounds = st.config.roundLimit;
    initChipSnapshots(st, seats(room));
    st.round = 1;
    st.bidStartOffset = 0;
    st.ranking = null;
    st.endReason = '';
    st.betLog = new Map();
    startHand(room);
  },

  /** 无底注：退出不损积分，按当前桌面积分直接终局（不足三家无法继续） */
  onPlayerQuit(room: Room, member: Member): ActionResult | void {
    const st = room.game as DdzState;
    st.players.delete(member.userId);
    if (room.phase === 'playing') {
      finish(room, '人数不足，提前结束');
      return { ended: { winnerSeat: st.ranking?.[0]?.seat ?? -1, reason: '人数不足，提前结束' } };
    }
    return undefined;
  },

  onAction(
    room: Room,
    member: Member,
    action: string,
    payload: Record<string, unknown>
  ): ActionResult {
    const st = room.game as DdzState;
    if (room.phase !== 'playing') return { error: '对局未在进行中' };

    if (action === 'ddz_bid') {
      if (st.handPhase !== 'bidding') return { error: '当前不是叫分阶段' };
      if (st.turnSeat !== member.seat) return { error: '还没轮到你叫分' };
      const score = Math.trunc(Number(payload?.score));
      if (!Number.isInteger(score) || score < 0 || score > 3) return { error: '叫分只能是 0-3' };
      if (score > 0 && score <= st.bidBestScore)
        return { error: `必须叫高于 ${st.bidBestScore} 分或不叫` };
      doBid(room, member, score);
      return {};
    }

    if (st.handPhase !== 'playing') return { error: '当前不是出牌阶段' };
    if (st.turnSeat !== member.seat) return { error: '还没轮到你出牌' };

    if (action === 'ddz_play') {
      const cards = Array.isArray(payload?.cards) ? payload.cards.map((c) => String(c)) : [];
      if (!cards.length || cards.length > 20) return { error: '请选择要出的牌' };
      doPlay(room, member, cards);
      return {};
    }
    if (action === 'ddz_pass') {
      doPass(room, member);
      return {};
    }
    return { error: '未知的游戏操作' };
  },

  serializeFor(room: Room, viewer: Member): Record<string, unknown> {
    const st = room.game as DdzState;
    const mine = st.players.get(viewer.userId);
    const others = [...st.players]
      .filter(([uid]) => uid !== viewer.userId && room.members.has(uid))
      .map(([uid, p]) => {
        const m = room.members.get(uid)!;
        return {
          userId: uid,
          nickname: m.nickname,
          seat: m.seat,
          cardCount: p.cards.length,
          isLandlord: p.isLandlord,
          bid: p.bid,
        };
      });
    return {
      round: st.round,
      totalRounds: st.totalRounds,
      phase: st.handPhase,
      deadline: st.deadline,
      turnSeat: st.handPhase === 'settle' ? -1 : st.turnSeat,
      leadSeat: st.handPhase === 'playing' ? st.leadSeat : -1,
      bidStartSeat: st.bidStartSeat,
      bidBestScore: st.bidBestScore,
      bidBase: st.bidBase,
      baseUnit: st.config.baseUnit,
      multiplier: st.multiplier,
      landlordSeat: st.landlordSeat,
      bottomCards: st.landlordSeat !== null ? sortCards(st.bottomCards) : null,
      lastPlay: st.lastPlay
        ? {
            seat: st.lastPlay.seat,
            userId: st.lastPlay.userId,
            cards: st.lastPlay.cards,
            cardType: typeName(st.lastPlay.hand),
          }
        : null,
      // 手牌只发本人（他人只见张数）
      myCards: mine ? sortCards(mine.cards) : [],
      myBid: mine?.bid ?? null,
      myRole: mine ? (mine.isLandlord ? 'landlord' : 'farmer') : null,
      others,
      chips: chipsView(st.chips, room),
      // 每局流水全员可见
      betLedger: betLedgerView(st.betLog),
      ended: st.ranking ? { ranking: st.ranking, reason: st.endReason } : null,
    };
  },
};
