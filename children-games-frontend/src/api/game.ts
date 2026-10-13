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
  playedGames?: string[];
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

// 记一局游玩（失败结算时上报，胜局随保存进度自动计入）
export const recordPlay = (gameId: string): void => {
  api.post(`/user/play/${gameId}`).catch(() => {
    // 离线时丢弃（生涯统计以服务器为准）
  });
};

// ─── 关卡难度覆盖（后台可调） ────────────────────────────────

type LevelOverride = Record<string, number | boolean>;

/** 读取某关卡的云端难度覆盖；失败/无覆盖返回 null（前端回退内置公式）。
 *  每次进关卡实时拉取（请求极小），保证后台改动重进即生效 */
export const getLevelOverride = async (gameId: string, level: number): Promise<LevelOverride | null> => {
  try {
    const result = await api.get<{ override: LevelOverride | null }>(`/level/${gameId}/${level}`);
    return result?.override || null;
  } catch {
    return null;
  }
};

// 获取成就列表
export interface AchievementInfo extends AchievementMeta {
  desc: string;
  unlocked: boolean;
}

export const getAchievements = async (): Promise<AchievementInfo[]> => {
  return api.get<AchievementInfo[]>('/game/achievements');
};
