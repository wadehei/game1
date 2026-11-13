/**
 * 斗地主核心类型定义
 * 标准54张牌规则
 */

// 花色
export enum Suit {
  Spade = 'spade', // 黑桃 ♠
  Heart = 'heart', // 红心 ♥
  Diamond = 'diamond', // 方块 ♦
  Club = 'club', // 梅花 ♣
  Joker = 'joker', // 王
}

// 牌面值（3-14为数字牌，14=A；15=2；16=小王, 17=大王）
export type CardValue = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17;

// 单张牌
export interface Card {
  id: number; // 唯一ID (0-53)
  suit: Suit; // 花色
  value: CardValue; // 牌面值
}

// 牌型枚举
export enum CardPattern {
  Invalid = 'invalid', // 无效
  Single = 'single', // 单张
  Pair = 'pair', // 对子
  Triple = 'triple', // 三张
  TripleWithOne = 'triple_one', // 三带一
  TripleWithPair = 'triple_two', // 三带二
  Straight = 'straight', // 顺子 (至少5张, 3-A, 不含2和王)
  StraightPair = 'straight_pair', // 连对 (至少3对, 不含2和王)
  Airplane = 'airplane', // 飞机 (至少2个三张, 不含2和王)
  AirplaneWithSingles = 'airplane_single', // 飞机带单
  AirplaneWithPairs = 'airplane_pair', // 飞机带对
  FourWithTwo = 'four_two', // 四带二(单)
  FourWithTwoPairs = 'four_two_pair', // 四带二(对)
  Bomb = 'bomb', // 炸弹
  Rocket = 'rocket', // 火箭（双王）
}

// 牌型分析结果
export interface PatternResult {
  pattern: CardPattern;
  mainValue: CardValue; // 主要牌面值（用于比较大小）
  length: number; // 主牌长度（顺子/连对/飞机用）
  cards: Card[]; // 组成的牌
}

// 玩家
export interface Player {
  id: number; // 0,1,2
  name: string;
  cards: Card[]; // 手牌
  isLandlord: boolean; // 是否地主
  isHuman: boolean; // 是否真人
}

// 游戏状态
export enum GameStatus {
  Waiting = 'waiting', // 等待开始
  Dealing = 'dealing', // 发牌中
  Bidding = 'bidding', // 叫地主
  Playing = 'playing', // 出牌中
  Finished = 'finished', // 游戏结束
}

// 出牌记录
export interface PlayRecord {
  playerId: number;
  cards: Card[] | null; // null表示pass
  pattern: PatternResult | null;
  timestamp: number;
}

// 游戏状态
export interface GameState {
  status: GameStatus;
  deck: Card[]; // 牌堆
  bottomCards: Card[]; // 底牌（3张）
  players: Player[];
  currentPlayer: number; // 当前出牌玩家索引
  landlordPlayer: number; // 地主玩家索引
  lastPlay: PlayRecord | null; // 最后有效出牌
  lastActivePlayer: number; // 最后出牌的玩家
  passCount: number; // 连续pass次数
  bidHistory: number[]; // 叫分历史
  currentBid: number; // 当前最高叫分
  bidPlayer: number; // 当前叫分玩家
  multiplier: number; // 倍数（炸弹/火箭会翻倍）
  winner: number | null; // 赢家
}

// AI 难度
export type AIDifficulty = 'easy' | 'normal' | 'hard';

// 游戏配置
export interface GameConfig {
  aiDifficulty: AIDifficulty;
  humanPlayerIndex: number; // 真人玩家索引，默认0
}
