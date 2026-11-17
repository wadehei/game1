/**
 * 斗地主 AI 逻辑
 * 支持三种难度：easy / normal / hard
 */

import { Card, CardPattern, PatternResult, AIDifficulty } from './types';
import { findBeatingPlays, findAllPossiblePlays, analyzePattern } from './pattern';
import { getValueCounts } from './deck';

/** 游戏状态上下文（用于 AI 决策） */
export interface AIContext {
  /** 各玩家剩余手牌数 [player0, player1, player2] */
  handSizes: [number, number, number];
  /** 已出的牌（用于记牌） */
  playedCards?: Card[];
  /** 当前倍数 */
  multiplier?: number;
}

/**
 * AI 出牌决策
 */
export function decideAIPlay(
  hand: Card[],
  lastPlay: PatternResult | null,
  lastActivePlayer: number,
  currentPlayer: number,
  landlordPlayer: number,
  difficulty: AIDifficulty,
  context?: AIContext
): Card[] | null {
  switch (difficulty) {
    case 'easy':
      return easyAI(hand, lastPlay, lastActivePlayer, currentPlayer);
    case 'normal':
      return normalAI(hand, lastPlay, lastActivePlayer, currentPlayer, landlordPlayer, context);
    case 'hard':
      return hardAI(hand, lastPlay, lastActivePlayer, currentPlayer, landlordPlayer, context);
  }
}

/**
 * 简单 AI：随机出牌，不主动出炸弹
 */
function easyAI(
  hand: Card[],
  lastPlay: PatternResult | null,
  lastActivePlayer: number,
  currentPlayer: number
): Card[] | null {
  // 自由出牌（上家是自己或没人出过）
  if (!lastPlay || lastActivePlayer === currentPlayer) {
    // 随机出最小的单张或对子
    const plays = findAllPossiblePlays(hand).filter(
      (p) => p.pattern !== CardPattern.Bomb && p.pattern !== CardPattern.Rocket
    );

    if (plays.length === 0) return null;

    // 优先出小牌
    const sorted = plays.sort((a, b) => a.mainValue - b.mainValue);
    return sorted[0].cards;
  }

  // 跟牌：找能打过且不是炸弹的
  const beating = findBeatingPlays(hand, lastPlay).filter(
    (p) => p.pattern !== CardPattern.Bomb && p.pattern !== CardPattern.Rocket
  );

  if (beating.length === 0) {
    // 30% 概率出炸弹
    if (Math.random() < 0.3) {
      const bombs = findBeatingPlays(hand, lastPlay);
      if (bombs.length > 0) {
        return bombs[0].cards;
      }
    }
    return null; // pass
  }

  // 随机选一个
  return beating[Math.floor(Math.random() * beating.length)].cards;
}

/**
 * 普通 AI：基本策略，会配合队友
 */
function normalAI(
  hand: Card[],
  lastPlay: PatternResult | null,
  lastActivePlayer: number,
  currentPlayer: number,
  landlordPlayer: number,
  context?: AIContext
): Card[] | null {
  const isLandlord = currentPlayer === landlordPlayer;
  const lastWasTeammate =
    !isLandlord && lastActivePlayer !== landlordPlayer && lastActivePlayer !== currentPlayer;

  // 获取对手手牌数（有上下文时用真实值）
  const opponentHandSize = context ? getMinOpponentHandSize(context.handSizes, currentPlayer) : 10;

  // 自由出牌
  if (!lastPlay || lastActivePlayer === currentPlayer) {
    return chooseLeadPlay(hand, isLandlord, opponentHandSize);
  }

  // 队友出的牌，不一定要管
  if (lastWasTeammate) {
    // 80% 概率不管（除非自己手牌很少想快速出完）
    if (hand.length > 4 && Math.random() < 0.8) {
      return null;
    }
  }

  const beating = findBeatingPlays(hand, lastPlay);

  if (beating.length === 0) return null;

  // 过滤掉炸弹（除非对手牌少或自己手牌少）
  const nonBombs = beating.filter(
    (p) => p.pattern !== CardPattern.Bomb && p.pattern !== CardPattern.Rocket
  );

  if (nonBombs.length > 0) {
    // 出最小的能打过的
    const sorted = nonBombs.sort((a, b) => a.mainValue - b.mainValue);
    return sorted[0].cards;
  }

  // 只剩炸弹了，手牌少于6张或对手牌少时考虑出
  if (hand.length <= 6 || opponentHandSize <= 4) {
    return beating[0].cards;
  }

  return null;
}

/**
 * 困难 AI：高级策略，记牌、算牌、配合
 */
function hardAI(
  hand: Card[],
  lastPlay: PatternResult | null,
  lastActivePlayer: number,
  currentPlayer: number,
  landlordPlayer: number,
  context?: AIContext
): Card[] | null {
  const isLandlord = currentPlayer === landlordPlayer;
  const lastWasTeammate =
    !isLandlord && lastActivePlayer !== landlordPlayer && lastActivePlayer !== currentPlayer;

  // 获取对手信息（有上下文时用真实值）
  const opponentHandSize = context ? getMinOpponentHandSize(context.handSizes, currentPlayer) : 10;
  const landlordHandSize = context ? context.handSizes[landlordPlayer] : 10;

  // 自由出牌
  if (!lastPlay || lastActivePlayer === currentPlayer) {
    return chooseSmartLeadPlay(hand, isLandlord, opponentHandSize);
  }

  // 队友出的牌
  if (lastWasTeammate) {
    // 如果队友出的牌很小，不用管
    if (lastPlay.mainValue < 10) {
      return null;
    }
    // 如果队友快出完了，让他出
    const teammateIdx = lastActivePlayer;
    const teammateHandSize = context?.handSizes[teammateIdx] ?? 10;
    if (teammateHandSize <= 3) {
      return null;
    }
  }

  const beating = findBeatingPlays(hand, lastPlay);
  if (beating.length === 0) return null;

  // 地主牌很少时，必须积极出牌
  if (landlordHandSize <= 3 && !isLandlord) {
    const sorted = beating.sort((a, b) => a.mainValue - b.mainValue);
    return sorted[0].cards;
  }

  // 对手牌少时，积极出牌
  if (opponentHandSize <= 4) {
    const sorted = beating.sort((a, b) => a.mainValue - b.mainValue);
    return sorted[0].cards;
  }

  // 正常情况：出最小的能打过的
  const nonBombs = beating.filter(
    (p) => p.pattern !== CardPattern.Bomb && p.pattern !== CardPattern.Rocket
  );

  if (nonBombs.length > 0) {
    // 优先出顺子等大牌型（快速减牌）
    const bigPlays = nonBombs.filter(
      (p) =>
        p.pattern === CardPattern.Straight ||
        p.pattern === CardPattern.StraightPair ||
        p.pattern === CardPattern.Airplane
    );

    if (bigPlays.length > 0) {
      return bigPlays[0].cards;
    }

    const sorted = nonBombs.sort((a, b) => a.mainValue - b.mainValue);
    return sorted[0].cards;
  }

  // 考虑出炸弹：自己手牌少或对手手牌少时
  if (hand.length <= 8 || opponentHandSize <= 5) {
    return beating[0].cards;
  }

  return null;
}

/**
 * 简单领出策略
 */
function chooseLeadPlay(hand: Card[], isLandlord: boolean, opponentHandSize: number): Card[] {
  const plays = findAllPossiblePlays(hand).filter(
    (p) => p.pattern !== CardPattern.Bomb && p.pattern !== CardPattern.Rocket
  );

  if (plays.length === 0) {
    // 只能出炸弹了
    const allPlays = findAllPossiblePlays(hand);
    return allPlays[0].cards;
  }

  // 手牌少时，优先出大牌快速结束
  if (hand.length <= 5) {
    const sorted = plays.sort(
      (a, b) => b.cards.length - a.cards.length || b.mainValue - a.mainValue
    );
    return sorted[0].cards;
  }

  // 优先出顺子（减少手牌）
  const straights = plays.filter(
    (p) => p.pattern === CardPattern.Straight || p.pattern === CardPattern.StraightPair
  );

  if (straights.length > 0) {
    return straights[0].cards;
  }

  // 出最小的单张或对子
  const sorted = plays.sort((a, b) => {
    // 先按牌型优先级
    const priority = getPatternPriority(a.pattern) - getPatternPriority(b.pattern);
    if (priority !== 0) return priority;
    // 再按牌值
    return a.mainValue - b.mainValue;
  });

  return sorted[0].cards;
}

/**
 * 智能领出策略
 */
function chooseSmartLeadPlay(hand: Card[], isLandlord: boolean, opponentHandSize: number): Card[] {
  const plays = findAllPossiblePlays(hand).filter(
    (p) => p.pattern !== CardPattern.Bomb && p.pattern !== CardPattern.Rocket
  );

  if (plays.length === 0) {
    const allPlays = findAllPossiblePlays(hand);
    return allPlays[0].cards;
  }

  // 手牌少时，优先出大牌快速结束
  if (hand.length <= 5) {
    const sorted = plays.sort(
      (a, b) => b.cards.length - a.cards.length || b.mainValue - a.mainValue
    );
    return sorted[0].cards;
  }

  // 对手牌少时，出大牌压制
  if (opponentHandSize <= 4) {
    const sorted = plays.sort((a, b) => b.mainValue - a.mainValue);
    return sorted[0].cards;
  }

  // 分析手牌结构
  const valueCounts = getValueCounts(hand);
  const singles = Array.from(valueCounts.entries())
    .filter(([, c]) => c === 1)
    .map(([v]) => v);
  const pairs = Array.from(valueCounts.entries())
    .filter(([, c]) => c === 2)
    .map(([v]) => v);

  // 优先出顺子
  const straights = plays.filter((p) => p.pattern === CardPattern.Straight);
  if (straights.length > 0) {
    // 选择最长的顺子
    const longest = straights.sort((a, b) => b.cards.length - a.cards.length)[0];
    return longest.cards;
  }

  // 优先出三带（带走单张和对子）
  const triples = plays.filter(
    (p) => p.pattern === CardPattern.TripleWithOne || p.pattern === CardPattern.TripleWithPair
  );
  if (triples.length > 0) {
    return triples.sort((a, b) => a.mainValue - b.mainValue)[0].cards;
  }

  // 出对子（如果有多个对子）
  const pairPlays = plays.filter((p) => p.pattern === CardPattern.Pair);
  if (pairPlays.length > 0 && pairs.length > 2) {
    return pairPlays.sort((a, b) => a.mainValue - b.mainValue)[0].cards;
  }

  // 出最小的单张
  const singlePlays = plays.filter((p) => p.pattern === CardPattern.Single);
  if (singlePlays.length > 0) {
    return singlePlays.sort((a, b) => a.mainValue - b.mainValue)[0].cards;
  }

  return plays[0].cards;
}

/**
 * 牌型优先级（用于领出选择）
 */
function getPatternPriority(pattern: CardPattern): number {
  const priorities: Record<CardPattern, number> = {
    [CardPattern.Invalid]: 0,
    [CardPattern.Straight]: 1,
    [CardPattern.StraightPair]: 1,
    [CardPattern.Airplane]: 1,
    [CardPattern.AirplaneWithSingles]: 1,
    [CardPattern.AirplaneWithPairs]: 1,
    [CardPattern.TripleWithOne]: 2,
    [CardPattern.TripleWithPair]: 2,
    [CardPattern.Pair]: 3,
    [CardPattern.Single]: 4,
    [CardPattern.Triple]: 5,
    [CardPattern.FourWithTwo]: 5,
    [CardPattern.FourWithTwoPairs]: 5,
    [CardPattern.Bomb]: 10,
    [CardPattern.Rocket]: 11,
  };
  return priorities[pattern] || 5;
}

/**
 * 获取最小对手手牌数（排除自己）
 */
function getMinOpponentHandSize(
  handSizes: [number, number, number],
  currentPlayer: number
): number {
  const opponentSizes = handSizes.filter((_, idx) => idx !== currentPlayer);
  return Math.min(...opponentSizes);
}

/**
 * AI 叫分决策
 */
export function decideAIBid(hand: Card[], currentBid: number, difficulty: AIDifficulty): number {
  // 评估手牌强度
  const strength = evaluateHandStrength(hand);

  switch (difficulty) {
    case 'easy':
      // 随机叫分，30% 概率不叫
      if (Math.random() < 0.3) return 0;
      return Math.min(3, Math.max(currentBid + 1, Math.floor(Math.random() * 3) + 1));

    case 'normal':
      // 根据手牌强度叫分
      if (strength < 5) return 0;
      if (strength < 8) return Math.min(3, currentBid + 1);
      if (strength < 12) return Math.min(3, currentBid + 2);
      return 3;

    case 'hard':
      // 精确计算
      if (strength < 6) return 0;
      if (strength < 9) return Math.min(3, currentBid + 1);
      if (strength < 13) return Math.min(3, currentBid + 2);
      return 3;
  }
}

/**
 * 评估手牌强度（0-20分）
 */
function evaluateHandStrength(hand: Card[]): number {
  let score = 0;

  // 大小王 (16=小王, 17=大王)
  const hasSmallJoker = hand.some((c) => c.value === 16);
  const hasBigJoker = hand.some((c) => c.value === 17);

  if (hasSmallJoker && hasBigJoker) {
    score += 8; // 火箭
  } else if (hasBigJoker) {
    score += 4;
  } else if (hasSmallJoker) {
    score += 3;
  }

  // 炸弹
  const valueCounts = getValueCounts(hand);
  for (const count of valueCounts.values()) {
    if (count === 4) {
      score += 6;
    }
  }

  // 大牌数量（A及以上：A=14, 2=15, 王=16/17）
  const bigCards = hand.filter((c) => c.value >= 14).length;
  score += bigCards;

  // 2的数量（牌值15，是仅次于王的大牌）
  const twos = hand.filter((c) => c.value === 15).length;
  score += twos * 2;

  return score;
}
