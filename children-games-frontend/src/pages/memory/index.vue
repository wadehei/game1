<template>
  <div class="memory-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="headerItems"
      :muted="sounds.isMuted.value"
      header-class="memory-header"
      level-selectable
      @toggle-sound="sounds.toggleSound"
      @go-back="router.back()"
      @select-level="openLevelSelect"
    >
      <template #actions>
        <button class="mode-switch-btn" title="切换 3D 模式" @click="go3d">3D</button>
      </template>
    </GameHeader>

    <!-- 游戏画布 -->
    <div
      class="game-board"
      :style="{
        gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
        gridTemplateRows: `repeat(${Math.ceil(totalCards / gridSize)}, 1fr)`,
      }"
    >
      <div
        v-for="(card, index) in cards"
        :key="index"
        class="card"
        :class="{ flipped: card.flipped || card.matched, matched: card.matched }"
        :style="{ animationDelay: `${index * 0.05}s` }"
        @click="flipCard(index)"
      >
        <div class="card-inner">
          <div class="card-front">
            <img :src="getAnimalImage(card.emoji)" class="card-image" alt="animal" />
          </div>
          <div class="card-back">
            <span class="card-question">⭐</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 游戏结果弹窗 -->
    <ResultModal
      :show="showResult"
      :won="gameWon"
      :stars="stars"
      :icon="gameWon ? '🎉' : '💪'"
      :title="gameWon ? '恭喜通关！' : '时间到，再试一次！'"
      :info="`用时: ${levelConfig.timeLimit - timeLeft}秒 · 步数: ${moves}步`"
      @retry="restartGame"
      @next="nextLevel"
    />

    <!-- 暂停 -->
    <PauseMenu :show="paused" @pause="pauseGame" @resume="resumeGame" @quit="quitGame" />

    <!-- 选关弹层 -->
    <LevelSelectModal
      :show="showLevelSelect"
      :max-level="currentLevel"
      :current="currentLevel"
      @select="chooseLevel"
      @close="closeLevelSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import GameHeader from '@/components/GameHeader.vue';
import ResultModal from '@/components/ResultModal.vue';
import LevelSelectModal from '@/components/LevelSelectModal.vue';
import PauseMenu from '@/components/PauseMenu.vue';
import { useMemoryGame } from './useMemoryGame';
import { getAnimalImage } from './animalImages';
import { onMounted } from 'vue';
import { getGameMode, setGameMode, maybeShow3dHint } from '@/utils/modePreference';
import { showToast } from '@/utils/toastBus';

const router = useRouter();

// 逻辑层（2D/3D 共用）：翻牌判定/计时/进度上报/难度系统
const game = useMemoryGame();
const {
  sounds,
  currentLevel,
  moves,
  timeLeft,
  cards,
  showResult,
  gameWon,
  stars,
  paused,
  showLevelSelect,
  levelConfig,
  gridSize,
  totalCards,
  headerItems,
  flipCard,
  pauseGame,
  resumeGame,
  openLevelSelect,
  closeLevelSelect,
  chooseLevel,
  restartGame,
  nextLevel,
} = game;

const quitGame = () => {
  router.back();
};

// 游戏内一键切 3D（进度/关卡在同一存档上无缝衔接）
const go3d = () => {
  setGameMode('memory', '3d');
  router.push('/memory-3d');
};
// 默认模式：家长中心设为 3D 或本游戏上次切到 3D → 直接进 3D 版
onMounted(() => {
  if (getGameMode('memory') === '3d') {
    router.replace('/memory-3d');
    return;
  }
  if (maybeShow3dHint('memory')) {
    showToast('试试右上角「3D」按钮，切换立体画面～', 'info');
  }
});
</script>

<style scoped>
.memory-game {
  height: 100vh;
  /* 低饱和蓝灰渐变：长时间注视不易视疲劳 */
  background: linear-gradient(180deg, #bcc8de 0%, #97a8c8 100%);
  padding: 20px;
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}

.memory-header {
  background: rgba(255, 255, 255, 0.45);
  margin-bottom: 12px;
  flex-shrink: 0;
}

:deep(.memory-header .label) {
  color: #5a6a85;
}

:deep(.memory-header .value) {
  color: #2f3c55;
}

:deep(.memory-header .value.warning) {
  color: #d98e04;
}

:deep(.memory-header .sound-btn) {
  background: rgba(255, 255, 255, 0.55);
  color: #3d4a63;
}

:deep(.memory-header .back-btn) {
  background: rgba(255, 255, 255, 0.55);
  color: #3d4a63;
}

.mode-switch-btn {
  background: rgba(255, 255, 255, 0.55);
  color: #3d4a63;
  border: none;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.mode-switch-btn:hover {
  background: rgba(255, 255, 255, 0.8);
  transform: scale(1.1);
}

.mode-switch-btn:active {
  transform: scale(0.95);
}

.game-board {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 6px;
  padding: 8px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

.card {
  perspective: 1000px;
  cursor: pointer;
  animation: cardAppear 0.3s ease backwards;
  min-height: 0;
  overflow: hidden;
}

@keyframes cardAppear {
  from {
    transform: scale(0.8);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.card.matched {
  animation: matchGlow 0.5s ease;
}

@keyframes matchGlow {
  0% {
    box-shadow: 0 0 0 0 rgba(226, 178, 96, 0.55);
  }
  50% {
    box-shadow: 0 0 16px 8px rgba(226, 178, 96, 0.25);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(226, 178, 96, 0);
  }
}

.card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.6s;
  transform-style: preserve-3d;
}

.card.flipped .card-inner {
  transform: rotateY(180deg);
}

.card-front,
.card-back {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-front {
  background: #fdfcf8;
  transform: rotateY(180deg);
  box-shadow: 0 2px 8px rgba(47, 60, 85, 0.08);
}

.card-back {
  /* 柔和奶油色卡背：圆点纹理降低对比，护眼 */
  background-image:
    radial-gradient(rgba(255, 255, 255, 0.5) 2.5px, transparent 2.5px),
    linear-gradient(135deg, #f4e3c8 0%, #ead0ab 100%);
  background-size:
    18px 18px,
    100% 100%;
  box-shadow: 0 2px 8px rgba(47, 60, 85, 0.12);
}

.card-back::after {
  content: '';
  position: absolute;
  inset: 5px;
  border: 2px dashed rgba(255, 255, 255, 0.75);
  border-radius: 7px;
}

.card-image {
  width: 96%;
  height: 96%;
  object-fit: contain;
}

.card-question {
  font-size: clamp(28px, 12vmin, 56px);
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.25));
}
</style>
