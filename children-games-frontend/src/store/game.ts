import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface GameProgress {
  gameId: string;
  currentLevel: number;
  highScore: number;
  stars: number;
  achievements: string[];
  levelStars?: Record<string, number>;
}

export const useGameStore = defineStore('game', () => {
  const progressList = ref<GameProgress[]>([]);

  const setProgress = (progress: GameProgress[]) => {
    progressList.value = progress;
  };

  const updateProgress = (gameId: string, data: Partial<GameProgress>) => {
    const index = progressList.value.findIndex(p => p.gameId === gameId);
    if (index !== -1) {
      progressList.value[index] = { ...progressList.value[index], ...data };
    } else {
      progressList.value.push({
        gameId,
        currentLevel: data.currentLevel || 1,
        highScore: data.highScore || 0,
        stars: data.stars || 0,
        achievements: data.achievements || [],
      });
    }
  };

  const getProgress = (gameId: string): GameProgress | undefined => {
    return progressList.value.find(p => p.gameId === gameId);
  };

  return {
    progressList,
    setProgress,
    updateProgress,
    getProgress,
  };
});
