/**
 * E2E 测试共享常量
 *
 * 提取自 battle.spec.ts 和 chips.spec.ts 的重复配置
 */

// ─── 超时配置 ────────────────────────────────────────────
export const WAIT_TIMEOUT = 15000;
export const SHORT_WAIT = 2000;

// ─── 测试用户 ────────────────────────────────────────────
export interface TestUser {
  nickname: string;
  tokenKey?: string;
}

export const TEST_USERS = {
  playerA: { nickname: 'E2E_TestA', tokenKey: 'token_a' },
  playerB: { nickname: 'E2E_TestB', tokenKey: 'token_b' },
  default: { nickname: 'E2E_Test' },
} as const satisfies Record<string, TestUser>;

// ─── 积分常量 ────────────────────────────────────────────
export const CHIPS = {
  WIN: 10,
  LOSE: -5,
  INITIAL: 100,
  DAILY_RELIEF: 50,
} as const;

// ─── 游戏类型 ────────────────────────────────────────────
export type GameType = 'gomoku' | 'blackjack' | 'zjh' | 'quiz' | 'draw' | 'spy' | 'uno';

export const GAME_TYPES: GameType[] = ['gomoku', 'blackjack', 'zjh', 'quiz', 'draw', 'spy', 'uno'];
