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
  color: number; // 1=黑 2=白（与后端 gomoku 引擎一致）
  userId: number;
  turn: number;
  lastMove: { x: number; y: number } | null;
  winner?: number; // 0=进行中 1/2=某方胜 3=和棋
  winLine?: Array<[number, number]> | null; // 获胜五连坐标（后端为元组数组）
}

export type S2CGomokuEvent = S2CGomokuMove;

// ─────────────────────────────────────────────────────────────
// 知识问答事件
// ─────────────────────────────────────────────────────────────

export type S2CQuizEvent =
  | { t: 'quiz_question'; index: number; total: number; qid: number; text: string; options: string[]; deadline: number }
  | { t: 'quiz_result'; qid: number; answer: number; delta: Array<{ userId: number; gained: number; total: number }> }
  | { t: 'quiz_final'; ranking: Array<{ userId: number; nickname: string; total: number }> };

// ─────────────────────────────────────────────────────────────
// 你画我猜事件
// ─────────────────────────────────────────────────────────────

export type S2CDrawEvent =
  | { t: 'draw_round'; drawerSeat: number; round: number; totalRounds: number; phase: string; wordLen?: number; category?: string; deadline?: number }
  | { t: 'draw_candidates'; words: string[] }
  | { t: 'draw_word'; word: string }
  | { t: 'draw_hint'; char: string }
  | { t: 'draw_stroke'; stroke: { seq: number; points: number[][]; color: string; width: number } }
  | { t: 'draw_undo' }
  | { t: 'draw_clear' }
  | { t: 'draw_round_end'; word: string; category: string; reason: string; scores: Array<{ userId: number; total: number }> }
  | { t: 'guess_result'; userId: number; nickname: string; correct: boolean }
  | { t: 'draw_final'; ranking: Array<{ userId: number; nickname: string; total: number }>; reason?: string };

// ─────────────────────────────────────────────────────────────
// 谁是卧底事件
// ─────────────────────────────────────────────────────────────

export type S2CSpyEvent =
  | { t: 'spy_phase'; phase: string; deadline: number; alive: number[]; isRevote: boolean; revotePool?: number[] }
  | { t: 'spy_deal'; role: string; word: string }
  | { t: 'spy_vote_update'; votedCount: number; total: number }
  | { t: 'spy_vote_result'; counts: Array<{ target: number; count: number }>; out: number | null; outRole: string | null }
  | { t: 'spy_eliminated'; userId: number; role: string }
  | { t: 'spy_final'; winner: 'civilian' | 'spy'; spyWord: string; civilianWord: string; spies: number[] };

// ─────────────────────────────────────────────────────────────
// UNO 事件
// ─────────────────────────────────────────────────────────────

export interface UnoCardLike {
  id: string;
  color: string;
  kind: string;
}

export type S2CUnoEvent =
  | { t: 'uno_state'; top: UnoCardLike | null; currentColor: string; direction: 1 | -1; turnSeat: number; counts: Array<{ userId: number; count: number }> }
  | { t: 'uno_turn'; seat: number; deadline: number }
  | { t: 'uno_played'; userId: number; card: UnoCardLike; chooseColor: string | null }
  | { t: 'uno_hand'; cards: UnoCardLike[] }
  | { t: 'uno_drew'; userId: number }
  | { t: 'uno_final'; ranking: Array<{ userId: number; nickname: string; penalty: number }> };

// ─────────────────────────────────────────────────────────────
// 21 点事件
// ─────────────────────────────────────────────────────────────

export type S2CBlackjackEvent =
  | { t: 'blackjack_phase'; round: number; totalRounds: number; phase: string; bankerSeat: number; turnSeat: number; deadline: number; chips: Array<{ userId: number; chips: number }>; betOptions: number[]; canPassBank: boolean }
  | { t: 'blackjack_deal'; round: number; hands: Array<{ userId: number; cards: string[]; natural: boolean; stake: number }>; bankerUpcard?: string | null }
  | { t: 'blackjack_your_banker'; cards: string[] }
  | { t: 'blackjack_action'; action: string; userId: number; card?: string; stake?: number; total?: number; busted?: boolean }
  | { t: 'blackjack_settle'; round: number; results: Array<{ userId: number; outcome: string; delta: number; chips: number }>; chips: Array<{ userId: number; chips: number }>; bankerCards: string[]; bankerValue: number; nextDeadline?: number }
  | { t: 'blackjack_final'; ranking: Array<{ userId: number; nickname: string; chips: number }> };

// ─────────────────────────────────────────────────────────────
// 炸金花事件
// ─────────────────────────────────────────────────────────────

export type S2CZjhEvent =
  | { t: 'zjh_phase'; round: number; totalRounds: number; phase: string; dealerSeat: number; pot: number; stake: number; roundNo: number; turnSeat: number; deadline: number; aliveCount: number; entrants: number[]; chips: Array<{ userId: number; chips: number }>; compareMinRound: number; raiseSteps: number[]; stakeCap: number }
  | { t: 'zjh_your_cards'; cards: string[]; rank: string }
  | { t: 'zjh_action'; userId: number; nickname: string; action: string; pot?: number; stake?: number; cost?: number; allIn?: boolean; aliveCount?: number }
  | { t: 'zjh_compare'; from: number; to: number; winner: number; loser: number; pot: number; aliveCount: number; cost: number; reveals?: Array<{ userId: number; nickname: string; cards: string[]; typeName: string; result: string }> }
  | { t: 'zjh_compare_cards'; oppCards: string[]; oppType: string; myCards: string[]; myType: string; result: 'win' | 'lose' }
  | { t: 'zjh_showdown'; reveals: unknown }
  | { t: 'zjh_settle'; round: number; winner: number; winnerNickname?: string; reason?: string; winAmount?: number; reveals?: unknown; deltas: Array<{ userId: number; delta: number; chips: number }>; nextDeadline?: number }
  | { t: 'zjh_final'; ranking: Array<{ userId: number; nickname: string; chips: number }> };
