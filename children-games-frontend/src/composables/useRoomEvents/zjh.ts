/**
 * useRoomEvents - 炸金花事件处理
 */
import { soundManager } from '@/utils/sound';
import type { S2CZjhEvent } from '@children-games/shared';
import type { RoomEventContext, WsLike } from './types';
import type {
  ZjhGameState,
  ZjhPhaseEvent,
  ZjhYourCardsEvent,
  ChipsRankingFinal,
  ZjhComparePayload,
} from '../wsTypes';

export function registerZjh(ws: WsLike, ctx: RoomEventContext) {
  const { myId, members, game, gameEvents, phase } = ctx;

  const resetZjhOthers = () => {
    if (game.value && typeof game.value === 'object') {
      const zjhState = game.value as ZjhGameState;
      zjhState.others = members.value
        .filter((m) => m.seat >= 0 && m.userId !== myId.value)
        .map((m) => ({
          userId: m.userId,
          nickname: m.nickname,
          seat: m.seat,
          seen: false,
          folded: false,
          allIn: false,
          betTotal: 10,
        }));
    }
  };

  ws.on('zjh_phase', (m: ZjhPhaseEvent) => {
    if (game.value && typeof game.value === 'object') {
      const zjhState = game.value as ZjhGameState;
      const newHand = zjhState.round !== m.round;
      zjhState.round = m.round;
      zjhState.totalRounds = m.totalRounds;
      zjhState.phase = m.phase;
      zjhState.dealerSeat = m.dealerSeat;
      zjhState.pot = m.pot;
      zjhState.stake = m.stake;
      zjhState.roundNo = m.roundNo;
      zjhState.turnSeat = m.turnSeat;
      zjhState.deadline = m.deadline || 0;
      zjhState.compareMinRound = m.compareMinRound || 3;
      zjhState.aliveCount = m.aliveCount;
      zjhState.chips = m.chips || zjhState.chips;
      if (Array.isArray(m.raiseSteps)) zjhState.raiseSteps = m.raiseSteps;
      if (typeof m.stakeCap === 'number') zjhState.stakeCap = m.stakeCap;
      if (newHand && m.phase === 'betting') {
        zjhState.myCards = null;
        zjhState.mySeen = false;
        zjhState.myFolded = false;
        zjhState.myAllIn = false;
        zjhState.myBetTotal = 10;
        zjhState.myRank = null;
        gameEvents.showdown = null;
        gameEvents.settle = null;
        gameEvents.compareCards = null;
        resetZjhOthers();
        if (Array.isArray(m.entrants)) {
          const log: Array<{
            userId: number;
            round: number;
            betTotal: number;
            delta: number | null;
            ended: string | null;
          }> = zjhState.betLedger || [];
          for (const uid of m.entrants) {
            if (!log.some((e) => e.userId === uid && e.round === m.round)) {
              log.push({ userId: uid, round: m.round, betTotal: 10, delta: null, ended: null });
            }
          }
          zjhState.betLedger = [...log];
        }
      }
    }
  });

  ws.on('zjh_your_cards', (m: ZjhYourCardsEvent) => {
    if (game.value && typeof game.value === 'object') {
      const zjhState = game.value as ZjhGameState;
      zjhState.myCards = m.cards || [];
      zjhState.mySeen = true;
      zjhState.myRank = m.rank || null;
      soundManager.playFlip();
    }
  });

  ws.on('zjh_action', (m: Extract<S2CZjhEvent, { t: 'zjh_action' }>) => {
    if (!game.value || typeof game.value !== 'object') return;
    const zjhState = game.value as ZjhGameState;
    const others = zjhState.others || [];
    if (m.action === 'look') {
      const o = others.find((x) => x.userId === m.userId);
      if (o) o.seen = true;
      return;
    }
    if (m.action === 'call' || m.action === 'timeout_call') {
      zjhState.pot = m.pot ?? zjhState.pot;
      zjhState.stake = m.stake ?? zjhState.stake;
      if (m.action === 'call') soundManager.playChip();
      const o = others.find((x) => x.userId === m.userId);
      if (o) {
        o.betTotal = (o.betTotal || 0) + (m.cost || 0);
        if (m.allIn) o.allIn = true;
      }
      const entry = (zjhState.betLedger || []).find(
        (e) => e.userId === m.userId && e.round === zjhState.round && e.delta === null
      );
      if (entry) entry.betTotal += m.cost || 0;
      return;
    }
    if (m.action === 'fold' || m.action === 'timeout_fold') {
      const o = others.find((x) => x.userId === m.userId);
      if (o) o.folded = true;
      zjhState.aliveCount = m.aliveCount ?? zjhState.aliveCount;
      if (m.userId === myId.value) zjhState.myFolded = true;
    }
  });

  ws.on('zjh_compare', (m: Extract<S2CZjhEvent, { t: 'zjh_compare' }>) => {
    if (!game.value || typeof game.value !== 'object') return;
    const zjhState = game.value as ZjhGameState;
    const others = zjhState.others || [];
    const loser = others.find((x) => x.userId === m.loser);
    if (loser) loser.folded = true;
    const winner = others.find((x) => x.userId === m.winner);
    if (winner) winner.seen = true;
    const prevPot = zjhState.pot || 0;
    zjhState.pot = m.pot ?? zjhState.pot;
    zjhState.aliveCount = m.aliveCount ?? zjhState.aliveCount;
    if (m.loser === myId.value) zjhState.myFolded = true;
    const cmpLog: Array<{
      userId: number;
      round: number;
      betTotal: number;
      delta: number | null;
      ended: string | null;
    }> = zjhState.betLedger || [];
    const cmpEntry = cmpLog.find(
      (e) => e.userId === m.from && e.round === zjhState.round && e.delta === null
    );
    if (cmpEntry)
      cmpEntry.betTotal +=
        typeof m.cost === 'number' ? m.cost : Math.max(0, (m.pot || 0) - prevPot);
    gameEvents.yanpai = { from: m.from, to: m.to, seq: Date.now() };
    gameEvents.compare = { ...m, seq: Date.now() } as ZjhComparePayload & { seq: number };
    zjhState.compareLog = [
      ...(zjhState.compareLog || []),
      { round: zjhState.round, from: m.from, to: m.to, winner: m.winner, seq: Date.now() },
    ];
  });

  ws.on('zjh_compare_cards', (m: Extract<S2CZjhEvent, { t: 'zjh_compare_cards' }>) => {
    gameEvents.compareCards = m;
  });

  ws.on('zjh_showdown', (m: Extract<S2CZjhEvent, { t: 'zjh_showdown' }>) => {
    gameEvents.showdown = m;
    if (game.value && typeof game.value === 'object') {
      (game.value as ZjhGameState).phase = 'showdown';
    }
  });

  ws.on('zjh_settle', (m: Extract<S2CZjhEvent, { t: 'zjh_settle' }>) => {
    gameEvents.settle = m;
    if (game.value && typeof game.value === 'object') {
      const zjhState = game.value as ZjhGameState;
      zjhState.pot = 0;
      zjhState.phase = 'settle';
      zjhState.nextDeadline = m.nextDeadline || 0;
      if (Array.isArray(m.deltas)) {
        zjhState.chips = m.deltas.map((d) => ({ userId: d.userId, chips: d.chips }));
        const meDelta = m.deltas.find((d) => d.userId === myId.value);
        if (meDelta) zjhState.myChips = meDelta.chips;
        const othersNow = zjhState.others || [];
        const isFolded = (uid: number) =>
          uid === myId.value
            ? zjhState.myFolded
            : !!othersNow.find((x) => x.userId === uid)?.folded;
        for (const d of m.deltas) {
          const entry = (zjhState.betLedger || []).find(
            (e) => e.userId === d.userId && e.round === m.round && e.delta === null
          );
          if (entry) {
            entry.delta = d.delta;
            entry.ended = m.winner === d.userId ? 'win' : isFolded(d.userId) ? 'fold' : 'showdown';
          }
        }
      }
      const meInDeltas = Array.isArray(m.deltas)
        ? m.deltas.find((d) => d.userId === myId.value)
        : null;
      if (meInDeltas) {
        if (meInDeltas.delta > 0) soundManager.playSuccess();
        else if (meInDeltas.delta < 0) soundManager.playFail();
      }
    }
  });

  ws.on('zjh_final', (m: ChipsRankingFinal) => {
    gameEvents.final = m;
    phase.value = 'ended';
  });
}
