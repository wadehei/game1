/**
 * 游戏相关类型定义
 */

/**
 * 游戏进度
 */
export interface GameProgress {
  gameId: string;
  currentLevel: number;
  highScore: number;
  stars: number;
  achievements: string[];
  levelStars?: Record<string, number>;
}

/**
 * 每日任务信息
 */
export interface DailyTaskInfo {
  completedGames: number;
  playedGames?: string[];
  taskGoal: number;
  rewardStars: number;
  claimed: boolean;
}

/**
 * 成就元数据
 */
export interface AchievementMeta {
  id: string;
  name: string;
  icon: string;
  gameId?: string;
}

/**
 * 成就信息（含解锁状态）
 */
export interface AchievementInfo extends AchievementMeta {
  desc: string;
  unlocked: boolean;
}

/**
 * 排行榜条目
 */
export interface LeaderboardEntry {
  rank: number;
  userId: number;
  nickname: string;
  avatar: string;
  highScore: number;
  level: number;
}

/**
 * 游戏更新进度结果
 */
export interface UpdateProgressResult extends GameProgress {
  totalStars: number;
  level: number;
  newAchievements?: AchievementInfo[];
}
