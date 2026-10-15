// 炸金花纯逻辑：三张牌牌型判定与比较。规则写死处：QKA 最大顺、A23 算最小顺、
// 特殊 235（不同花 2-3-5）可反杀豹子（建房开关）、完全同点比最大单张花色（♠>♥>♣>♦）
import { SUITS, type Card } from '../blackjack/engine';

export interface ZjhRank {
  type: 6 | 5 | 4 | 3 | 2 | 1; // 6豹子 5顺金 4金花 3顺子 2对子 1散牌
  keys: number[]; // 同型比较键（降序）
  suitPower: number; // 最大单张花色（完全同点时决胜）
  special235: boolean;
}

const SUIT_POWER: Record<Card['suit'], number> = { '♠': 4, '♥': 3, '♣': 2, '♦': 1 };

export const typeName = (r: ZjhRank): string =>
  r.special235 ? '特殊235' : ['散牌', '对子', '顺子', '金花', '顺金', '豹子'][r.type - 1];

export const handRank = (cards: Card[]): ZjhRank => {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const suitPower = Math.max(...cards.map((c) => SUIT_POWER[c.suit]));

  // 顺子：严格连张，或 A23（[3,2,14] 视作 [3,2,1]）
  let straightKeys: number[] | null = null;
  if (ranks[0] === 14 && ranks[1] === 3 && ranks[2] === 2) {
    straightKeys = [3, 2, 1];
  } else if (ranks[0] - ranks[1] === 1 && ranks[1] - ranks[2] === 1) {
    straightKeys = ranks;
  }

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);

  // 豹子
  if (counts.size === 1) return { type: 6, keys: [ranks[0]], suitPower, special235: false };

  // 顺金 / 顺子
  if (straightKeys) {
    return flush
      ? { type: 5, keys: straightKeys, suitPower, special235: false }
      : { type: 3, keys: straightKeys, suitPower, special235: false };
  }
  // 金花
  if (flush) return { type: 4, keys: ranks, suitPower, special235: false };

  // 对子
  if (counts.size === 2) {
    const pair = [...counts.entries()].find(([, n]) => n === 2)![0];
    const kicker = [...counts.entries()].find(([, n]) => n === 1)![0];
    return { type: 2, keys: [pair, kicker], suitPower, special235: false };
  }

  // 散牌（检查特殊 235）
  const is235 = ranks.includes(2) && ranks.includes(3) && ranks.includes(5);
  return { type: 1, keys: ranks, suitPower, special235: is235 };
};

/** a 胜返回 1，b 胜返回 -1（牌型完全相同比最大单张花色，绝不会平） */
export const compareZjh = (a: Card[], b: Card[], special235: boolean): number => {
  const ra = handRank(a);
  const rb = handRank(b);
  if (special235) {
    if (ra.special235 && rb.type === 6) return 1;
    if (rb.special235 && ra.type === 6) return -1;
  }
  if (ra.type !== rb.type) return ra.type > rb.type ? 1 : -1;
  for (let i = 0; i < ra.keys.length; i += 1) {
    if (ra.keys[i] !== rb.keys[i]) return ra.keys[i] > rb.keys[i] ? 1 : -1;
  }
  return ra.suitPower > rb.suitPower ? 1 : -1;
};

export const buildZjhDeck = (): Card[] => {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank += 1) deck.push({ suit, rank });
  }
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};
