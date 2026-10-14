// UNO handler：2~6 人，标准 108 牌；手牌按人私发；45s 超时自动摸牌跳过
import type { Room, Member } from '../roomManager';
import { addTimer, clearRoomTimers } from '../roomManager';
import type { ActionResult, GameHandler } from './types';
import { getRoomBus } from '../bus';
import { getRoom } from '../roomManager';
import { buildDeck, canPlay, cardScore, shuffle, isNumberCard, type UnoCard, type UnoColor } from './uno/engine';

const TURN_SECONDS = 45;
const INITIAL_HAND = 7;

const UNO_COLORS = ['red', 'yellow', 'green', 'blue'];

interface UnoState {
  deck: UnoCard[];
  discard: UnoCard[];
  hands: Map<number, UnoCard[]>;
  currentColor: string;
  direction: 1 | -1;
  turnSeat: number;
  drawnThisTurn: boolean;
  turnTimer: NodeJS.Timeout | null;
  ranking: Array<{ userId: number; nickname: string; penalty: number }> | null;
}

const seatPlayers = (room: Room): { userId: number; nickname: string; seat: number }[] =>
  [...room.members.values()]
    .filter((m) => m.seat >= 0)
    .map((m) => ({ userId: m.userId, nickname: m.nickname, seat: m.seat }))
    .sort((a, b) => a.seat - b.seat);

const topCard = (st: UnoState): UnoCard => st.discard[st.discard.length - 1];

/** 发一张牌（牌堆空则重洗弃牌堆，保留顶牌） */
const drawCard = (st: UnoState): UnoCard | null => {
  if (st.deck.length === 0) {
    if (st.discard.length <= 1) return null;
    const top = st.discard.pop()!;
    st.deck = shuffle(st.discard);
    st.discard = [top];
  }
  return st.deck.pop() || null;
};

/** 按方向推进到下一个玩家座位（skip 再推进一次） */
const advance = (room: Room, st: UnoState, times = 1): void => {
  const seats = seatPlayers(room).map((p) => p.seat);
  if (seats.length === 0) return;
  const idx = seats.indexOf(st.turnSeat);
  let pos = idx;
  for (let i = 0; i < times; i += 1) {
    pos = (pos + st.direction + seats.length) % seats.length;
  }
  st.turnSeat = seats[pos];
};

const beginTurn = (room: Room, st: UnoState): void => {
  st.drawnThisTurn = false;
  const bus = getRoomBus();
  bus.broadcast(room, { t: 'uno_turn', seat: st.turnSeat, deadline: Date.now() + TURN_SECONDS * 1000 });
  if (st.turnTimer) clearTimeout(st.turnTimer);
  const timer = setTimeout(() => {
    const r = getRoom(room.id);
    if (!r) return;
    const s = r.game as UnoState;
    if (s.turnTimer !== timer) return; // 已被新一轮覆盖
    // 超时：自动摸 1 张并跳过
    const card = drawCard(s);
    const turnUser = seatPlayers(r).find((p) => p.seat === s.turnSeat);
    if (card && turnUser) {
      const hand = s.hands.get(turnUser.userId) || [];
      hand.push(card);
      s.hands.set(turnUser.userId, hand);
      busSendHand(r, turnUser.userId, hand);
    }
    advance(r, s, 1);
    beginTurn(r, s);
    emitState(r, s);
  }, TURN_SECONDS * 1000);
  st.turnTimer = timer;
  addTimer(room, timer);
};

const busSendHand = (room: Room, userId: number, hand: UnoCard[]): void => {
  getRoomBus().sendToUser(room, userId, { t: 'uno_hand', cards: hand });
};

const emitState = (room: Room, st: UnoState): void => {
  getRoomBus().broadcast(room, {
    t: 'uno_state',
    top: topCard(st),
    currentColor: st.currentColor,
    direction: st.direction,
    turnSeat: st.turnSeat,
    counts: seatPlayers(room).map((p) => ({ userId: p.userId, count: (st.hands.get(p.userId) || []).length })),
  });
};

export const unoHandler: GameHandler<UnoState> = {
  type: 'uno',
  title: 'UNO',
  emoji: '🎴',
  desc: '经典卡牌，颜色或数字对上就能出',
  minPlayers: 2,
  maxPlayers: 6,
  allowSpectators: true,
  rematchSwapSeats: false,

  create(): UnoState {
    return {
      deck: [],
      discard: [],
      hands: new Map(),
      currentColor: 'red',
      direction: 1,
      turnSeat: 0,
      drawnThisTurn: false,
      turnTimer: null,
      ranking: null,
    };
  },

  // 开局：发牌 + 翻出首张（数字牌），私发手牌
  start(room): ActionResult | void {
    const st = room.game as UnoState;
    if (st.turnTimer) clearTimeout(st.turnTimer);
    const players = seatPlayers(room);
    st.deck = shuffle(buildDeck());
    st.discard = [];
    st.hands = new Map();
    st.ranking = null;

    for (const p of players) {
      const hand: UnoCard[] = [];
      for (let i = 0; i < INITIAL_HAND; i += 1) {
        const c = st.deck.pop();
        if (c) hand.push(c);
      }
      st.hands.set(p.userId, hand);
    }

    // 翻首张：必须数字牌（避免首张功能牌的边界处理）
    let top = st.deck.pop()!;
    while (!isNumberCard(top)) {
      st.deck.unshift(top);
      top = st.deck.pop()!;
    }
    st.discard = [top];
    st.currentColor = top.color;
    st.direction = 1;

    const first = players[0];
    st.turnSeat = first.seat;
    st.drawnThisTurn = false;

    const toMember: NonNullable<ActionResult['toMember']> = players.map((p) => ({
      userId: p.userId,
      msg: { t: 'uno_hand', cards: st.hands.get(p.userId) || [] },
    }));

    const timer = setTimeout(() => {
      const r = getRoom(room.id);
      if (!r) return;
      const s = r.game as UnoState;
      if (s.turnTimer !== timer) return;
      const card = drawCard(s);
      const turnUser = seatPlayers(r).find((p) => p.seat === s.turnSeat);
      if (card && turnUser) {
        const hand = s.hands.get(turnUser.userId) || [];
        hand.push(card);
        s.hands.set(turnUser.userId, hand);
        busSendHand(r, turnUser.userId, hand);
      }
      advance(r, s, 1);
      beginTurn(r, s);
      emitState(r, s);
    }, TURN_SECONDS * 1000);
    st.turnTimer = timer;
    addTimer(room, timer);

    // 广播首回合
    getRoomBus().broadcast(room, { t: 'uno_turn', seat: st.turnSeat, deadline: Date.now() + TURN_SECONDS * 1000 });
    emitState(room, st);
    return { toMember };
  },

  onPlayerQuit(room: Room, member: Member): ActionResult | void {
    const st = room.game as UnoState;
    const hand = st.hands.get(member.userId);
    st.hands.delete(member.userId);
    const remaining = seatPlayers(room);
    if (remaining.length < 2 && room.phase === 'playing') {
      // 只剩一人：直接终局
      const last = remaining[0];
      const penalty = (st.hands.get(last?.userId || 0) || []).reduce((sum, c) => sum + cardScore(c), 0);
      st.ranking = [
        { userId: last?.userId || 0, nickname: last?.nickname || '', penalty },
      ];
      clearRoomTimers(room);
      if (st.turnTimer) clearTimeout(st.turnTimer);
      room.phase = 'ended';
      getRoomBus().broadcast(room, { t: 'uno_final', ranking: st.ranking, reason: '人数不足，提前结束' });
      return { ended: { winnerSeat: last?.seat ?? -1, reason: '人数不足，提前结束' } };
    }
    // 弃牌入弃牌堆（不可再出）
    if (hand && hand.length) {
      st.discard.push(...hand);
    }
    if (member.seat === st.turnSeat) {
      advance(room, st, 1);
      beginTurn(room, st);
    }
    emitState(room, st);
    return undefined;
  },

  onAction(room: Room, member: Member, action: string, payload: any): ActionResult {
    const st = room.game as UnoState;
    const seat = member.seat;
    const isMyTurn = seat === st.turnSeat && room.phase === 'playing';
    const hand = st.hands.get(member.userId) || [];

    if (action === 'uno_play') {
      if (!isMyTurn) return { error: '还没轮到你' };
      const cardId = String(payload?.cardId || '');
      const idx = hand.findIndex((c) => c.id === cardId);
      if (idx === -1) return { error: '你手里没有这张牌' };
      const card = hand[idx];
      if (!canPlay(card, topCard(st), st.currentColor)) return { error: '这张牌不符合出牌规则' };
      if (card.color === 'wild') {
        const choose = String(payload?.chooseColor || '');
        if (!UNO_COLORS.includes(choose as UnoColor)) return { error: '万能牌需要选择颜色' };
        st.currentColor = choose;
      } else {
        st.currentColor = card.color;
      }

      hand.splice(idx, 1);
      st.discard.push(card);
      st.hands.set(member.userId, hand);

      // 胜利判定：手牌出完
      if (hand.length === 0) {
        const ranking = seatPlayers(room)
          .filter((p) => p.userId !== member.userId)
          .map((p) => ({
            userId: p.userId,
            nickname: p.nickname,
            penalty: (st.hands.get(p.userId) || []).reduce((sum, c) => sum + cardScore(c), 0),
          }))
          .sort((a, b) => a.penalty - b.penalty);
        ranking.unshift({ userId: member.userId, nickname: member.nickname, penalty: 0 });
        st.ranking = ranking;
        clearRoomTimers(room);
        if (st.turnTimer) clearTimeout(st.turnTimer);
        room.phase = 'ended';
        getRoomBus().broadcast(room, { t: 'uno_final', ranking, reason: `${member.nickname} 出完了手牌` });
        getRoomBus().broadcast(room, { t: 'game_over', winnerSeat: seat, reason: `${member.nickname} 获胜` });
        emitState(room, st);
        return {};
      }

      // 功能牌效果
      let skipTimes = 1;
      let drawN = 0;
      if (card.kind === 'skip') skipTimes = 2;
      if (card.kind === 'reverse') {
        if (seatPlayers(room).length === 2) skipTimes = 2;
        else st.direction = (st.direction === 1 ? -1 : 1) as 1 | -1;
      }
      if (card.kind === 'draw2') {
        drawN = 2;
        skipTimes = 2;
      }
      if (card.kind === 'wild4') {
        drawN = 4;
        skipTimes = 2;
      }

      if (drawN > 0) {
        advance(room, st, 1);
        const victim = seatPlayers(room).find((p) => p.seat === st.turnSeat);
        if (victim) {
          for (let i = 0; i < drawN; i += 1) {
            const c = drawCard(st);
            if (c) {
              const vh = st.hands.get(victim.userId) || [];
              vh.push(c);
              st.hands.set(victim.userId, vh);
            }
          }
          const vh = st.hands.get(victim.userId) || [];
          busSendHand(room, victim.userId, vh);
        }
        advance(room, st, 1);
      } else {
        advance(room, st, skipTimes);
      }

      beginTurn(room, st);
      emitState(room, st);
      // 手牌可能已变化（出牌者少一张）
      busSendHand(room, member.userId, st.hands.get(member.userId) || []);
      getRoomBus().broadcast(room, { t: 'uno_played', userId: member.userId, card, chooseColor: card.color === 'wild' ? st.currentColor : null });
      return {};
    }

    if (action === 'uno_draw') {
      if (!isMyTurn) return { error: '还没轮到你' };
      if (st.drawnThisTurn) return { error: '本回合已经摸过牌' };
      const card = drawCard(st);
      if (!card) return { error: '没有牌可摸了' };
      hand.push(card);
      st.hands.set(member.userId, hand);
      st.drawnThisTurn = true;
      busSendHand(room, member.userId, hand);
      getRoomBus().broadcast(room, { t: 'uno_drew', userId: member.userId });
      emitState(room, st);
      return {};
    }

    if (action === 'uno_pass') {
      if (!isMyTurn) return { error: '还没轮到你' };
      if (!st.drawnThisTurn) return { error: '先摸一张牌才能跳过' };
      advance(room, st, 1);
      beginTurn(room, st);
      emitState(room, st);
      return {};
    }

    return { error: '未知的游戏操作' };
  },

  serializeFor(room: Room, viewer: Member): Record<string, unknown> {
    const st = room.game as UnoState;
    return {
      top: topCard(st),
      currentColor: st.currentColor,
      direction: st.direction,
      turnSeat: st.turnSeat,
      counts: seatPlayers(room).map((p) => ({ userId: p.userId, count: (st.hands.get(p.userId) || []).length })),
      myHand: st.hands.get(viewer.userId) || [],
      ranking: st.ranking,
    };
  },
};
