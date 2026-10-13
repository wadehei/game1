import { ref } from 'vue';

export interface AchievementMeta {
  id: string;
  name: string;
  icon: string;
}

/** 全局待展示的成就队列：useGameProgress 保存进度时投递，App.vue 的 toast 消费 */
export const pendingAchievements = ref<AchievementMeta[]>([]);

export const notifyAchievements = (list: AchievementMeta[]): void => {
  if (list.length > 0) {
    pendingAchievements.value.push(...list);
  }
};

export const shiftAchievement = (): AchievementMeta | undefined => {
  return pendingAchievements.value.shift();
};
