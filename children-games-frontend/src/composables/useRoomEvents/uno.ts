/**
 * useRoomEvents - UNO 事件处理
 */
import type { S2CUnoEvent } from '@children-games/shared';
import type { RoomEventContext, WsLike } from './types';
import type {
  UnoGameState,
  UnoStateEvent,
  UnoPlayedEvent,
  UnoDrewEvent,
  UnoFinalEvent,
} from '../wsTypes';

export function registerUno(ws: WsLike, ctx: RoomEventContext) {
  const { game, gameEvents, phase } = ctx;

  ws.on('uno_state', (m: UnoStateEvent) => {
    gameEvents.uno_state = m;
    gameEvents.turn = { seat: m.turnSeat, seq: Date.now() };
    if (game.value && typeof game.value === 'object') {
      const unoState = game.value as UnoGameState;
      unoState.top = m.top;
      unoState.currentColor = m.currentColor;
      unoState.direction = m.direction;
      unoState.turnSeat = m.turnSeat;
      unoState.counts = m.counts;
    }
  });

  ws.on('uno_turn', (m: Extract<S2CUnoEvent, { t: 'uno_turn' }>) => {
    gameEvents.turn = { ...m, seq: Date.now() };
    if (game.value && typeof game.value === 'object') {
      (game.value as UnoGameState).turnSeat = m.seat;
    }
  });

  ws.on('uno_played', (m: UnoPlayedEvent) => {
    gameEvents.uno_played = m;
    if (game.value && typeof game.value === 'object') {
      const unoState = game.value as UnoGameState;
      unoState.top = m.card;
      if (m.chooseColor) unoState.currentColor = m.chooseColor;
    }
  });

  ws.on('uno_hand', (m: Extract<S2CUnoEvent, { t: 'uno_hand' }>) => {
    gameEvents.uno_hand = m;
  });

  ws.on('uno_drew', (m: UnoDrewEvent) => {
    gameEvents.drew = { ...m, seq: Date.now() };
  });

  ws.on('uno_final', (m: UnoFinalEvent) => {
    gameEvents.final = m;
    phase.value = 'ended';
  });
}
