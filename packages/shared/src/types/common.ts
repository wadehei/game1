/**
 * 通用类型定义
 */

/**
 * 游戏类型枚举
 */
export type GameType = 'gomoku' | 'quiz' | 'draw' | 'spy' | 'uno' | 'blackjack' | 'zjh';

/**
 * 游戏类型数组（用于迭代）
 */
export const GAME_TYPES: readonly GameType[] = [
  'gomoku',
  'quiz',
  'draw',
  'spy',
  'uno',
  'blackjack',
  'zjh',
] as const;

/**
 * API 响应信封
 */
export interface ApiResponse<T = unknown> {
  code: number;
  message?: string;
  data?: T;
}

/**
 * 分页响应
 */
export interface PaginatedResponse<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 座位号类型
 * 0-1: 具体座位
 * -1: 无座位/观众
 */
export type Seat = 0 | 1 | -1;

/**
 * 房间阶段
 */
export type RoomPhase = 'waiting' | 'playing' | 'ended';
