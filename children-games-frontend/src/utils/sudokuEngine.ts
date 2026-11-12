/**
 * 动物数独引擎（纯逻辑，无 Vue 依赖）
 * - 支持任意 size + 宫尺寸（4×4 用 2×2 宫，6×6 用 2×3 宫）
 * - 生成：先构造完整解，再按随机顺序挖洞，每挖一格校验解仍唯一（countSolutions===1）
 * - 胜利判定：全部填满且行/列/宫零冲突（唯一解谜题下等价于正确完成；
 *   孩子若找到另一组合法填法同样算赢，不挫败）
 */

export interface SudokuPuzzle {
  /** 边长（4 或 6） */
  size: number;
  /** 每宫行数 */
  boxRows: number;
  /** 每宫列数 */
  boxCols: number;
  /** 谜面：size*size 一维数组，0 = 空白 */
  given: number[];
  /** 完整解：size*size，值 1..size */
  solution: number[];
}

export type Rng = () => number;

export const defaultRng = (): Rng => Math.random;

/** Fisher-Yates 洗牌（用注入的 rng 便于测试） */
const shuffled = <T>(arr: T[], rng: Rng): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** (row, col) 所在宫的编号 */
export const boxIndexOf = (
  row: number,
  col: number,
  size: number,
  boxRows: number,
  boxCols: number
): number => Math.floor(row / boxRows) * (size / boxCols) + Math.floor(col / boxCols);

/** 用回溯 + 随机候选顺序构造一张完整解 */
export const makeSolvedGrid = (
  size: number,
  boxRows: number,
  boxCols: number,
  rng: Rng = defaultRng()
): number[] | null => {
  const grid = new Array<number>(size * size).fill(0);
  const symbols = Array.from({ length: size }, (_, i) => i + 1);

  const fill = (idx: number): boolean => {
    if (idx >= size * size) return true;
    const row = Math.floor(idx / size);
    const col = idx % size;
    for (const v of shuffled(symbols, rng)) {
      if (fits(grid, size, boxRows, boxCols, row, col, v)) {
        grid[idx] = v;
        if (fill(idx + 1)) return true;
        grid[idx] = 0;
      }
    }
    return false;
  };
  return fill(0) ? grid : null;
};

/** 该格填 v 是否与行/列/宫已放数字冲突 */
export const fits = (
  grid: number[],
  size: number,
  boxRows: number,
  boxCols: number,
  row: number,
  col: number,
  v: number
): boolean => {
  for (let k = 0; k < size; k += 1) {
    if (grid[row * size + k] === v) return false; // 行
    if (grid[k * size + col] === v) return false; // 列
  }
  const bRow0 = Math.floor(row / boxRows) * boxRows;
  const bCol0 = Math.floor(col / boxCols) * boxCols;
  for (let i = 0; i < boxRows; i += 1) {
    for (let j = 0; j < boxCols; j += 1) {
      if (grid[(bRow0 + i) * size + bCol0 + j] === v) return false;
    }
  }
  return true;
};

/** 数解数量，最多数到 limit（用于唯一性校验，limit=2 即"是否唯一"） */
export const countSolutions = (
  grid: number[],
  size: number,
  boxRows: number,
  boxCols: number,
  limit = 2
): number => {
  const symbols = Array.from({ length: size }, (_, i) => i + 1);
  let found = 0;

  const search = (): void => {
    if (found >= limit) return;
    // MRV：选候选最少的空格
    let best = -1;
    let bestCands: number[] = [];
    for (let idx = 0; idx < grid.length; idx += 1) {
      if (grid[idx] !== 0) continue;
      const row = Math.floor(idx / size);
      const col = idx % size;
      const cands = symbols.filter((v) => fits(grid, size, boxRows, boxCols, row, col, v));
      if (cands.length === 0) return; // 死路
      if (best === -1 || cands.length < bestCands.length) {
        best = idx;
        bestCands = cands;
        if (cands.length === 1) break;
      }
    }
    if (best === -1) {
      found += 1; // 无空格 = 一组完整解
      return;
    }
    for (const v of bestCands) {
      grid[best] = v;
      search();
      grid[best] = 0;
      if (found >= limit) return;
    }
  };
  search();
  return found;
};

/**
 * 生成谜面：完整解上按随机顺序挖洞，保持解唯一；无法挖到目标预填数时返回实际可达值
 */
export const generatePuzzle = (
  size: number,
  boxRows: number,
  boxCols: number,
  targetPrefilled: number,
  rng: Rng = defaultRng()
): SudokuPuzzle | null => {
  const solution = makeSolvedGrid(size, boxRows, boxCols, rng);
  if (!solution) return null;
  const given = [...solution];
  const total = size * size;
  const order = shuffled(
    Array.from({ length: total }, (_, i) => i),
    rng
  );

  let remaining = total;
  for (const idx of order) {
    if (remaining <= targetPrefilled) break;
    const backup = given[idx];
    given[idx] = 0;
    if (countSolutions(given, size, boxRows, boxCols, 2) === 1) {
      remaining -= 1;
    } else {
      given[idx] = backup;
    }
  }
  return { size, boxRows, boxCols, given, solution };
};

/** 找出当前盘面上行/列/宫重复的格子（空白格忽略），返回下标集合 */
export const findConflicts = (
  grid: number[],
  size: number,
  boxRows: number,
  boxCols: number
): Set<number> => {
  const conflicts = new Set<number>();
  const markGroup = (cells: number[]): void => {
    const byValue = new Map<number, number[]>();
    for (const idx of cells) {
      if (grid[idx] === 0) continue;
      const list = byValue.get(grid[idx]) || [];
      list.push(idx);
      byValue.set(grid[idx], list);
    }
    for (const list of byValue.values()) {
      if (list.length > 1) list.forEach((idx) => conflicts.add(idx));
    }
  };
  for (let r = 0; r < size; r += 1) {
    markGroup(Array.from({ length: size }, (_, c) => r * size + c)); // 行
    markGroup(Array.from({ length: size }, (_, c) => c * size + r)); // 列
  }
  const boxCount = (size / boxRows) * (size / boxCols);
  for (let b = 0; b < boxCount; b += 1) {
    const cells: number[] = [];
    for (let i = 0; i < size; i += 1) {
      for (let j = 0; j < size; j += 1) {
        if (boxIndexOf(i, j, size, boxRows, boxCols) === b) cells.push(i * size + j);
      }
    }
    markGroup(cells);
  }
  return conflicts;
};
