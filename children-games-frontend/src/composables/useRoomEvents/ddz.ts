/**
 * useRoomEvents - 斗地主事件处理
 */
import { soundManager } from '@/utils/sound';
import { showToast } from '@/utils/toastBus';
import type { S2CDdzEvent } from '@children-games/shared';
import type { RoomEventContext, WsLike } from './types';
import type { DdzGameState, ChipsRankingFinal } from '../wsTypes';

export function registerDdz(ws: WsLike, ctx: RoomEventContext) {
  const { myId, mySeat, members, game, gameEvents, phase } = ctx;

  const resetDdzOthers = () => {
    if (game.value && typeof game.value === 'object') {
      const ddzState = game.value as DdzGameState;
      ddzState.others = members.value
        .filter((m) => m.seat >= 0 && m.userId !== myId.value)
        .map((m) => ({
          userId: m.userId,
          nickname: m.nickname,
          seat: m.seat,
          cardCount: 17,
          isLandlord: false,
          bid: null,
        }));
    }
  };

  ws.on('ddz_phase', (m: Extract<S2CDdzEvent, { t: 'ddz_phase' }>) => {
    gameEvents.ddz_phase = m;
    if (game.value && typeof game.value === 'object') {
      const ddzState = game.value as DdzGameState;
      const newRound = ddzState.round !== m.round;
      ddzState.round = m.round;
      ddzState.totalRounds = m.totalRounds;
      ddzState.phase = m.phase;
      ddzState.turnSeat = m.turnSeat;
      ddzState.leadSeat = m.leadSeat;
      ddzState.bidStartSeat = m.bidStartSeat;
      ddzState.bidBestScore = m.bidBestScore;
      ddzState.bidBase = m.bidBase;
      ddzState.baseUnit = m.baseUnit;
      ddzState.multiplier = m.multiplier;
      ddzState.landlordSeat = m.landlordSeat;
      ddzState.bottomCards = m.bottomCards ?? null;
      ddzState.lastPlay = m.lastPlay ?? null;
      ddzState.deadline = m.deadline || 0;
      ddzState.chips = m.chips || ddzState.chips;
      if (newRound && m.phase === 'bidding') {
        ddzState.myCards = [];
        ddzState.myBid = null;
        ddzState.myRole = null;
        gameEvents.ddz_settle = null;
        gameEvents.ddz_bottom = null;
        gameEvents.ddz_play = null;
        resetDdzOthers();
      }
      if (m.phase === 'playing' && m.landlordSeat !== null) {
        const others = ddzState.others || [];
        const lm = others.find((o) => o.seat === m.landlordSeat);
        if (lm) {
          lm.isLandlord = true;
          lm.cardCount = 20;
        }
        for (const o of others) {
          if (o.userId !== lm?.userId) o.cardCount = 17;
        }
      }
    }
  });

  ws.on('ddz_your_cards', (m: Extract<S2CDdzEvent, { t: 'ddz_your_cards' }>) => {
    gameEvents.ddz_your_cards = m;
    if (game.value && typeof game.value === 'object') {
      (game.value as DdzGameState).myCards = m.cards || [];
    }
  });

  ws.on('ddz_bid', (m: Extract<S2CDdzEvent, { t: 'ddz_bid' }>) => {
    gameEvents.ddz_bid = m;
    if (game.value && typeof game.value === 'object') {
      const ddzState = game.value as DdzGameState;
      ddzState.bidBestScore = m.bestScore;
      if (m.userId === myId.value) ddzState.myBid = m.score;
      const other = (ddzState.others || []).find((o) => o.userId === m.userId);
      if (other) other.bid = m.score;
    }
  });

  ws.on('ddz_redeal', (m: Extract<S2CDdzEvent, { t: 'ddz_redeal' }>) => {
    gameEvents.ddz_redeal = m;
    showToast('三家都不叫，重新发牌');
  });

  ws.on('ddz_bottom', (m: Extract<S2CDdzEvent, { t: 'ddz_bottom' }>) => {
    gameEvents.ddz_bottom = m;
    if (game.value && typeof game.value === 'object') {
      const ddzState = game.value as DdzGameState;
      ddzState.bottomCards = m.cards;
      ddzState.landlordSeat = m.landlordSeat;
      const lm = (ddzState.others || []).find((o) => o.seat === m.landlordSeat);
      if (lm) {
        lm.isLandlord = true;
        lm.cardCount = 20;
      }
      if (mySeat.value === m.landlordSeat) ddzState.myRole = 'landlord';
      else if (ddzState.myRole !== 'landlord') ddzState.myRole = 'farmer';
    }
  });

  ws.on('ddz_play', (m: Extract<S2CDdzEvent, { t: 'ddz_play' }>) => {
    gameEvents.ddz_play = m;
    if (game.value && typeof game.value === 'object') {
      const ddzState = game.value as DdzGameState;
      ddzState.lastPlay = {
        seat: m.seat,
        userId: m.userId,
        cards: m.cards,
        cardType: m.cardType,
      };
      ddzState.multiplier = m.multiplier;
      const other = (ddzState.others || []).find((o) => o.userId === m.userId);
      if (other) other.cardCount = m.remain;
      if (m.userId === myId.value) {
        const mine = ddzState.myCards || [];
        const played = [...m.cards];
        ddzState.myCards = mine.filter((c) => {
          const idx = played.indexOf(c);
          if (idx >= 0) {
            played.splice(idx, 1);
            return false;
          }
          return true;
        });
      }
    }
  });

  ws.on('ddz_pass', (m: Extract<S2CDdzEvent, { t: 'ddz_pass' }>) => {
    gameEvents.ddz_pass = m;
  });

  ws.on('ddz_settle', (m: Extract<S2CDdzEvent, { t: 'ddz_settle' }>) => {
    gameEvents.ddz_settle = m;
    if (game.value && typeof game.value === 'object') {
      const ddzState = game.value as DdzGameState;
      ddzState.phase = 'settle';
      ddzState.turnSeat = -1;
      ddzState.bottomCards = m.bottomCards;
      if (Array.isArray(m.deltas)) {
        ddzState.chips = m.deltas.map((d) => ({ userId: d.userId, chips: d.chips }));
        const log = ddzState.betLedger || [];
        for (const d of m.deltas) {
          if (!log.some((e) => e.userId === d.userId && e.round === m.round)) {
            log.push({
              userId: d.userId,
              round: m.round,
              bid: m.bid,
              multiplier: m.multiplier,
              role: d.role,
              delta: d.delta,
              ended:
                d.role === 'landlord'
                  ? m.landlordWin
                    ? '地主胜'
                    : '地主负'
                  : m.landlordWin
                    ? '农民负'
                    : '农民胜',
            });
          }
        }
        ddzState.betLedger = [...log];
        const meInDeltas = m.deltas.find((d) => d.userId === myId.value);
        if (meInDeltas) {
          if (meInDeltas.delta > 0) soundManager.playSuccess();
          else if (meInDeltas.delta < 0) soundManager.playFail();
        }
      }
    }
  });

  ws.on('ddz_error', (m: Extract<S2CDdzEvent, { t: 'ddz_error' }>) => {
    gameEvents.ddz_error = m;
    showToast(m.error || '操作无效');
  });

  ws.on('ddz_final', (m: ChipsRankingFinal) => {
    gameEvents.final = m;
    phase.value = 'ended';
  });
}
