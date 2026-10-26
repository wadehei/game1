/**
 * WebSocket 事件处理器类型
 */

import type { Ref } from 'vue';
import type {
  MemberInfo,
  ChatItem,
  VoiceItem,
  S2CEvent,
  S2CJoined,
  S2CSnapshot,
  S2CMemberUpdate,
  S2CGameStart,
  S2CGameRestart,
  S2CGameOver,
  S2CError,
  S2CRematchVote,
  S2CRematchDeadline,
  S2CChat,
  S2CVoice,
  S2CClosed,
  S2CDisconnected,
  S2CGomokuMove,
  S2CQuizEvent,
  S2CDrawEvent,
  S2CSpyEvent,
  S2CUnoEvent,
  S2CBlackjackEvent,
  S2CZjhEvent,
} from '@children-games/shared';

/**
 * 游戏状态类型（联合所有游戏）
 */
export type GameState =
  | GomokuGameState
  | QuizGameState
  | DrawGameState
  | SpyGameState
  | UnoGameState
  | BlackjackGameState
  | ZjhGameState
  | null;

/**
 * 五子棋游戏状态
 */
export interface GomokuGameState {
  board: number[][];
  turn: number;
  winner: number;
  winLine: Array<{ x: number; y: number }>;
  lastMove: { x: number; y: number } | null;
}

/**
 * 答题对战游戏状态
 */
export interface QuizGameState {
  question: S2CQuizEvent | null;
  result: {
    questionId: number;
    correctAnswer: number;
    ranking: Array<{ userId: number; score: number }>;
  } | null;
  final: { ranking: Array<{ userId: number; nickname: string; score: number }> } | null;
}

/**
 * 你画我猜游戏状态
 */
export interface DrawGameState {
  phase: string;
  drawerSeat: number;
  isDrawer: boolean;
  round: number;
  totalRounds: number;
  deadline: number;
  wordLen: number;
  category: string;
  word: string | null;
  strokes: unknown[];
  myGuessed: boolean;
  guessedUserIds: number[];
}

/**
 * 谁是卧底游戏状态
 */
export interface SpyGameState {
  phase: string;
  deadline: number;
  alive: number[];
  isRevote: boolean;
  revotePool: number[] | null;
  votedCount: number;
  total: number;
}

/**
 * UNO 游戏状态
 */
export interface UnoGameState {
  top: unknown;
  currentColor: string;
  direction: 1 | -1;
  turnSeat: number;
  counts: Record<number, number>;
}

/**
 * 21 点游戏状态
 */
export interface BlackjackGameState {
  round: number;
  totalRounds: number;
  phase: string;
  bankerSeat: number;
  turnSeat: number;
  deadline: number;
  chips: Record<number, number> | Array<{ userId: number; chips: number }>;
  canPassBank: boolean;
  isBanker?: boolean;
  myCards?: unknown[];
  myStake?: number;
  myDone?: boolean;
  myBusted?: boolean;
  myNatural?: boolean;
  myDoubled?: boolean;
  bankerCards?: unknown[];
  bankerValue?: number | null;
  lastResults?: unknown[] | null;
  nextDeadline?: number;
  betLedger?: Array<{
    userId: number;
    round: number;
    stake: number;
    doubled: boolean;
    delta: number | null;
    outcome: string | null;
  }>;
}

/**
 * 炸金花游戏状态
 */
export interface ZjhGameState {
  round: number;
  totalRounds: number;
  phase: string;
  dealerSeat: number;
  pot: number;
  stake: number;
  roundNo: number;
  turnSeat: number;
  deadline: number;
  aliveCount: number;
  chips: Record<number, number> | Array<{ userId: number; chips: number }>;
  entrants: number[];
  compareMinRound?: number;
  myCards?: unknown[] | null;
  mySeen?: boolean;
  myFolded?: boolean;
  myAllIn?: boolean;
  myBetTotal?: number;
  myRank?: unknown | null;
  myChips?: number;
  others?: Array<{
    userId: number;
    nickname: string;
    seat: number;
    seen: boolean;
    folded: boolean;
    allIn: boolean;
    betTotal: number;
  }>;
  betLedger?: Array<{
    userId: number;
    round: number;
    betTotal: number;
    delta: number | null;
    ended: string | null;
  }>;
  compareLog?: Array<{
    round: number;
    from: number;
    to: number;
    winner: number;
    seq: number;
  }>;
  nextDeadline?: number;
}

/**
 * 游戏事件类型
 */
export interface GameEvents {
  // 答题
  question: S2CQuizEvent | null;
  result: {
    questionId: number;
    correctAnswer: number;
    ranking: Array<{ userId: number; score: number }>;
  } | null;
  final: unknown;
  // 你画我猜
  round: unknown;
  stroke: unknown;
  hint: unknown;
  guessResult: unknown[] | null;
  candidates: string[];
  undo: { ts: number } | null;
  clear: { ts: number } | null;
  roundEnd: unknown;
  // 卧底
  phase: unknown;
  deal: unknown;
  voteUpdate: unknown;
  voteResult: unknown;
  eliminated: unknown;
  // UNO
  uno_state: unknown;
  turn: { seat: number; seq: number } | null;
  uno_played: unknown;
  uno_hand: unknown;
  drew: unknown;
  // 21 点
  blackjack_phase: unknown;
  blackjack_deal: unknown;
  blackjack_your_banker: unknown;
  blackjack_action: unknown;
  blackjack_settle: unknown;
  handsView: Array<{
    userId: number;
    seat?: number;
    nickname?: string;
    cards?: string[];
    stake?: number;
    done?: boolean;
    busted?: boolean;
    natural?: boolean;
  }> | null;
  doubled: { userId: number; stake: number; seq: number } | null;
  // 炸金花
  zjh_phase: unknown;
  zjh_your_cards: unknown;
  zjh_action: unknown;
  zjh_compare: unknown;
  compareCards: unknown;
  zjh_compare_cards: unknown;
  zjh_showdown: unknown;
  zjh_settle: unknown;
  yanpai: { from: number; to: number; seq: number } | null;
  compare: unknown;
  showdown: unknown;
  settle: unknown;
}

/**
 * WebSocket 事件映射
 */
export interface WsEventMap {
  joined: S2CJoined;
  snapshot: S2CSnapshot;
  member_update: S2CMemberUpdate;
  move: S2CGomokuMove;
  game_start: S2CGameStart;
  game_restart: S2CGameRestart;
  game_over: S2CGameOver;
  error: S2CError;
  rematch_vote: S2CRematchVote;
  rematch_deadline: S2CRematchDeadline;
  chat: S2CChat;
  voice: S2CVoice;
  closed: S2CClosed;
  disconnected: S2CDisconnected;
  // 答题
  quiz_question: Extract<S2CQuizEvent, { t: 'quiz_question' }>;
  quiz_result: Extract<S2CQuizEvent, { t: 'quiz_result' }>;
  quiz_final: Extract<S2CQuizEvent, { t: 'quiz_final' }>;
  // 你画我猜
  draw_round: Extract<S2CDrawEvent, { t: 'draw_round' }>;
  guess_result: Extract<S2CDrawEvent, { t: 'guess_result' }>;
  draw_candidates: Extract<S2CDrawEvent, { t: 'draw_candidates' }>;
  draw_word: Extract<S2CDrawEvent, { t: 'draw_word' }>;
  draw_hint: Extract<S2CDrawEvent, { t: 'draw_hint' }>;
  draw_stroke: Extract<S2CDrawEvent, { t: 'draw_stroke' }>;
  draw_undo: Extract<S2CDrawEvent, { t: 'draw_undo' }>;
  draw_clear: Extract<S2CDrawEvent, { t: 'draw_clear' }>;
  draw_round_end: Extract<S2CDrawEvent, { t: 'draw_round_end' }>;
  draw_final: Extract<S2CDrawEvent, { t: 'draw_final' }>;
  // 卧底
  spy_phase: Extract<S2CSpyEvent, { t: 'spy_phase' }>;
  spy_deal: Extract<S2CSpyEvent, { t: 'spy_deal' }>;
  spy_vote_update: Extract<S2CSpyEvent, { t: 'spy_vote_update' }>;
  spy_vote_result: Extract<S2CSpyEvent, { t: 'spy_vote_result' }>;
  spy_eliminated: Extract<S2CSpyEvent, { t: 'spy_eliminated' }>;
  spy_final: Extract<S2CSpyEvent, { t: 'spy_final' }>;
  // UNO
  uno_state: Extract<S2CUnoEvent, { t: 'uno_state' }>;
  uno_turn: Extract<S2CUnoEvent, { t: 'uno_turn' }>;
  uno_played: Extract<S2CUnoEvent, { t: 'uno_played' }>;
  uno_hand: Extract<S2CUnoEvent, { t: 'uno_hand' }>;
  uno_drew: Extract<S2CUnoEvent, { t: 'uno_drew' }>;
  uno_final: Extract<S2CUnoEvent, { t: 'uno_final' }>;
  // 21 点
  blackjack_phase: Extract<S2CBlackjackEvent, { t: 'blackjack_phase' }>;
  blackjack_deal: Extract<S2CBlackjackEvent, { t: 'blackjack_deal' }>;
  blackjack_your_banker: Extract<S2CBlackjackEvent, { t: 'blackjack_your_banker' }>;
  blackjack_action: Extract<S2CBlackjackEvent, { t: 'blackjack_action' }>;
  blackjack_settle: Extract<S2CBlackjackEvent, { t: 'blackjack_settle' }>;
  blackjack_final: Extract<S2CBlackjackEvent, { t: 'blackjack_final' }>;
  // 炸金花
  zjh_phase: Extract<S2CZjhEvent, { t: 'zjh_phase' }>;
  zjh_your_cards: Extract<S2CZjhEvent, { t: 'zjh_your_cards' }>;
  zjh_action: Extract<S2CZjhEvent, { t: 'zjh_action' }>;
  zjh_compare: Extract<S2CZjhEvent, { t: 'zjh_compare' }>;
  zjh_compare_cards: Extract<S2CZjhEvent, { t: 'zjh_compare_cards' }>;
  zjh_showdown: Extract<S2CZjhEvent, { t: 'zjh_showdown' }>;
  zjh_settle: Extract<S2CZjhEvent, { t: 'zjh_settle' }>;
  zjh_final: Extract<S2CZjhEvent, { t: 'zjh_final' }>;
}

/**
 * 类型安全的 WebSocket 接口
 */
export interface TypedWsLike {
  on<K extends keyof WsEventMap>(event: K, handler: (msg: WsEventMap[K]) => void): void;
  close(): void;
}

/**
 * 房间事件上下文（类型安全版本）
 */
export interface TypedRoomEventContext {
  myId: Ref<number>;
  mySeat: Ref<number>;
  gameType: Ref<string>;
  members: Ref<MemberInfo[]>;
  phase: Ref<'waiting' | 'playing' | 'ended'>;
  hostUserId: Ref<number>;
  board: Ref<number[][]>;
  game: Ref<GameState>;
  chatList: Ref<ChatItem[]>;
  voiceList: Ref<VoiceItem[]>;
  overReason: Ref<string>;
  rematchVotes: Ref<number[]>;
  rematchDeadlineAt: Ref<number>;
  lastWsError: Ref<string>;
  gameEvents: Partial<GameEvents>; // room.vue 的 reactive 事件袋（非 ref，直接读写）
  applySnapshot: (s: S2CSnapshot) => void;
  scrollChat: () => void;
  leaveToLobby: () => void;
}
