/**
 * WebSocket 消息类型定义
 */

import type { Seat, GameType } from './common';
import type { MemberInfo, ChatItem, VoiceItem } from './room';

/**
 * 客户端 → 服务端消息
 */
export type C2SMessage =
  | C2SReady
  | C2SRematch
  | C2SLeave
  | C2SDisband
  | C2SResign
  | C2SChat
  | C2SVoice
  // 各游戏 action
  | C2SGomokuMove
  | C2SQuizAnswer
  | C2SDrawAction
  | C2SSpyVote
  | C2SUnoAction
  | C2SBlackjackAction
  | C2SZjhAction;

// ─────────────────────────────────────────────────────────────
// 房间通用消息
// ─────────────────────────────────────────────────────────────

export interface C2SReady {
  t: 'ready';
}

export interface C2SRematch {
  t: 'rematch';
}

export interface C2SLeave {
  t: 'leave';
}

export interface C2SDisband {
  t: 'disband';
}

export interface C2SResign {
  t: 'resign';
}

export interface C2SChat {
  t: 'chat';
  kind: 'text' | 'emoji' | 'quick';
  content: string;
}

export interface C2SVoice {
  t: 'voice';
  voiceId: string;
  duration: number;
}

// ─────────────────────────────────────────────────────────────
// 五子棋
// ─────────────────────────────────────────────────────────────

export interface C2SGomokuMove {
  t: 'move';
  x: number;
  y: number;
}

// ─────────────────────────────────────────────────────────────
// 知识问答
// ─────────────────────────────────────────────────────────────

export interface C2SQuizAnswer {
  t: 'quiz_answer';
  answerId: number;
}

// ─────────────────────────────────────────────────────────────
// 你画我猜
// ─────────────────────────────────────────────────────────────

export type C2SDrawAction =
  | { t: 'draw_stroke'; strokes: unknown[] }
  | { t: 'draw_undo' }
  | { t: 'draw_clear' }
  | { t: 'draw_guess'; content: string }
  | { t: 'draw_pick_word'; word: string };

// ─────────────────────────────────────────────────────────────
// 谁是卧底
// ─────────────────────────────────────────────────────────────

export interface C2SSpyVote {
  t: 'spy_vote';
  targetUserId: number;
}

// ─────────────────────────────────────────────────────────────
// UNO
// ─────────────────────────────────────────────────────────────

export type C2SUnoAction =
  | { t: 'uno_play'; card: unknown; chooseColor?: string }
  | { t: 'uno_draw' };

// ─────────────────────────────────────────────────────────────
// 21 点
// ─────────────────────────────────────────────────────────────

export type C2SBlackjackAction =
  | { t: 'blackjack_bet'; stake: number }
  | { t: 'blackjack_hit' }
  | { t: 'blackjack_stand' }
  | { t: 'blackjack_double'; stake: number };

// ─────────────────────────────────────────────────────────────
// 炸金花
// ─────────────────────────────────────────────────────────────

export type C2SZjhAction =
  | { t: 'zjh_look' }
  | { t: 'zjh_call'; amount: number }
  | { t: 'zjh_fold' }
  | { t: 'zjh_compare'; targetUserId: number };

/**
 * 服务端 → 客户端事件
 */
export type S2CEvent =
  | S2CJoined
  | S2CSnapshot
  | S2CMemberUpdate
  | S2CGameStart
  | S2CGameRestart
  | S2CGameOver
  | S2CError
  | S2CRematchVote
  | S2CRematchDeadline
  | S2CChat
  | S2CVoice
  | S2CClosed
  | S2CDisconnected
  // 各游戏事件
  | S2CGomokuEvent
  | S2CQuizEvent
  | S2CDrawEvent
  | S2CSpyEvent
  | S2CUnoEvent
  | S2CBlackjackEvent
  | S2CZjhEvent;

// ─────────────────────────────────────────────────────────────
// 房间通用事件
// ─────────────────────────────────────────────────────────────

export interface S2CJoined {
  t: 'joined';
  yourSeat: Seat;
  members: MemberInfo[];
  phase: 'waiting' | 'playing' | 'ended';
  gameType: GameType;
  roomId: string;
}

export interface S2CSnapshot {
  t: 'snapshot';
  roomId: string;
  gameType: GameType;
  hostUserId: number;
  phase: 'waiting' | 'playing' | 'ended';
  members: MemberInfo[];
  game: Record<string, unknown>;
  chat: ChatItem[];
}

export interface S2CMemberUpdate {
  t: 'member_update';
  members: MemberInfo[];
}

export interface S2CGameStart {
  t: 'game_start';
  phase: 'playing';
}

export interface S2CGameRestart {
  t: 'game_restart';
  phase: 'playing';
}

export interface S2CGameOver {
  t: 'game_over';
  winnerSeat: number;
  reason: string;
  ranking?: Array<{ userId: number; nickname: string; score?: number }>;
}

export interface S2CError {
  t: 'error';
  message: string;
}

export interface S2CRematchVote {
  t: 'rematch_vote';
  userIds: number[];
}

export interface S2CRematchDeadline {
  t: 'rematch_deadline';
  deadline: number;
}

export interface S2CChat extends ChatItem {
  t: 'chat';
}

export interface S2CVoice extends VoiceItem {
  t: 'voice';
}

export interface S2CClosed {
  t: 'closed';
  reason?: string;
}

export interface S2CDisconnected {
  t: 'disconnected';
}

// ─────────────────────────────────────────────────────────────
// 五子棋事件
// ─────────────────────────────────────────────────────────────

export interface S2CGomokuMove {
  t: 'move';
  x: number;
  y: number;
  color: 'black' | 'white';
  turn: Seat;
  lastMove: { x: number; y: number };
  winner?: Seat;
  winLine?: Array<{ x: number; y: number }>;
}

export type S2CGomokuEvent = S2CGomokuMove;

// ─────────────────────────────────────────────────────────────
// 知识问答事件
// ─────────────────────────────────────────────────────────────

export type S2CQuizEvent =
  | { t: 'quiz_question'; questionId: number; question: string; options: string[]; deadline: number }
  | { t: 'quiz_result'; questionId: number; correctAnswer: number; ranking: Array<{ userId: number; score: number }> }
  | { t: 'quiz_final'; ranking: Array<{ userId: number; nickname: string; score: number }> };

// ─────────────────────────────────────────────────────────────
// 你画我猜事件
// ─────────────────────────────────────────────────────────────

export type S2CDrawEvent =
  | { t: 'draw_round'; drawerSeat: Seat; round: number; totalRounds: number; deadline: number; wordLen: number; category: string; phase: string }
  | { t: 'draw_candidates'; words: string[] }
  | { t: 'draw_word'; word: string }
  | { t: 'draw_hint'; hint: string }
  | { t: 'draw_stroke'; strokes: unknown[] }
  | { t: 'draw_undo' }
  | { t: 'draw_clear' }
  | { t: 'draw_round_end'; word: string; guessed: number[] }
  | { t: 'guess_result'; userId: number; nickname: string; correct: boolean }
  | { t: 'draw_final'; ranking: Array<{ userId: number; nickname: string; score: number }> };

// ─────────────────────────────────────────────────────────────
// 谁是卧底事件
// ─────────────────────────────────────────────────────────────

export type S2CSpyEvent =
  | { t: 'spy_phase'; phase: string; deadline: number; alive: number[]; isRevote: boolean; revotePool?: number[] }
  | { t: 'spy_deal'; word: string; spyCount: number }
  | { t: 'spy_vote_update'; votedCount: number; total: number }
  | { t: 'spy_vote_result'; eliminated: number; word: string }
  | { t: 'spy_eliminated'; userId: number; nickname: string; word: string }
  | { t: 'spy_final'; winner: 'civilian' | 'spy'; spyWord: string; civilianWord: string; spies: number[] };

// ─────────────────────────────────────────────────────────────
// UNO 事件
// ─────────────────────────────────────────────────────────────

export type S2CUnoEvent =
  | { t: 'uno_state'; top: unknown; currentColor: string; direction: 1 | -1; turnSeat: Seat; counts: Record<Seat, number> }
  | { t: 'uno_turn'; seat: Seat }
  | { t: 'uno_played'; card: unknown; chooseColor?: string }
  | { t: 'uno_hand'; cards: unknown[] }
  | { t: 'uno_drew'; card?: unknown }
  | { t: 'uno_final'; ranking: Array<{ userId: number; nickname: string; score: number }> };

// ─────────────────────────────────────────────────────────────
// 21 点事件
// ─────────────────────────────────────────────────────────────

export type S2CBlackjackEvent =
  | { t: 'blackjack_phase'; round: number; totalRounds: number; phase: string; bankerSeat: Seat; turnSeat: Seat; deadline: number; chips: Record<number, number>; canPassBank: boolean }
  | { t: 'blackjack_deal'; hands: Record<Seat, unknown[]>; bankerUpcard: unknown }
  | { t: 'blackjack_your_banker'; cards: unknown[] }
  | { t: 'blackjack_action'; action: string; userId: number; card?: unknown; stake?: number; total?: number; busted?: boolean }
  | { t: 'blackjack_settle'; results: Array<{ userId: number; delta: number }>; chips: Record<number, number>; bankerCards: unknown[]; bankerValue: number; nextDeadline?: number }
  | { t: 'blackjack_final'; ranking: Array<{ userId: number; nickname: string; chips: number }> };

// ─────────────────────────────────────────────────────────────
// 炸金花事件
// ─────────────────────────────────────────────────────────────

export type S2CZjhEvent =
  | { t: 'zjh_phase'; round: number; totalRounds: number; phase: string; dealerSeat: Seat; pot: number; stake: number; roundNo: number; turnSeat: Seat; deadline: number; aliveCount: number; chips: Record<number, number>; entrants: number[] }
  | { t: 'zjh_your_cards'; cards: unknown[]; rank: string }
  | { t: 'zjh_action'; action: string; userId: number; pot?: number; stake?: number; cost?: number; allIn?: boolean; aliveCount?: number }
  | { t: 'zjh_compare'; from: number; to: number; winner: number; loser: number; pot: number; aliveCount: number; cost: number }
  | { t: 'zjh_compare_cards'; cards: Record<number, unknown[]> }
  | { t: 'zjh_showdown'; hands: Record<number, { cards: unknown[]; rank: string }> }
  | { t: 'zjh_settle'; deltas: Array<{ userId: number; delta: number; chips: number }>; nextDeadline?: number }
  | { t: 'zjh_final'; ranking: Array<{ userId: number; nickname: string; chips: number }> };
