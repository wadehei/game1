// 游戏注册表：新增对战游戏时在此登记 handler 即可
import type { GameHandler, GameType } from './types';

export type { GameType };
import { gomokuHandler } from './gomoku';
import { quizHandler } from './quiz';
import { drawHandler } from './draw';
import { spyHandler } from './spy';
import { unoHandler } from './uno';
import { blackjackHandler } from './blackjack';
import { zjhHandler } from './zjh';

export const gameHandlers: Partial<Record<GameType, GameHandler>> = {
  gomoku: gomokuHandler,
  quiz: quizHandler,
  draw: drawHandler,
  spy: spyHandler,
  uno: unoHandler,
  blackjack: blackjackHandler,
  zjh: zjhHandler,
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
