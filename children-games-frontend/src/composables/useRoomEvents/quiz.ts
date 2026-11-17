/**
 * useRoomEvents - 答题对战事件处理
 */
import type { RoomEventContext, WsLike } from './types';
import type { QuizQuestionEvent, QuizResultEvent, TotalRankingFinal } from '../wsTypes';

export function registerQuiz(ws: WsLike, ctx: RoomEventContext) {
  const { gameEvents } = ctx;

  ws.on('quiz_question', (m: QuizQuestionEvent) => {
    gameEvents.question = m;
    gameEvents.result = null;
    gameEvents.final = null;
  });

  ws.on('quiz_result', (m: QuizResultEvent) => {
    gameEvents.result = m;
  });

  ws.on('quiz_final', (m: TotalRankingFinal) => {
    gameEvents.final = m;
  });
}
