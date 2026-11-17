/**
 * useRoomEvents - 卧底事件处理
 */
import type { S2CSpyEvent } from '@children-games/shared';
import type { RoomEventContext, WsLike } from './types';
import type { SpyGameState, SpyVoteResultEvent } from '../wsTypes';

export function registerSpy(ws: WsLike, ctx: RoomEventContext) {
  const { game, gameEvents, phase } = ctx;

  ws.on('spy_phase', (m: Extract<S2CSpyEvent, { t: 'spy_phase' }>) => {
    gameEvents.phase = m;
    if (game.value && typeof game.value === 'object') {
      const spyState = game.value as SpyGameState;
      spyState.phase = m.phase;
      spyState.deadline = m.deadline || 0;
      spyState.alive = m.alive || spyState.alive;
      spyState.isRevote = !!m.isRevote;
      spyState.revotePool = m.revotePool || null;
      spyState.votedCount = 0;
      spyState.total = (m.alive || []).length;
    }
  });

  ws.on('spy_deal', (m: Extract<S2CSpyEvent, { t: 'spy_deal' }>) => {
    gameEvents.deal = m;
  });

  ws.on('spy_vote_update', (m: Extract<S2CSpyEvent, { t: 'spy_vote_update' }>) => {
    gameEvents.voteUpdate = m;
    if (game.value && typeof game.value === 'object') {
      const spyState = game.value as SpyGameState;
      spyState.votedCount = m.votedCount;
      spyState.total = m.total;
    }
  });

  ws.on('spy_vote_result', (m: SpyVoteResultEvent) => {
    gameEvents.voteResult = m;
  });

  ws.on('spy_eliminated', (m: Extract<S2CSpyEvent, { t: 'spy_eliminated' }>) => {
    gameEvents.eliminated = m;
  });

  ws.on('spy_final', (m: Extract<S2CSpyEvent, { t: 'spy_final' }>) => {
    gameEvents.final = m;
    phase.value = 'ended';
  });
}
