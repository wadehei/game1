import { useGameStore } from '@/store/game';
import { getGameProgress, updateGameProgress } from '@/api/game';
import { notifyAchievements } from '@/utils/achievementBus';

const localKey = (gameId: string) => `game_progress_${gameId}`;

interface LocalProgress {
  level: number;
  score?: number;
  stars?: number;
}

function readLocalProgress(gameId: string): LocalProgress | null {
  try {
    const raw = localStorage.getItem(localKey(gameId));
    return raw ? (JSON.parse(raw) as LocalProgress) : null;
  } catch {
    return null;
  }
}

/**
 * 游戏进度读写
 * - 进入游戏时读取云端进度续关（store → API → 本地缓存 → 第1关）
 * - 通关保存时优先上云，失败时写本地缓存，下次联网后以较高进度为准
 */
export function useGameProgress(gameId: string) {
  const gameStore = useGameStore();

  const loadStartLevel = async (): Promise<number> => {
    const cached = gameStore.getProgress(gameId);
    if (cached && cached.currentLevel > 1) {
      return cached.currentLevel;
    }
    try {
      const progress = await getGameProgress(gameId);
      gameStore.updateProgress(gameId, progress);
      return progress?.currentLevel || 1;
    } catch {
      const local = readLocalProgress(gameId);
      return local?.level || 1;
    }
  };

  const saveProgress = async (data: { level: number; score: number; stars: number }): Promise<void> => {
    try {
      const result = await updateGameProgress(gameId, data);
      localStorage.removeItem(localKey(gameId));
      // 新解锁的成就交给全局 toast 展示
      if (result?.newAchievements?.length) {
        notifyAchievements(result.newAchievements);
      }
    } catch {
      try {
        const prev = readLocalProgress(gameId);
        const better = !prev || data.level > prev.level ||
          (data.level === prev.level && (data.score || 0) > (prev.score || 0));
        if (better) {
          localStorage.setItem(localKey(gameId), JSON.stringify(data));
        }
      } catch {
        // localStorage 不可用时放弃
      }
    }
  };

  return { loadStartLevel, saveProgress };
}
