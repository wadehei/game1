/**
 * 牌组工具函数
 * 负责创建牌堆、洗牌、发牌等基础操作
 */

import { Card, Suit, CardValue } from './types';

/**
 * 创建一副完整的54张牌
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  let id = 0;

  // 4种花色，每种14张牌 (3-15，其中14=A, 13=K, 12=Q, 11=J, 15=2)
  const suits: Suit[] = [Suit.Spade, Suit.Heart, Suit.Diamond, Suit.Club];

  for (const suit of suits) {
    for (let value = 3; value <= 15; value++) {
      deck.push({
        id: id++,
        suit,
        value: value as CardValue,
      });
    }
  }

  // 小王 (16) 和 大王 (17)
  deck.push({ id: id++, suit: Suit.Joker, value: 16 });
  deck.push({ id: id++, suit: Suit.Joker, value: 17 });

  return deck;
}

/**
 * Fisher-Yates 均匀洗牌算法
 * 避免 sort(random) 的分布偏差
 */
export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 发牌：返回三个玩家的手牌和底牌
 * @returns [玩家0手牌, 玩家1手牌, 玩家2手牌, 底牌]
 */
export function dealCards(): [Card[], Card[], Card[], Card[]] {
  const deck = shuffle(createDeck());

  // 每人17张，底牌3张 (54张牌: 14值×4花色 + 2王 = 56... 实际54张)
  // 14 values (3-15) × 4 suits = 56 - wait, 3..15 = 13 values × 4 = 52 + 2 jokers = 54
  const hand0 = deck.slice(0, 17);
  const hand1 = deck.slice(17, 34);
  const hand2 = deck.slice(34, 51);
  const bottom = deck.slice(51, 54);

  // 手牌按牌值排序（从小到大）
  return [sortCards(hand0), sortCards(hand1), sortCards(hand2), bottom];
}

/**
 * 牌组排序：先按牌值，再按花色
 */
export function sortCards(cards: Card[]): Card[] {
  const suitOrder: Record<Suit, number> = {
    [Suit.Spade]: 4,
    [Suit.Heart]: 3,
    [Suit.Diamond]: 2,
    [Suit.Club]: 1,
    [Suit.Joker]: 5,
  };

  return [...cards].sort((a, b) => {
    if (a.value !== b.value) {
      return a.value - b.value;
    }
    return suitOrder[a.suit] - suitOrder[b.suit];
  });
}

/**
 * 按牌值分组统计
 */
export function groupByValue(cards: Card[]): Map<CardValue, Card[]> {
  const groups = new Map<CardValue, Card[]>();

  for (const card of cards) {
    const existing = groups.get(card.value) || [];
    existing.push(card);
    groups.set(card.value, existing);
  }

  return groups;
}

/**
 * 获取每种牌值的数量
 */
export function getValueCounts(cards: Card[]): Map<CardValue, number> {
  const counts = new Map<CardValue, number>();

  for (const card of cards) {
    counts.set(card.value, (counts.get(card.value) || 0) + 1);
  }

  return counts;
}

/**
 * 获取牌面显示名称
 */
export function getCardDisplayName(value: CardValue): string {
  const names: Record<CardValue, string> = {
    3: '3',
    4: '4',
    5: '5',
    6: '6',
    7: '7',
    8: '8',
    9: '9',
    10: '10',
    11: 'J',
    12: 'Q',
    13: 'K',
    14: 'A',
    15: '2',
    16: '小',
    17: '大',
  };
  return names[value];
}

/**
 * 获取花色符号
 */
export function getSuitSymbol(suit: Suit): string {
  const symbols: Record<Suit, string> = {
    [Suit.Spade]: '♠',
    [Suit.Heart]: '♥',
    [Suit.Diamond]: '♦',
    [Suit.Club]: '♣',
    [Suit.Joker]: '★',
  };
  return symbols[suit];
}

/**
 * 获取花色颜色（红/黑）
 */
export function getSuitColor(suit: Suit): 'red' | 'black' {
  if (suit === Suit.Heart || suit === Suit.Diamond) {
    return 'red';
  }
  return 'black';
}
