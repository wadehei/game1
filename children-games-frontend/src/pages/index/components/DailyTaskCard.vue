<template>
  <div class="daily-task card">
    <div class="task-header">
      <span class="task-title">📋 每日任务</span>
      <span class="task-progress">{{ task.completedGames }}/{{ task.taskGoal }}</span>
    </div>
    <div class="task-content">
      <span class="task-desc">今天完成 {{ task.taskGoal }} 个不同的游戏</span>
      <div class="task-reward">
        <template v-if="task.claimed">
          <span class="reward-claimed">✅ 已完成</span>
        </template>
        <template v-else>
          <span>奖励: </span>
          <span class="reward-num">+{{ task.rewardStars }} ⭐</span>
        </template>
      </div>
    </div>
    <!-- 智能引导：任务未完成时，直接跳到今天还没玩过的游戏 -->
    <button
      v-if="!task.claimed && nextGame"
      class="task-go-btn"
      @click="$emit('goGame', nextGame.id)"
    >
      ▶ 去玩「{{ nextGame.name }}」
    </button>
  </div>
</template>

<script setup lang="ts">
import { type DailyTaskInfo } from '@/api/game';
import { type GameCatalogItem } from '@/utils/gameCatalog';

defineProps<{
  task: DailyTaskInfo;
  nextGame: GameCatalogItem | null;
}>();

defineEmits<{
  goGame: [gameId: string];
}>();
</script>

<style scoped>
.daily-task {
  background: #fff;
  padding: 20px;
  border-radius: 16px;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.task-title {
  font-size: 16px;
  font-weight: bold;
  color: #333;
}

.task-progress {
  font-size: 14px;
  color: #ff6b6b;
  font-weight: bold;
}

.task-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.task-desc {
  font-size: 14px;
  color: #666;
}

.task-go-btn {
  margin-top: 10px;
  width: 100%;
  padding: 9px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.task-go-btn:active {
  transform: scale(0.97);
}

.task-reward {
  font-size: 14px;
  color: #666;
}

.reward-num {
  color: #ffb347;
  font-weight: bold;
}

.reward-claimed {
  color: #43a047;
  font-weight: bold;
}
</style>
