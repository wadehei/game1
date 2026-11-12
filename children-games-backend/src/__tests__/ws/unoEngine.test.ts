import { describe, it, expect } from 'vitest';
import { buildDeck, shuffle, canPlay, cardScore, isNumberCard } from '../../ws/games/uno/engine';
import type { UnoCard } from '../../ws/games/uno/engine';

describe('uno engine', () => {
  describe('buildDeck', () => {
    it('should build a 108-card deck', () => {
      const deck = buildDeck();
      expect(deck.length).toBe(108);
    });

    it('should have unique card ids', () => {
      const deck = buildDeck();
      const ids = new Set(deck.map((c) => c.id));
      expect(ids.size).toBe(108);
    });

    it('should include 4 wild and 4 wild4 cards', () => {
      const deck = buildDeck();
      const wilds = deck.filter((c) => c.kind === 'wild');
      const wild4s = deck.filter((c) => c.kind === 'wild4');
      expect(wilds.length).toBe(4);
      expect(wild4s.length).toBe(4);
    });

    it('should have 4 colors with correct distribution', () => {
      const deck = buildDeck();
      for (const color of ['red', 'yellow', 'green', 'blue']) {
        const colored = deck.filter((c) => c.color === color);
        // 1 zero + 9*2 numbers + 3*2 action = 1+18+6 = 25 per color
        expect(colored.length).toBe(25);
      }
    });
  });

  describe('shuffle', () => {
    it('should return array of same length', () => {
      const arr = [1, 2, 3, 4, 5];
      const result = shuffle(arr);
      expect(result.length).toBe(arr.length);
    });

    it('should not mutate original array', () => {
      const arr = [1, 2, 3, 4, 5];
      const copy = [...arr];
      shuffle(arr);
      expect(arr).toEqual(copy);
    });

    it('should contain same elements', () => {
      const arr = [1, 2, 3, 4, 5];
      const result = shuffle(arr);
      expect(result.sort()).toEqual(arr.sort());
    });
  });

  describe('canPlay', () => {
    const top: UnoCard = { id: 'red-5-a', color: 'red', kind: '5' };

    it('should allow playing a card of matching color', () => {
      const card: UnoCard = { id: 'red-3-a', color: 'red', kind: '3' };
      expect(canPlay(card, top, 'red')).toBe(true);
    });

    it('should allow playing a card of matching kind', () => {
      const card: UnoCard = { id: 'blue-5-a', color: 'blue', kind: '5' };
      expect(canPlay(card, top, 'red')).toBe(true);
    });

    it('should allow playing a wild card', () => {
      const card: UnoCard = { id: 'wild-wild-0', color: 'wild', kind: 'wild' };
      expect(canPlay(card, top, 'red')).toBe(true);
    });

    it('should reject a card with different color and kind', () => {
      const card: UnoCard = { id: 'blue-3-a', color: 'blue', kind: '3' };
      expect(canPlay(card, top, 'red')).toBe(false);
    });

    it('should allow playing on currentColor match even if top color differs', () => {
      // Wild was played, currentColor is 'blue', top is wild
      const wildTop: UnoCard = { id: 'wild-wild-0', color: 'wild', kind: 'wild' };
      const card: UnoCard = { id: 'blue-7-a', color: 'blue', kind: '7' };
      expect(canPlay(card, wildTop, 'blue')).toBe(true);
    });
  });

  describe('cardScore', () => {
    it('should return face value for number cards', () => {
      expect(cardScore({ id: 'red-0-0', color: 'red', kind: '0' })).toBe(0);
      expect(cardScore({ id: 'red-5-a', color: 'red', kind: '5' })).toBe(5);
      expect(cardScore({ id: 'red-9-a', color: 'red', kind: '9' })).toBe(9);
    });

    it('should return 20 for action cards', () => {
      expect(cardScore({ id: 'red-skip-a', color: 'red', kind: 'skip' })).toBe(20);
      expect(cardScore({ id: 'red-reverse-a', color: 'red', kind: 'reverse' })).toBe(20);
      expect(cardScore({ id: 'red-draw2-a', color: 'red', kind: 'draw2' })).toBe(20);
    });

    it('should return 50 for wild cards', () => {
      expect(cardScore({ id: 'wild-wild-0', color: 'wild', kind: 'wild' })).toBe(50);
      expect(cardScore({ id: 'wild-wild4-0', color: 'wild', kind: 'wild4' })).toBe(50);
    });
  });

  describe('isNumberCard', () => {
    it('should return true for number cards', () => {
      expect(isNumberCard({ id: 'red-0-0', color: 'red', kind: '0' })).toBe(true);
      expect(isNumberCard({ id: 'red-9-a', color: 'red', kind: '9' })).toBe(true);
    });

    it('should return false for action and wild cards', () => {
      expect(isNumberCard({ id: 'red-skip-a', color: 'red', kind: 'skip' })).toBe(false);
      expect(isNumberCard({ id: 'wild-wild-0', color: 'wild', kind: 'wild' })).toBe(false);
    });
  });
});
