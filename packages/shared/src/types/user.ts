/**
 * 用户相关类型定义
 */

/**
 * 用户基础信息（登录后返回）
 */
export interface UserInfo {
  id: number;
  nickname: string;
  avatar: string;
  level: number;
  totalStars: number;
  battleChips?: number;
  avatarHistory?: string[];
}

/**
 * 登录结果
 */
export interface LoginResult {
  token: string;
  userInfo: UserInfo;
}

/**
 * 家庭成员档案
 */
export interface FamilyProfile {
  id: number;
  nickname: string;
  avatar: string;
  level: number;
  totalStars: number;
  hasPin?: boolean;
}

/**
 * 生涯游戏统计
 */
export interface CareerGame {
  gameId: string;
  gameName: string;
  gameEmoji: string;
  highScore: number;
  totalStars: number;
  playCount: number;
  winCount: number;
}

/**
 * 我的生涯数据
 */
export interface MyCareer {
  user: {
    id: number;
    nickname: string;
    avatar: string;
    level: number;
    totalStars: number;
    battleChips: number;
    achievementCount: number;
  };
  totals: {
    playCount: number;
    winCount: number;
    totalGames: number;
  };
  last7: Array<{
    date: string;
    playCount: number;
    winCount: number;
  }>;
  games: CareerGame[];
}
