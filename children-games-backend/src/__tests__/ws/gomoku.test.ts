import { describe, it, expect } from 'vitest';
import { createGomoku, placeStone, BOARD_SIZE, EMPTY, BLACK, WHITE } from '../../ws/gomoku';

describe('gomoku pure logic', () => {
  describe('createGomoku', () => {
    it('should create a 15x15 empty board', () => {
      const g = createGomoku();
      expect(g.board.length).toBe(BOARD_SIZE);
      expect(g.board[0].length).toBe(BOARD_SIZE);
      expect(g.board.flat().every((c) => c === EMPTY)).toBe(true);
    });

    it('should set BLACK as first turn', () => {
      const g = createGomoku();
      expect(g.turn).toBe(BLACK);
    });

    it('should initialize with no winner and zero moves', () => {
      const g = createGomoku();
      expect(g.winner).toBe(0);
      expect(g.moveCount).toBe(0);
      expect(g.lastMove).toBeNull();
      expect(g.winLine).toEqual([]);
    });
  });

  describe('placeStone', () => {
    it('should place a stone on empty position and switch turn', () => {
      const g = createGomoku();
      const err = placeStone(g, BLACK, 7, 7);
      expect(err).toBeNull();
      expect(g.board[7][7]).toBe(BLACK);
      expect(g.moveCount).toBe(1);
      expect(g.turn).toBe(WHITE);
      expect(g.lastMove).toEqual({ x: 7, y: 7 });
    });

    it('should reject move when game is over', () => {
      const g = createGomoku();
      g.winner = BLACK;
      const err = placeStone(g, BLACK, 0, 0);
      expect(err).toBe('对局已结束');
    });

    it('should reject move when wrong player', () => {
      const g = createGomoku();
      const err = placeStone(g, WHITE, 7, 7);
      expect(err).toBe('还没轮到你');
    });

    it('should reject out-of-bounds coordinates', () => {
      const g = createGomoku();
      expect(placeStone(g, BLACK, -1, 0)).toBe('坐标超出棋盘');
      expect(placeStone(g, BLACK, 0, BOARD_SIZE)).toBe('坐标超出棋盘');
    });

    it('should reject occupied position', () => {
      const g = createGomoku();
      placeStone(g, BLACK, 7, 7);
      const err = placeStone(g, WHITE, 7, 7);
      expect(err).toBe('这个位置已经有棋子了');
    });

    it('should detect horizontal five-in-a-row', () => {
      const g = createGomoku();
      // BLACK: (0,0)(1,0)(2,0)(3,0)(4,0) — horizontal win
      const moves = [
        [BLACK, 0, 0],
        [WHITE, 0, 1],
        [BLACK, 1, 0],
        [WHITE, 1, 1],
        [BLACK, 2, 0],
        [WHITE, 2, 1],
        [BLACK, 3, 0],
        [WHITE, 3, 1],
        [BLACK, 4, 0],
      ] as const;
      for (const [p, x, y] of moves) {
        placeStone(g, p, x, y);
      }
      expect(g.winner).toBe(BLACK);
      expect(g.winLine.length).toBe(5);
    });

    it('should detect vertical five-in-a-row', () => {
      const g = createGomoku();
      const moves = [
        [BLACK, 0, 0],
        [WHITE, 1, 0],
        [BLACK, 0, 1],
        [WHITE, 1, 1],
        [BLACK, 0, 2],
        [WHITE, 1, 2],
        [BLACK, 0, 3],
        [WHITE, 1, 3],
        [BLACK, 0, 4],
      ] as const;
      for (const [p, x, y] of moves) {
        placeStone(g, p, x, y);
      }
      expect(g.winner).toBe(BLACK);
    });

    it('should detect diagonal five-in-a-row', () => {
      const g = createGomoku();
      const moves = [
        [BLACK, 0, 0],
        [WHITE, 1, 0],
        [BLACK, 1, 1],
        [WHITE, 2, 0],
        [BLACK, 2, 2],
        [WHITE, 3, 0],
        [BLACK, 3, 3],
        [WHITE, 4, 0],
        [BLACK, 4, 4],
      ] as const;
      for (const [p, x, y] of moves) {
        placeStone(g, p, x, y);
      }
      expect(g.winner).toBe(BLACK);
    });

    it('should declare draw when board is full', () => {
      const g = createGomoku();
      // Simulate a nearly-full board (224/225 moves) with no winner
      g.moveCount = BOARD_SIZE * BOARD_SIZE - 1;
      g.turn = BLACK;
      // Place the last stone — triggers draw check
      const err = placeStone(g, BLACK, 14, 14);
      expect(err).toBeNull();
      expect(g.winner).toBe(3); // draw
      expect(g.moveCount).toBe(BOARD_SIZE * BOARD_SIZE);
    });

    it('should not declare winner for four in a row', () => {
      const g = createGomoku();
      const moves = [
        [BLACK, 0, 0],
        [WHITE, 0, 1],
        [BLACK, 1, 0],
        [WHITE, 1, 1],
        [BLACK, 2, 0],
        [WHITE, 2, 1],
        [BLACK, 3, 0],
        [WHITE, 3, 1],
      ] as const;
      for (const [p, x, y] of moves) {
        placeStone(g, p, x, y);
      }
      expect(g.winner).toBe(0); // still playing
    });
  });
});
