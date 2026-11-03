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
  S2CDrawEvent,
  S2CSpyEvent,
  S2CUnoEvent,
  S2CBlackjackEvent,
  S2CZjhEvent,
} from '@children-games/shared';

// 对外导出：useRoomWs 等模块从本文件取 WS 事件类型
export type { S2CEvent } from '@children-games/shared';

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
 * 终局数据（gameEvents.final 实时事件或快照 ended 摘要的合并形状）
 * 不同游戏字段不同：卧底带 winner/spyUserIds，排名制带 ranking
 */
export interface FinalData {
  winner?: string;
  spyUserIds?: number[];
  ranking?: Array<{ userId: number; nickname?: string; total?: number }>;
  reason?: string;
  [key: string]: unknown;
}

/**
 * 五子棋游戏状态
 */
export interface GomokuGameState {
  board: number[][];
  turn: number;
  winner: number;
  /** 获胜五连坐标（后端为 [x, y] 元组数组） */
  winLine: Array<[number, number]>;
  lastMove: { x: number; y: number } | null;
}

/**
 * 答题对战游戏状态
 */
export interface QuizGameState {
  index: number;
  total: number;
  deadline?: number;
  qid?: number;
  text?: string;
  options?: string[];
  myAnswered?: boolean;
  scores: Array<{ userId: number; total: number }>;
  ended: { ranking: Array<{ userId: number; nickname: string; total: number }> } | null;
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
  // 后端 stroke 载荷为 { seq, points, color, width }（seq 为笔画序号，非 userId）
  strokes: Array<{ seq: number; points: number[][]; color: string; width: number }>;
  myGuessed: boolean;
  guessedUserIds: number[];
  scores: Array<{ userId: number; total: number }>;
  ended: { ranking: Array<{ userId: number; nickname: string; total: number }> } | null;
}

/**
 * 谁是卧底游戏状态
 */
export interface SpyGameState {
  round: number;
  phase: string;
  deadline: number;
  alive: number[];
  me: { role: string; word: string; alive: boolean } | null;
  eliminated: Array<{ userId: number; role: string }>;
  isRevote: boolean;
  revotePool: number[] | null;
  votedCount: number;
  total: number;
  pairCategory: string;
  ended: Record<string, unknown> | null;
  [key: string]: unknown;
}

/**
 * UNO 游戏状态
 */
export interface UnoGameState {
  top: { id: string; color: string; kind: string } | null;
  currentColor: string;
  direction: 1 | -1;
  turnSeat: number;
  counts: Array<{ userId: number; count: number }>;
  myHand: Array<{ id: string; color: string; kind: string }>;
  // 后端 UNO 结算字段是 penalty（罚分），不是 score
  ranking: Array<{ userId: number; nickname: string; penalty: number }> | null;
  ended: {
    ranking: Array<{ userId: number; nickname: string; penalty: number }>;
    reason: string;
  } | null;
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
  myCards?: string[];
  myStake?: number;
  myDone?: boolean;
  myBusted?: boolean;
  myNatural?: boolean;
  myDoubled?: boolean;
  bankerCards?: string[];
  bankerValue?: number | null;
  others?: Array<{
    userId: number;
    cardCount: number;
    stake: number;
    done: boolean;
    busted: boolean;
    natural: boolean;
  }>;
  betOptions?: number[];
  lastResults?: Array<{
    userId: number;
    outcome: string;
    delta: number;
    chips: number;
  }> | null;
  nextDeadline?: number;
  betLedger?: Array<{
    userId: number;
    round: number;
    stake: number;
    doubled: boolean;
    delta: number | null;
    outcome: string | null;
  }>;
  ended?: {
    ranking: Array<{ userId: number; nickname: string; chips: number }>;
    reason?: string;
  } | null;
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
  myCards?: string[] | null;
  mySeen?: boolean;
  myFolded?: boolean;
  myAllIn?: boolean;
  myBetTotal?: number;
  myRank?: string | null;
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
  raiseSteps?: number[];
  stakeCap?: number;
  nextDeadline?: number;
  ended?: {
    ranking: Array<{ userId: number; nickname: string; chips: number }>;
    reason?: string;
  } | null;
}

/**
 * 游戏事件类型
 * 注：quiz 事件按后端实际广播形状声明（shared 包类型滞后，勿照抄 shared）：
 * 后端 quiz.ts → quiz_question {index,total,qid,text,options,deadline}、
 * quiz_result {qid,answer,delta:[{userId,gained,total}]}、quiz_final {ranking:[{userId,nickname,total}]}
 */
export interface QuizQuestionEvent {
  t: 'quiz_question';
  index: number;
  total: number;
  qid: number;
  text: string;
  options: string[];
  deadline: number;
}

export interface QuizResultEvent {
  t: 'quiz_result';
  qid: number;
  answer: number;
  delta: Array<{ userId: number; gained: number; total: number }>;
}

export interface QuizFinalEvent {
  t: 'quiz_final';
  ranking: Array<{ userId: number; nickname: string; total: number }>;
}

// ─── 后端实际广播的事件形状（shared 包类型滞后处，按各游戏 handler 逐字段核对） ──────────

/** uno_state：counts 为按座位的数组（shared 里误作 Record<Seat, number>） */
export interface UnoStateEvent {
  t: 'uno_state';
  top: { id: string; color: string; kind: string } | null;
  currentColor: string;
  direction: 1 | -1;
  turnSeat: number;
  counts: Array<{ userId: number; count: number }>;
}

export interface UnoPlayedEvent {
  t: 'uno_played';
  userId: number;
  card: { id: string; color: string; kind: string };
  chooseColor: string | null;
}

/** blackjack_action：按 action 携带不同字段（bet 带 stake，hit/double/banker_hit 带 card/total） */
export interface BlackjackActionEvent {
  t: 'blackjack_action';
  userId: number;
  action: string;
  card?: string;
  total?: number;
  busted?: boolean;
  stake?: number;
}

/** blackjack_phase：后端 phasePayload 实际形状（含 betOptions，shared 滞后未声明） */
export interface BlackjackPhaseEvent {
  t: 'blackjack_phase';
  round: number;
  totalRounds: number;
  phase: string;
  bankerSeat: number;
  turnSeat: number;
  deadline: number;
  chips: Array<{ userId: number; chips: number }>;
  betOptions: number[];
  canPassBank: boolean;
}

/** zjh_phase：后端 phasePayload 实际形状（含 raiseSteps/stakeCap） */
export interface ZjhPhaseEvent {
  t: 'zjh_phase';
  round: number;
  totalRounds: number;
  phase: string;
  dealerSeat: number;
  pot: number;
  stake: number;
  roundNo: number;
  turnSeat: number;
  deadline: number;
  compareMinRound: number;
  aliveCount: number;
  entrants: number[];
  chips: Array<{ userId: number; chips: number }>;
  raiseSteps: number[];
  stakeCap: number;
}

export interface UnoDrewEvent {
  t: 'uno_drew';
  userId: number;
}

export interface ZjhYourCardsEvent {
  t: 'zjh_your_cards';
  cards: string[];
  rank: string;
}

/** gomoku move：winLine 为 [x,y] 元组数组（shared 里误作 {x,y} 对象数组） */
export interface GomokuMoveEvent {
  t: 'move';
  x: number;
  y: number;
  color: number;
  userId: number;
  turn: number;
  lastMove: { x: number; y: number } | null;
  winner: number;
  winLine?: Array<[number, number]> | null;
}

/** spy_vote_result：counts 为 {target,count} 数组 + out/outRole（shared 里误作 eliminated/word） */
export interface SpyVoteResultEvent {
  t: 'spy_vote_result';
  counts: Array<{ target: number; count: number }>;
  out: number | null;
  outRole: string | null;
}

/** quiz/draw 终局：按总分排名 */
export type TotalRankingFinal = {
  t: 'quiz_final' | 'draw_final';
  ranking: Array<{ userId: number; nickname: string; total: number }>;
};
/** uno 终局：按罚分排名 */
export type UnoFinalEvent = {
  t: 'uno_final';
  ranking: Array<{ userId: number; nickname: string; penalty: number }>;
};
/** 21点/炸金花终局：按积分排名 */
export type ChipsRankingFinal = {
  t: 'blackjack_final' | 'zjh_final';
  ranking: Array<{ userId: number; nickname: string; chips: number }>;
};
/** 卧底终局 */
export type SpyFinalEvent = {
  t: 'spy_final';
  winner: 'spy' | 'civilian';
  spyWord: string;
  civilianWord: string;
  spies: number[];
};

/** 用 type alias 而非 interface：保留隐式索引签名，便于赋给 Record<string, unknown> 形参 */
export type GameEvents = {
  // 答题
  question: QuizQuestionEvent | null;
  result: QuizResultEvent | null;
  // 各游戏 *_final 事件的联合（后端实际广播形状，见各游戏 handler）
  final: TotalRankingFinal | UnoFinalEvent | ChipsRankingFinal | SpyFinalEvent | null;
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
  voteResult: SpyVoteResultEvent | null;
  eliminated: unknown;
  // UNO
  uno_state: unknown;
  /** uno_turn 事件 + 客户端追加的 seq（用于 drew/turn 先后判断） */
  turn: { seat: number; deadline?: number; seq: number } | null;
  uno_played: unknown;
  uno_hand: unknown;
  /** uno_drew 事件 + 客户端追加的 seq */
  drew: { userId: number; seq: number } | null;
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
};

/**
 * WebSocket 事件映射
 */
export interface WsEventMap {
  joined: S2CJoined;
  snapshot: S2CSnapshot;
  member_update: S2CMemberUpdate;
  move: GomokuMoveEvent;
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
  // 答题（后端实际广播形状，见 QuizQuestionEvent 注释）
  quiz_question: QuizQuestionEvent;
  quiz_result: QuizResultEvent;
  quiz_final: TotalRankingFinal;
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
  draw_final: TotalRankingFinal;
  // 卧底
  spy_phase: Extract<S2CSpyEvent, { t: 'spy_phase' }>;
  spy_deal: Extract<S2CSpyEvent, { t: 'spy_deal' }>;
  spy_vote_update: Extract<S2CSpyEvent, { t: 'spy_vote_update' }>;
  spy_vote_result: SpyVoteResultEvent;
  spy_eliminated: Extract<S2CSpyEvent, { t: 'spy_eliminated' }>;
  spy_final: SpyFinalEvent;
  // UNO
  uno_state: UnoStateEvent;
  uno_turn: Extract<S2CUnoEvent, { t: 'uno_turn' }>;
  uno_played: UnoPlayedEvent;
  uno_hand: Extract<S2CUnoEvent, { t: 'uno_hand' }>;
  uno_drew: UnoDrewEvent;
  uno_final: UnoFinalEvent;
  // 21 点
  blackjack_phase: BlackjackPhaseEvent;
  blackjack_deal: Extract<S2CBlackjackEvent, { t: 'blackjack_deal' }>;
  blackjack_your_banker: Extract<S2CBlackjackEvent, { t: 'blackjack_your_banker' }>;
  blackjack_action: BlackjackActionEvent;
  blackjack_settle: Extract<S2CBlackjackEvent, { t: 'blackjack_settle' }>;
  blackjack_final: ChipsRankingFinal;
  // 炸金花
  zjh_phase: ZjhPhaseEvent;
  zjh_your_cards: ZjhYourCardsEvent;
  zjh_action: Extract<S2CZjhEvent, { t: 'zjh_action' }>;
  zjh_compare: Extract<S2CZjhEvent, { t: 'zjh_compare' }>;
  zjh_compare_cards: Extract<S2CZjhEvent, { t: 'zjh_compare_cards' }>;
  zjh_showdown: Extract<S2CZjhEvent, { t: 'zjh_showdown' }>;
  zjh_settle: Extract<S2CZjhEvent, { t: 'zjh_settle' }>;
  zjh_final: ChipsRankingFinal;
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
