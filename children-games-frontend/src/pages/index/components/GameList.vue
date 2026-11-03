<template>
  <div class="game-list">
    <div
      v-for="(game, idx) in games"
      :key="game.id"
      class="game-card"
      :style="{ background: game.bgColor, animationDelay: `${(idx + 1) * 0.1}s` }"
      @click="$emit('selectGame', game.id)"
    >
      <div class="game-icon">
        <img :src="game.icon" :alt="game.name" class="icon-image" loading="lazy" />
      </div>
      <div class="game-info">
        <div class="game-name">{{ game.name }}</div>
        <div class="game-progress">
          <span class="progress-text">
            关卡 {{ getLevel(game.id) }}/{{ game.totalLevels
            }}<template v-if="getScoreText(game.id)"> · {{ getScoreText(game.id) }}</template>
          </span>
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{
                width: `${Math.min((getLevel(game.id) / game.totalLevels) * 100, 100)}%`,
              }"
            />
          </div>
        </div>
      </div>
      <div class="card-right">
        <div class="game-stars">
          <span v-for="i in 3" :key="i" class="star" :class="{ active: i <= getStars(game.id) }"
            >⭐</span
          >
        </div>
        <button class="board-btn" @click.stop="$emit('openBoard', game.id, game.name)">
          🏆 排行
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type GameCatalogItem } from '@/utils/gameCatalog';

defineProps<{
  games: readonly GameCatalogItem[];
  getLevel: (gameId: string) => number;
  getStars: (gameId: string) => number;
  getScoreText: (gameId: string) => string;
}>();

defineEmits<{
  selectGame: [gameId: string];
  openBoard: [gameId: string, gameName: string];
}>();
</script>

<style scoped>
.game-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 20px;
}

.game-card {
  display: flex;
  align-items: center;
  padding: 20px;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  animation: slideInUp 0.5s ease backwards;
}

.game-card:hover,
.game-card:active {
  transform: scale(1.03);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
}

@keyframes slideInUp {
  from {
    transform: translateY(30px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.game-icon {
  width: 60px;
  height: 60px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16px;
}

.icon-image {
  width: 48px;
  height: 48px;
  object-fit: contain;
}

.game-info {
  flex: 1;
}

.game-name {
  font-size: 18px;
  font-weight: bold;
  color: #fff;
  margin-bottom: 8px;
}

.game-progress {
  display: flex;
  align-items: center;
}

.progress-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  margin-right: 8px;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 5px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #fff;
  border-radius: 5px;
  transition: width 0.3s;
}

.game-stars {
  display: flex;
  gap: 2px;
}

.card-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}

.board-btn {
  border: none;
  background: rgba(255, 255, 255, 0.3);
  color: #fff;
  font-size: 11px;
  font-weight: bold;
  padding: 4px 10px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  touch-action: manipulation;
}

.board-btn:active {
  transform: scale(0.92);
  background: rgba(255, 255, 255, 0.45);
}

.star {
  font-size: 16px;
  opacity: 0.4;
}

.star.active {
  opacity: 1;
}
</style>
