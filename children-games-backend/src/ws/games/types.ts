// 游戏插件接口定义：每个对战游戏实现一个 GameHandler，由 wsServer 路由分发
import type { Room, Member } from '../roomManager';

export type GameType = 'gomoku' | 'quiz' | 'draw' | 'spy' | 'uno';

export interface ActionResult {
  error?: string; // 非法操作原因，回给操作者
  broadcast?: Array<Record<string, unknown>>; // 广播事件
  toMember?: Array<{ userId: number; msg: Record<string, unknown> }>; // 点对点事件
  ended?: { winnerSeat: number; reason: string } | null; // 非空 = 对局结束（winnerSeat -1 表示无人获胜如平局）
}

export interface GameHandler<S = any> {
  type: GameType;
  title: string; // 大厅展示名
  emoji: string; // 大厅图标
  desc: string; // 一句话玩法说明
  minPlayers: number; // 达到即可开局
  maxPlayers: number; // 座位上限，超出自动转观战
  allowSpectators: boolean;
  rematchSwapSeats: boolean; // 重开时是否交换座位
  create(): S; // 初始游戏状态
  start?(room: Room): ActionResult | void; // ready→playing 时调用（抽题/发牌/发词）
  onPlayerQuit?(room: Room, member: Member): ActionResult | void; // 对局中成员退出
  onMemberOffline?(room: Room, member: Member): void; // 对局中成员掉线（还有 60s 重连期，游戏可提前处置如结束当前回合）
  onAction(room: Room, member: Member, action: string, payload: any): ActionResult;
  serializeFor(room: Room, viewer: Member): Record<string, unknown>; // 按观看者序列化游戏状态
}
