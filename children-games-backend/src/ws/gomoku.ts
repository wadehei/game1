// 五子棋纯逻辑（无状态依赖，便于测试复用）

export const BOARD_SIZE = 15;
export const EMPTY = 0;
export const BLACK = 1; // 座位0执黑先手
export const WHITE = 2; // 座位1执白

export interface GomokuState {
  board: number[][]; // 0空 1黑 2白
  turn: number; // 当前该谁落子（BLACK/WHITE）
  winner: number; // 0=进行中 1黑胜 2白胜 3平局
  winLine: [number, number][]; // 获胜五连的坐标
  moveCount: number;
  lastMove: { x: number; y: number } | null;
}

export const createGomoku = (): GomokuState => ({
  board: Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY)),
  turn: BLACK,
  winner: 0,
  winLine: [],
  moveCount: 0,
  lastMove: null,
});

const DIRS: [number, number][] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** 在 (x,y) 落子。返回错误信息；成功返回 null 并更新状态 */
export const placeStone = (g: GomokuState, player: number, x: number, y: number): string | null => {
  if (g.winner !== 0) return '对局已结束';
  if (player !== g.turn) return '还没轮到你';
  if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return '坐标超出棋盘';
  if (g.board[y][x] !== EMPTY) return '这个位置已经有棋子了';

  g.board[y][x] = player;
  g.moveCount += 1;
  g.lastMove = { x, y };

  const line = findWinLine(g.board, x, y, player);
  if (line.length >= 5) {
    g.winner = player;
    g.winLine = line.slice(0, 5);
    return null;
  }
  if (g.moveCount >= BOARD_SIZE * BOARD_SIZE) {
    g.winner = 3; // 平局
    return null;
  }
  g.turn = player === BLACK ? WHITE : BLACK;
  return null;
};

/** 从落子点向四个方向数连子，返回包含落子点的连线坐标 */
const findWinLine = (board: number[][], x: number, y: number, player: number): [number, number][] => {
  for (const [dx, dy] of DIRS) {
    const line: [number, number][] = [[x, y]];
    for (const sign of [1, -1]) {
      let nx = x + dx * sign;
      let ny = y + dy * sign;
      while (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx] === player) {
        line.push([nx, ny]);
        nx += dx * sign;
        ny += dy * sign;
      }
    }
    if (line.length >= 5) return line;
  }
  return [];
};
