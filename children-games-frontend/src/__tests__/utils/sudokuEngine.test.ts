import { describe, it, expect } from 'vitest';
import {
  makeSolvedGrid,
  generatePuzzle,
  countSolutions,
  findConflicts,
  boxIndexOf,
} from '../../utils/sudokuEngine';

/** 确定性 rng（可复现测试） */
const seededRng = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
};

const validateSolved = (grid: number[], size: number, boxRows: number, boxCols: number): void => {
  const full = Array.from({ length: size }, (_, i) => i + 1)
    .sort()
    .join(',');
  for (let r = 0; r < size; r += 1) {
    expect(
      Array.from({ length: size }, (_, c) => grid[r * size + c])
        .sort()
        .join(',')
    ).toBe(full);
    expect(
      Array.from({ length: size }, (_, c) => grid[c * size + r])
        .sort()
        .join(',')
    ).toBe(full);
  }
  const boxCount = (size / boxRows) * (size / boxCols);
  for (let b = 0; b < boxCount; b += 1) {
    const cells: number[] = [];
    for (let i = 0; i < size; i += 1) {
      for (let j = 0; j < size; j += 1) {
        if (boxIndexOf(i, j, size, boxRows, boxCols) === b) cells.push(grid[i * size + j]);
      }
    }
    expect(cells.sort((a, b) => a - b).join(',')).toBe(full);
  }
};

describe('sudokuEngine', () => {
  describe('makeSolvedGrid', () => {
    it('4×4 解满足行/列/宫全部 1..4 不重复', () => {
      const grid = makeSolvedGrid(4, 2, 2, seededRng(1));
      expect(grid).not.toBeNull();
      validateSolved(grid!, 4, 2, 2);
    });

    it('6×6 解满足行/列/宫全部 1..6 不重复', () => {
      const grid = makeSolvedGrid(6, 2, 3, seededRng(2));
      expect(grid).not.toBeNull();
      validateSolved(grid!, 6, 2, 3);
    });

    it('同 seed 可复现', () => {
      expect(makeSolvedGrid(4, 2, 2, seededRng(7))).toEqual(makeSolvedGrid(4, 2, 2, seededRng(7)));
    });
  });

  describe('generatePuzzle', () => {
    it('4×4 谜面唯一解、预填数不超过目标、given 是 solution 的子集', () => {
      const puzzle = generatePuzzle(4, 2, 2, 9, seededRng(3));
      expect(puzzle).not.toBeNull();
      const { given, solution, size } = puzzle!;
      expect(countSolutions(given, size, 2, 2, 2)).toBe(1);
      const prefilledCount = given.filter((v) => v !== 0).length;
      expect(prefilledCount).toBeGreaterThanOrEqual(9);
      expect(prefilledCount).toBeLessThanOrEqual(12); // 挖不到目标时保留更多属合法
      given.forEach((v, i) => {
        if (v !== 0) expect(v).toBe(solution[i]);
      });
    });

    it('6×6 谜面唯一解', () => {
      const puzzle = generatePuzzle(6, 2, 3, 18, seededRng(4));
      expect(puzzle).not.toBeNull();
      expect(countSolutions(puzzle!.given, 6, 2, 3, 2)).toBe(1);
    });
  });

  describe('countSolutions', () => {
    it('空盘 4×4 有多组解（数到 2 即停）', () => {
      expect(countSolutions(new Array(16).fill(0), 4, 2, 2, 2)).toBe(2);
    });

    it('完整解盘面恰有 1 组解', () => {
      const grid = makeSolvedGrid(4, 2, 2, seededRng(5))!;
      expect(countSolutions(grid, 4, 2, 2, 2)).toBe(1);
    });
  });

  describe('findConflicts', () => {
    it('标记行/列/宫重复格，空白格忽略', () => {
      // 4×4：
      // 行0 两个 1 冲突；列2 两个 2 冲突
      const grid = [
        1,
        0,
        1,
        0, // 行0: idx0 与 idx2 同值
        0,
        1,
        0,
        0,
        0,
        0,
        2,
        0, // idx10
        0,
        0,
        2,
        0, // idx14 与 idx10 同列冲突
      ];
      const conflicts = findConflicts(grid, 4, 2, 2);
      expect(conflicts.has(0)).toBe(true);
      expect(conflicts.has(2)).toBe(true);
      expect(conflicts.has(10)).toBe(true);
      expect(conflicts.has(14)).toBe(true);
      // idx0 与 idx5（值 1）同在宫 0，构成第 5 个冲突格
      expect(conflicts.has(5)).toBe(true);
      expect(conflicts.size).toBe(5);
    });

    it('合法解盘面零冲突', () => {
      const grid = makeSolvedGrid(6, 2, 3, seededRng(6))!;
      expect(findConflicts(grid, 6, 2, 3).size).toBe(0);
    });
  });

  describe('boxIndexOf', () => {
    it('4×4 宫划分正确', () => {
      expect(boxIndexOf(0, 0, 4, 2, 2)).toBe(0);
      expect(boxIndexOf(0, 3, 4, 2, 2)).toBe(1);
      expect(boxIndexOf(3, 0, 4, 2, 2)).toBe(2);
      expect(boxIndexOf(3, 3, 4, 2, 2)).toBe(3);
    });

    it('6×6（2×3 宫）宫划分正确', () => {
      expect(boxIndexOf(0, 0, 6, 2, 3)).toBe(0);
      expect(boxIndexOf(1, 5, 6, 2, 3)).toBe(1);
      expect(boxIndexOf(2, 0, 6, 2, 3)).toBe(2);
      expect(boxIndexOf(5, 5, 6, 2, 3)).toBe(5);
    });
  });
});
