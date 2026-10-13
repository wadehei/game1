import { api } from '../utils/request';
import { useGameStore } from '../store/game';
import type { AchievementMeta } from '@/utils/achievementBus';

export interface GameProgress {
  gameId: string;
  currentLevel: number;
  highScore: number;
  stars: number;
  achievements: string[];
  /** 每关星级映射，如 { "3": 2, "4": 3 } */
  levelStars?: Record<string, number>;
}

export interface DailyTaskInfo {
  completedGames: number;
  taskGoal: number;
  rewardStars: number;
  claimed: boolean;
}

// 获取所有游戏进度
export const getAllProgress = async (): Promise<GameProgress[]> => {
  const gameStore = useGameStore();
  const result = await api.get<GameProgress[]>('/game/progress');
  gameStore.setProgress(result);
  return result;
};

// 获取单个游戏进度
export const getGameProgress = async (gameId: string): Promise<GameProgress> => {
  const result = await api.get<GameProgress>(`/game/progress/${gameId}`);
  return result;
};

// 更新游戏进度
export const updateGameProgress = async (
  gameId: string,
  data: { level: number; score?: number; stars?: number; achievements?: string[] }
): Promise<GameProgress & { totalStars: number; level: number; newAchievements?: AchievementMeta[] }> => {
  const gameStore = useGameStore();
  const result = await api.post<GameProgress & { totalStars: number; level: number; newAchievements?: AchievementMeta[] }>(
    `/game/progress/${gameId}`,
    data
  );
  gameStore.updateProgress(gameId, result);
  return result;
};

// 获取排行榜
export const getLeaderboard = async (gameId: string, limit = 50) => {
  return api.get(`/game/leaderboard/${gameId}`, { limit });
};

// 获取今日任务进度
export const getDailyTask = async (): Promise<DailyTaskInfo> => {
  return api.get<DailyTaskInfo>('/game/daily-task');
};

// 获取成就列表
export interface AchievementInfo extends AchievementMeta {
  desc: string;
  unlocked: boolean;
}

export const getAchievements = async (): Promise<AchievementInfo[]> => {
  return api.get<AchievementInfo[]>('/game/achievements');
};
