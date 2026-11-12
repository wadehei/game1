import { describe, it, expect } from 'vitest';
import {
  buildDeck,
  handValue,
  isBlackjack,
  isBusted,
  cardLabel,
  payoutMultiplier,
  BET_OPTIONS,
} from '../../ws/games/blackjack/engine';
import type { Card } from '../../ws/games/blackjack/engine';

describe('blackjack engine', () => {
  describe('buildDeck', () => {
    it('should build a 52-card deck', () => {
      const deck = buildDeck();
      expect(deck.length).toBe(52);
    });

    it('should have 4 suits with 13 ranks each', () => {
      const deck = buildDeck();
      for (const suit of ['♠', '♥', '♦', '♣']) {
        const suited = deck.filter((c) => c.suit === suit);
        expect(suited.length).toBe(13);
      }
    });
  });

  describe('cardLabel', () => {
    it('should label Ace as A', () => {
      expect(cardLabel({ suit: '♠', rank: 1 })).toBe('♠A');
    });

    it('should label J/Q/K correctly', () => {
      expect(cardLabel({ suit: '♥', rank: 11 })).toBe('♥J');
      expect(cardLabel({ suit: '♦', rank: 12 })).toBe('♦Q');
      expect(cardLabel({ suit: '♣', rank: 13 })).toBe('♣K');
    });

    it('should label number cards by rank', () => {
      expect(cardLabel({ suit: '♠', rank: 7 })).toBe('♠7');
      expect(cardLabel({ suit: '♥', rank: 10 })).toBe('♥10');
    });
  });

  describe('handValue', () => {
    it('should count number cards at face value', () => {
      const cards: Card[] = [
        { suit: '♠', rank: 7 },
        { suit: '♥', rank: 8 },
      ];
      expect(handValue(cards)).toEqual({ total: 15, soft: false });
    });

    it('should count J/Q/K as 10', () => {
      const cards: Card[] = [
        { suit: '♠', rank: 11 },
        { suit: '♥', rank: 12 },
        { suit: '♦', rank: 13 },
      ];
      expect(handValue(cards).total).toBe(30);
    });

    it('should count Ace as 11 when it does not bust', () => {
      const cards: Card[] = [
        { suit: '♠', rank: 1 },
        { suit: '♥', rank: 9 },
      ];
      expect(handValue(cards)).toEqual({ total: 20, soft: true });
    });

    it('should count Ace as 1 when 11 would bust', () => {
      const cards: Card[] = [
        { suit: '♠', rank: 1 },
        { suit: '♥', rank: 9 },
        { suit: '♦', rank: 8 },
      ];
      expect(handValue(cards)).toEqual({ total: 18, soft: false });
    });

    it('should handle multiple Aces optimally', () => {
      const cards: Card[] = [
        { suit: '♠', rank: 1 },
        { suit: '♥', rank: 1 },
      ];
      // One ace as 11, other as 1 = 12 (soft)
      expect(handValue(cards)).toEqual({ total: 12, soft: true });
    });
  });

  describe('isBlackjack', () => {
    it('should return true for Ace + 10-value card', () => {
      expect(
        isBlackjack([
          { suit: '♠', rank: 1 },
          { suit: '♥', rank: 10 },
        ])
      ).toBe(true);
      expect(
        isBlackjack([
          { suit: '♠', rank: 1 },
          { suit: '♥', rank: 13 },
        ])
      ).toBe(true);
    });

    it('should return false for non-21 two-card hands', () => {
      expect(
        isBlackjack([
          { suit: '♠', rank: 10 },
          { suit: '♥', rank: 9 },
        ])
      ).toBe(false);
    });

    it('should return false for 21 with 3+ cards', () => {
      expect(
        isBlackjack([
          { suit: '♠', rank: 1 },
          { suit: '♥', rank: 5 },
          { suit: '♦', rank: 5 },
        ])
      ).toBe(false);
    });
  });

  describe('isBusted', () => {
    it('should return true when total exceeds 21', () => {
      const cards: Card[] = [
        { suit: '♠', rank: 10 },
        { suit: '♥', rank: 10 },
        { suit: '♦', rank: 5 },
      ];
      expect(isBusted(cards)).toBe(true);
    });

    it('should return false for 21 or less', () => {
      const cards: Card[] = [
        { suit: '♠', rank: 10 },
        { suit: '♥', rank: 11 },
      ];
      expect(isBusted(cards)).toBe(false);
    });
  });

  describe('BET_OPTIONS', () => {
    it('should be [10, 20, 50, 100]', () => {
      expect(BET_OPTIONS).toEqual([10, 20, 50, 100]);
    });
  });

  describe('payoutMultiplier', () => {
    const makeCards = (ranks: number[]): Card[] =>
      ranks.map((r, i) => ({
        suit: (['♠', '♥', '♦', '♣'] as const)[i % 4],
        rank: r,
      }));

    it('should return 0 when player busts', () => {
      const player = makeCards([10, 10, 5]); // 25
      const banker = makeCards([10, 7]); // 17
      expect(payoutMultiplier(player, banker, false)).toBe(0);
    });

    it('should return 2.5 for natural blackjack', () => {
      const player = makeCards([1, 10]); // BJ
      const banker = makeCards([10, 7]); // 17
      expect(payoutMultiplier(player, banker, true)).toBe(2.5);
    });

    it('should return 2 for normal win', () => {
      const player = makeCards([10, 9]); // 19
      const banker = makeCards([10, 7]); // 17
      expect(payoutMultiplier(player, banker, false)).toBe(2);
    });

    it('should return 1 for push (tie)', () => {
      const player = makeCards([10, 7]); // 17
      const banker = makeCards([10, 7]); // 17
      expect(payoutMultiplier(player, banker, false)).toBe(1);
    });

    it('should return 0 when banker wins', () => {
      const player = makeCards([10, 5]); // 15
      const banker = makeCards([10, 8]); // 18
      expect(payoutMultiplier(player, banker, false)).toBe(0);
    });

    it('should return 2 when banker busts and player did not', () => {
      const player = makeCards([10, 5]); // 15
      const banker = makeCards([10, 10, 5]); // 25
      expect(payoutMultiplier(player, banker, false)).toBe(2);
    });

    it('should handle banker natural blackjack (player loses unless also BJ)', () => {
      const player = makeCards([10, 7]); // 17
      const banker = makeCards([1, 10]); // BJ
      expect(payoutMultiplier(player, banker, false)).toBe(0);
    });

    it('should push when both have natural blackjack', () => {
      const player = makeCards([1, 10]); // BJ
      const banker = makeCards([1, 13]); // BJ
      expect(payoutMultiplier(player, banker, true)).toBe(1);
    });
  });
});
