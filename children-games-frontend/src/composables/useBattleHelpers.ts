/**
 * 对战模式通用辅助函数
 * 提取自 BlackjackGame/DdzGame/DrawGame/ZjhGame 等组件的重复代码
 */
import type { Ref } from 'vue';

/** 房间成员类型（各游戏组件 props 中定义的成员结构） */
export interface BattleMember {
  userId: number;
  nickname: string;
  avatar?: string;
  seat: number;
}

export interface BattleHelpersOptions {
  members: Ref<BattleMember[] | undefined>;
  myId: Ref<number>;
}

/**
 * 对战模式通用辅助函数
 * - nameOfUser: 根据 userId 获取显示名称（自己加"（我）"后缀）
 * - nameOfSeat: 根据座位号获取显示名称
 * - seatOfUser: 根据 userId 获取座位号
 */
export function useBattleHelpers(options: BattleHelpersOptions) {
  const { members, myId } = options;

  /**
   * 根据 userId 获取显示名称
   * - 找到自己的 userId 时追加"（我）"后缀
   * - 找不到时返回"角色{userId}"
   */
  const nameOfUser = (userId: number): string => {
    const m = members.value?.find((x) => x.userId === userId);
    if (!m) return `角色${userId}`;
    return m.userId === myId.value ? `${m.nickname}（我）` : m.nickname;
  };

  /**
   * 根据座位号获取显示名称
   * - 找到自己的座位时追加"（我）"后缀
   * - 找不到时返回"座位{seat+1}"
   */
  const nameOfSeat = (seat: number): string => {
    const m = members.value?.find((x) => x.seat === seat);
    if (!m) return `座位${seat + 1}`;
    return m.userId === myId.value ? `${m.nickname}（我）` : m.nickname;
  };

  /**
   * 根据 userId 获取座位号
   * - 找不到时返回 -1
   */
  const seatOfUser = (userId: number): number =>
    members.value?.find((x) => x.userId === userId)?.seat ?? -1;

  /**
   * 根据座位号获取 userId
   * - 找不到时返回 undefined
   */
  const userIdOfSeat = (seat: number): number | undefined =>
    members.value?.find((x) => x.seat === seat)?.userId;

  /**
   * 判断是否是自己的 userId
   */
  const isMyself = (userId: number): boolean => userId === myId.value;

  /**
   * 判断是否是自己的座位
   */
  const isMySeat = (seat: number): boolean => {
    const m = members.value?.find((x) => x.seat === seat);
    return m?.userId === myId.value;
  };

  return {
    nameOfUser,
    nameOfSeat,
    seatOfUser,
    userIdOfSeat,
    isMyself,
    isMySeat,
  };
}
