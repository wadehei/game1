// 游戏注册表：新增对战游戏时在此登记 handler 即可
import type { GameHandler, GameType } from './types';

export type { GameType };
import { gomokuHandler } from './gomoku';
import { quizHandler } from './quiz';

export const gameHandlers: Partial<Record<GameType, GameHandler>> = {
  gomoku: gomokuHandler,
  quiz: quizHandler,
};

export const getHandler = (type: GameType): GameHandler => {
  const handler = gameHandlers[type];
  if (!handler) throw new Error(`未注册的游戏类型: ${type}`);
  return handler;
};

export const gameList = (): Array<Pick<GameHandler, 'type' | 'title' | 'emoji' | 'desc' | 'minPlayers' | 'maxPlayers'>> =>
  Object.values(gameHandlers).map((h) => ({
    type: h.type,
    title: h.title,
    emoji: h.emoji,
    desc: h.desc,
    minPlayers: h.minPlayers,
    maxPlayers: h.maxPlayers,
  }));
