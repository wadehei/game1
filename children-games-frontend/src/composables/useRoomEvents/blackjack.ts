/**
 * useRoomEvents - 21点事件处理
 */
import { soundManager } from '@/utils/sound';
import type { S2CBlackjackEvent } from '@children-games/shared';
import type { RoomEventContext, WsLike } from './types';
import type {
  BlackjackGameState,
  BlackjackActionEvent,
  BlackjackPhaseEvent,
  ChipsRankingFinal,
} from '../wsTypes';

export function registerBlackjack(ws: WsLike, ctx: RoomEventContext) {
  const { myId, mySeat, members, game, gameEvents, phase } = ctx;

  const seatOfUser = (userId: number): number =>
    members.value.find((m) => m.userId === userId)?.seat ?? -1;

  const bjEntry = (userId: number, round: number) => {
    if (!game.value || typeof game.value !== 'object') return null;
    const bjState = game.value as BlackjackGameState;
    const log: Array<{
      userId: number;
      round: number;
      stake: number;
      doubled: boolean;
      delta: number | null;
      outcome: string | null;
    }> = bjState.betLedger || [];
    let entry = log.find((e) => e.userId === userId && e.round === round && e.delta === null);
    if (!entry) {
      entry = { userId, round, stake: 0, doubled: false, delta: null, outcome: null };
      bjState.betLedger = [...log, entry];
    }
    return entry;
  };

  ws.on('blackjack_phase', (m: BlackjackPhaseEvent) => {
    if (game.value && typeof game.value === 'object') {
      const bjState = game.value as BlackjackGameState;
      const newRound = bjState.round !== m.round;
      bjState.round = m.round;
      bjState.totalRounds = m.totalRounds;
      bjState.phase = m.phase;
      bjState.bankerSeat = m.bankerSeat;
      bjState.turnSeat = m.turnSeat;
      bjState.deadline = m.deadline || 0;
      bjState.chips = m.chips || bjState.chips;
      bjState.canPassBank = !!m.canPassBank;
      if (Array.isArray(m.betOptions)) bjState.betOptions = m.betOptions;
      bjState.isBanker = m.bankerSeat === mySeat.value;
      if (newRound && m.phase === 'betting') {
        gameEvents.handsView = [];
        bjState.myCards = [];
        bjState.myStake = 0;
        bjState.myDone = false;
        bjState.myBusted = false;
        bjState.myNatural = false;
        bjState.myDoubled = false;
        bjState.bankerCards = [];
        bjState.bankerValue = null;
        bjState.lastResults = null;
      }
    }
  });

  ws.on('blackjack_deal', (m: Extract<S2CBlackjackEvent, { t: 'blackjack_deal' }>) => {
    soundManager.playDeal();
    gameEvents.handsView = (m.hands || []).map((h) => ({
      ...h,
      seat: seatOfUser(h.userId),
      done: !!h.natural,
      busted: false,
    }));
    const mine = (m.hands || []).find((h) => h.userId === myId.value);
    if (game.value && typeof game.value === 'object') {
      const bjState = game.value as BlackjackGameState;
      bjState.myCards = mine ? [...mine.cards] : [];
      bjState.myStake = mine?.stake || 0;
      bjState.myNatural = !!mine?.natural;
      bjState.myDone = !!mine?.natural;
      if (bjState.isBanker) {
        bjState.bankerCards = m.bankerUpcard ? [m.bankerUpcard] : [];
      } else {
        bjState.bankerCards = m.bankerUpcard ? [m.bankerUpcard] : [];
      }
    }
  });

  ws.on(
    'blackjack_your_banker',
    (m: Extract<S2CBlackjackEvent, { t: 'blackjack_your_banker' }>) => {
      if (game.value && typeof game.value === 'object') {
        (game.value as BlackjackGameState).bankerCards = m.cards || [];
      }
    }
  );

  ws.on('blackjack_action', (m: BlackjackActionEvent) => {
    if (!game.value || typeof game.value !== 'object') return;
    const bjState = game.value as BlackjackGameState;
    if (m.action === 'banker_hit') {
      bjState.bankerCards = [...(bjState.bankerCards || []), m.card as string];
      bjState.bankerValue = m.total;
      return;
    }
    if (m.action === 'hit' || m.action === 'double') {
      const finished = m.action === 'double' || !!m.busted || m.total === 21;
      if (m.userId === myId.value) {
        bjState.myCards = [...(bjState.myCards || []), m.card as string];
        if (m.action === 'double') bjState.myStake = m.stake;
        bjState.myDone = finished;
        bjState.myBusted = !!m.busted;
      }
      if (m.action === 'double') {
        gameEvents.doubled = { userId: m.userId, stake: m.stake ?? 0, seq: Date.now() };
        const entry = bjEntry(m.userId, bjState.round);
        if (entry) {
          entry.stake = m.stake ?? entry.stake;
          entry.doubled = true;
        }
      }
      const item = (gameEvents.handsView || []).find(
        (x: { userId: number }) => x.userId === m.userId
      );
      if (item && m.userId !== myId.value) {
        item.cards = [...(item.cards || []), ...(m.card ? [m.card] : [])];
        item.done = finished;
        item.busted = !!m.busted;
      } else if (item) {
        item.done = finished;
        item.busted = !!m.busted;
      }
      return;
    }
    if (m.action === 'stand') {
      if (m.userId === myId.value) bjState.myDone = true;
      const item = (gameEvents.handsView || []).find(
        (x: { userId: number }) => x.userId === m.userId
      );
      if (item) item.done = true;
      return;
    }
    if (m.action === 'bet' && m.stake) {
      soundManager.playChip();
      const entry = bjEntry(m.userId, bjState.round);
      if (entry) entry.stake = m.stake;
      const item = (gameEvents.handsView || []).find(
        (x: { userId: number }) => x.userId === m.userId
      );
      if (item) item.stake = m.stake;
    }
  });

  ws.on('blackjack_settle', (m: Extract<S2CBlackjackEvent, { t: 'blackjack_settle' }>) => {
    if (game.value && typeof game.value === 'object') {
      const bjState = game.value as BlackjackGameState;
      bjState.lastResults = m.results || [];
      bjState.chips = m.chips || bjState.chips;
      bjState.bankerCards = m.bankerCards || [];
      bjState.bankerValue = m.bankerValue ?? bjState.bankerValue;
      bjState.phase = 'settle';
      for (const r of m.results || []) {
        const entry = (bjState.betLedger || []).find(
          (e) => e.userId === r.userId && e.round === m.round && e.delta === null
        );
        if (entry) {
          entry.delta = r.delta;
          entry.outcome = r.outcome;
        }
      }
      bjState.nextDeadline = m.nextDeadline || 0;
      const mySettle = (m.results || []).find((r) => r.userId === myId.value);
      if (mySettle) {
        if (mySettle.delta > 0) soundManager.playSuccess();
        else if (mySettle.delta < 0) soundManager.playFail();
      }
    }
    for (const r of m.results || []) {
      const item = (gameEvents.handsView || []).find(
        (x: { userId: number }) => x.userId === r.userId
      );
      if (item) {
        item.done = true;
        if (r.outcome === 'bust') item.busted = true;
        if (r.outcome === 'blackjack') item.natural = true;
      }
    }
  });

  ws.on('blackjack_final', (m: ChipsRankingFinal) => {
    gameEvents.final = m;
    phase.value = 'ended';
  });
}
