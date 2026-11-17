/**
 * useRoomEvents - 你画我猜事件处理
 */
import type { S2CDrawEvent } from '@children-games/shared';
import type { RoomEventContext, WsLike } from './types';
import type { DrawGameState, TotalRankingFinal } from '../wsTypes';

export function registerDraw(ws: WsLike, ctx: RoomEventContext) {
  const { myId, mySeat, game, gameEvents, phase } = ctx;

  ws.on('draw_round', (m: Extract<S2CDrawEvent, { t: 'draw_round' }>) => {
    gameEvents.round = { ...m, ts: Date.now() };
    gameEvents.stroke = null;
    gameEvents.final = null;
    gameEvents.hint = null;
    gameEvents.guessResult = [];
    if (game.value && typeof game.value === 'object') {
      const drawState = game.value as DrawGameState;
      drawState.phase = m.phase;
      drawState.drawerSeat = m.drawerSeat;
      drawState.isDrawer = mySeat.value >= 0 && m.drawerSeat === mySeat.value;
      drawState.round = m.round;
      drawState.totalRounds = m.totalRounds;
      drawState.deadline = m.deadline || 0;
      drawState.wordLen = m.wordLen || 0;
      drawState.category = m.category || '';
      drawState.word = null;
      drawState.strokes = [];
      drawState.myGuessed = false;
      drawState.guessedUserIds = [];
    }
  });

  ws.on('guess_result', (m: Extract<S2CDrawEvent, { t: 'guess_result' }>) => {
    const list = Array.isArray(gameEvents.guessResult) ? gameEvents.guessResult : [];
    list.push(m);
    gameEvents.guessResult = list;
    if (m.userId === myId.value && game.value && typeof game.value === 'object') {
      const drawState = game.value as DrawGameState;
      drawState.myGuessed = true;
      if (Array.isArray(drawState.guessedUserIds)) drawState.guessedUserIds.push(m.userId);
    }
  });

  ws.on('draw_candidates', (m: Extract<S2CDrawEvent, { t: 'draw_candidates' }>) => {
    gameEvents.candidates = m.words || [];
  });

  ws.on('draw_word', (m: Extract<S2CDrawEvent, { t: 'draw_word' }>) => {
    if (game.value && typeof game.value === 'object') {
      (game.value as DrawGameState).word = m.word;
    }
  });

  ws.on('draw_hint', (m: Extract<S2CDrawEvent, { t: 'draw_hint' }>) => {
    gameEvents.hint = m;
  });

  ws.on('draw_stroke', (m: Extract<S2CDrawEvent, { t: 'draw_stroke' }>) => {
    gameEvents.stroke = m;
  });

  ws.on('draw_undo', () => {
    gameEvents.undo = { ts: Date.now() };
  });

  ws.on('draw_clear', () => {
    gameEvents.clear = { ts: Date.now() };
  });

  ws.on('draw_round_end', (m: Extract<S2CDrawEvent, { t: 'draw_round_end' }>) => {
    gameEvents.roundEnd = m;
  });

  ws.on('draw_final', (m: TotalRankingFinal) => {
    gameEvents.final = m;
    phase.value = 'ended';
  });
}
