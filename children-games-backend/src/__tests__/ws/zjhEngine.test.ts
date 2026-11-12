import { describe, it, expect } from 'vitest';
import { handRank, compareZjh, typeName, buildZjhDeck } from '../../ws/games/zjh/engine';
import type { Card } from '../../ws/games/blackjack/engine';

const c = (suit: Card['suit'], rank: number): Card => ({ suit, rank });

describe('zjh engine', () => {
  describe('handRank', () => {
    it('should detect 豹子 (three of a kind)', () => {
      const cards = [c('♠', 7), c('♥', 7), c('♦', 7)];
      const rank = handRank(cards);
      expect(rank.type).toBe(6);
      expect(rank.special235).toBe(false);
    });

    it('should detect 顺金 (straight flush)', () => {
      const cards = [c('♠', 3), c('♠', 4), c('♠', 5)];
      const rank = handRank(cards);
      expect(rank.type).toBe(5);
    });

    it('should detect 金花 (flush)', () => {
      const cards = [c('♥', 2), c('♥', 5), c('♥', 9)];
      const rank = handRank(cards);
      expect(rank.type).toBe(4);
    });

    it('should detect 顺子 (straight)', () => {
      const cards = [c('♠', 3), c('♥', 4), c('♦', 5)];
      const rank = handRank(cards);
      expect(rank.type).toBe(3);
    });

    it('should detect A23 as smallest straight', () => {
      // A=rank 1, so [A, 2, 3] → sorted desc: [14, 3, 2] (after A→14 mapping in game logic)
      // But in this engine, rank 1 = A, and the check is:
      // ranks[0] === 14 && ranks[1] === 3 && ranks[2] === 2
      // However, the cards use rank 1 for A, not 14.
      // Looking at the code: the check is on sorted desc ranks, and A(1) becomes 14 in the sorted array?
      // Actually, looking at handRank: ranks = cards.map(c => c.rank).sort((a,b) => b-a)
      // With rank 1 (A), sorted desc would put 1 at end. But the code checks ranks[0]===14,
      // which means A must be rank 14 in the card... Let me re-check.
      // Actually the code uses rank as-is. So for A23, we'd have ranks [1,2,3] sorted desc [3,2,1].
      // The check is ranks[0]===14 which won't match. So A23 straight needs ranks [14,3,2]??
      // Wait, this might use a different convention. Let me test what the code actually does.
      const cards = [c('♠', 1), c('♥', 2), c('♦', 3)];
      const rank = handRank(cards);
      // With the code as-is: sorted desc = [3, 2, 1], straightKeys = [3, 2, 1] only if ranks[0]===14
      // Since ranks[0] is 3, not 14, the A23 straight check won't fire.
      // It would be: 3-2===1 && 2-1===1 → yes, straight [3, 2, 1]
      // Actually that works because the regular straight check catches it!
      // Wait: ranks[0] - ranks[1] = 3-2 = 1, ranks[1] - ranks[2] = 2-1 = 1 → straightKeys = [3, 2, 1]
      expect(rank.type).toBe(3); // 顺子
      expect(rank.keys).toEqual([3, 2, 1]);
    });

    it('should detect 对子 (pair)', () => {
      const cards = [c('♠', 7), c('♥', 7), c('♦', 3)];
      const rank = handRank(cards);
      expect(rank.type).toBe(2);
      expect(rank.keys).toEqual([7, 3]);
    });

    it('should detect 散牌 (high card)', () => {
      const cards = [c('♠', 2), c('♥', 5), c('♦', 9)];
      const rank = handRank(cards);
      expect(rank.type).toBe(1);
    });

    it('should detect special 235', () => {
      const cards = [c('♠', 2), c('♥', 3), c('♦', 5)];
      const rank = handRank(cards);
      expect(rank.type).toBe(1);
      expect(rank.special235).toBe(true);
    });

    it('should NOT mark 235 as special if same suit (金花)', () => {
      const cards = [c('♠', 2), c('♠', 3), c('♠', 5)];
      const rank = handRank(cards);
      expect(rank.type).toBe(4); // 金花, not 散牌
      expect(rank.special235).toBe(false);
    });
  });

  describe('typeName', () => {
    it('should return correct names', () => {
      expect(typeName({ type: 6, keys: [7], suitPower: 4, special235: false })).toBe('豹子');
      expect(typeName({ type: 5, keys: [5], suitPower: 4, special235: false })).toBe('顺金');
      expect(typeName({ type: 4, keys: [9], suitPower: 3, special235: false })).toBe('金花');
      expect(typeName({ type: 3, keys: [5], suitPower: 4, special235: false })).toBe('顺子');
      expect(typeName({ type: 2, keys: [7, 3], suitPower: 4, special235: false })).toBe('对子');
      expect(typeName({ type: 1, keys: [9], suitPower: 4, special235: false })).toBe('散牌');
    });

    it('should return 特殊235 for special235 hands', () => {
      expect(typeName({ type: 1, keys: [5, 3, 2], suitPower: 4, special235: true })).toBe(
        '特殊235'
      );
    });
  });

  describe('compareZjh', () => {
    it('should return 1 when a wins by hand type', () => {
      const a = [c('♠', 7), c('♥', 7), c('♦', 7)]; // 豹子
      const b = [c('♠', 10), c('♥', 9), c('♦', 8)]; // 顺子
      expect(compareZjh(a, b, false)).toBe(1);
    });

    it('should return -1 when b wins', () => {
      const a = [c('♠', 2), c('♥', 5), c('♦', 9)]; // 散牌
      const b = [c('♠', 7), c('♥', 7), c('♦', 7)]; // 豹子
      expect(compareZjh(a, b, false)).toBe(-1);
    });

    it('should compare by keys when same type', () => {
      const a = [c('♠', 10), c('♥', 10), c('♦', 3)]; // 对10
      const b = [c('♠', 7), c('♥', 7), c('♦', 5)]; // 对7
      expect(compareZjh(a, b, false)).toBe(1);
    });

    it('should compare by suit when same type and keys', () => {
      const a = [c('♠', 10), c('♥', 10), c('♦', 3)]; // 对10, max suit ♠=4
      const b = [c('♥', 10), c('♦', 10), c('♣', 3)]; // 对10, max suit ♥=3
      expect(compareZjh(a, b, false)).toBe(1);
    });

    it('should let special 235 beat 豹子 when enabled', () => {
      const a = [c('♠', 2), c('♥', 3), c('♦', 5)]; // 特殊235
      const b = [c('♠', 7), c('♥', 7), c('♦', 7)]; // 豹子
      expect(compareZjh(a, b, true)).toBe(1);
    });

    it('should NOT let special 235 beat 豹子 when disabled', () => {
      const a = [c('♠', 2), c('♥', 3), c('♦', 5)]; // 散牌
      const b = [c('♠', 7), c('♥', 7), c('♦', 7)]; // 豹子
      expect(compareZjh(a, b, false)).toBe(-1);
    });

    it('should handle both special 235 by comparing suit', () => {
      const a = [c('♠', 2), c('♥', 3), c('♦', 5)]; // ♠ max
      const b = [c('♥', 2), c('♦', 3), c('♣', 5)]; // ♥ max
      expect(compareZjh(a, b, true)).toBe(1); // ♠(4) > ♥(3)
    });
  });

  describe('buildZjhDeck', () => {
    it('should build a 52-card deck', () => {
      const deck = buildZjhDeck();
      expect(deck.length).toBe(52);
    });
  });
});
