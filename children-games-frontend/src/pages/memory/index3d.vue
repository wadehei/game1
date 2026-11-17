<template>
  <div class="memory3d-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="headerItems"
      :muted="sounds.isMuted.value"
      header-class="memory3d-header"
      level-selectable
      @toggle-sound="sounds.toggleSound"
      @go-back="router.back()"
      @select-level="openLevelSelect"
    >
      <template #actions>
        <button class="mode-switch-btn" title="切换 2D 模式" @click="go2d">2D</button>
      </template>
    </GameHeader>

    <!-- 3D 场景：卡牌摆在微倾的桌面上 -->
    <div class="scene">
      <div class="table-top"></div>
      <div
        class="board3d"
        :style="{
          gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
          gridTemplateRows: `repeat(${Math.ceil(totalCards / gridSize)}, 1fr)`,
        }"
      >
        <div
          v-for="(card, index) in cards"
          :key="index"
          class="card3d"
          :class="{ flipped: card.flipped || card.matched, matched: card.matched }"
          :style="{ animationDelay: `${index * 0.05}s` }"
          @click="flipCard(index)"
        >
          <div class="card-body">
            <div class="card-face card-front">
              <span class="front-edge" aria-hidden="true"></span>
              <img :src="getAnimalImage(card.emoji)" class="card-image" alt="animal" />
            </div>
            <div class="card-face card-back">
              <span class="back-emblem">⭐</span>
            </div>
          </div>
          <div class="card-shadow" aria-hidden="true"></div>
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
import { setGameMode } from '@/utils/modePreference';

const router = useRouter();

// 同一颗逻辑心脏：只换渲染层
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
} = useMemoryGame();

const quitGame = () => {
  router.back();
};

const go2d = () => {
  setGameMode('memory', '2d');
  router.push('/memory');
};
</script>

<style scoped>
.memory3d-game {
  height: 100vh;
  /* 桌面深蓝夜色，与卡牌奶油色拉开层次 */
  background: linear-gradient(180deg, #2c3a58 0%, #1e2a44 100%);
  padding: 20px;
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}

.memory3d-header {
  background: rgba(255, 255, 255, 0.12);
  margin-bottom: 12px;
  flex-shrink: 0;
}

:deep(.memory3d-header .label) {
  color: rgba(255, 255, 255, 0.65);
}

:deep(.memory3d-header .value) {
  color: #fff;
}

:deep(.memory3d-header .value.warning) {
  color: #ffb347;
}

:deep(.memory3d-header .sound-btn),
:deep(.memory3d-header .back-btn) {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}

.mode-switch-btn {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
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
  background: rgba(255, 255, 255, 0.32);
  transform: scale(1.1);
}

.mode-switch-btn:active {
  transform: scale(0.95);
}

/* ─── 3D 场景 ─────────────────────────── */
.scene {
  flex: 1;
  min-height: 0;
  position: relative;
  perspective: 1100px;
  perspective-origin: 50% 18%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 4px 22px;
}

/* 桌面：一块微亮的斜面，给卡牌一个"搁在上面"的基准 */
.table-top {
  position: absolute;
  inset: 12% 2% 0;
  background: linear-gradient(180deg, #3b4d78 0%, #2e3d62 100%);
  border-radius: 26px 26px 0 0;
  box-shadow:
    inset 0 18px 34px rgba(255, 255, 255, 0.08),
    inset 0 -10px 30px rgba(0, 0, 0, 0.4);
  transform: rotateX(16deg);
  transform-origin: 50% 100%;
}

.board3d {
  position: relative;
  display: grid;
  gap: 10px;
  width: 100%;
  height: 100%;
  transform: rotateX(10deg);
  transform-style: preserve-3d;
}

.card3d {
  position: relative;
  min-height: 0;
  cursor: pointer;
  transform-style: preserve-3d;
  animation: cardLand 0.45s cubic-bezier(0.2, 1.3, 0.4, 1) backwards;
  -webkit-tap-highlight-color: transparent;
}

@keyframes cardLand {
  from {
    transform: translateZ(120px) rotateX(24deg);
    opacity: 0;
  }
  to {
    transform: translateZ(0) rotateX(0);
    opacity: 1;
  }
}

.card3d:hover .card-body {
  transform: translateZ(14px);
}

/* 卡片本体：翻转 + 厚度感（多层投影叠出侧边） */
.card-body {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  transition: transform 0.55s cubic-bezier(0.3, 1.35, 0.45, 1);
}

.card3d.flipped .card-body {
  transform: rotateY(180deg);
}

/* 翻开后底面朝观众，悬停改为浮起不动（避免 hover 与翻转打架） */
.card3d.flipped:hover .card-body {
  transform: rotateY(180deg) translateZ(10px);
}

/* 配对成功：持久浮起（动画终点 = 类终态，避免回弹） */
.card3d.matched .card-body {
  transform: rotateY(180deg) translateZ(22px);
  animation: matchedPop 0.55s cubic-bezier(0.3, 1.5, 0.5, 1);
}

.card3d.matched:hover .card-body {
  transform: rotateY(180deg) translateZ(22px);
}

@keyframes matchedPop {
  0% {
    transform: rotateY(180deg) translateZ(0);
  }
  45% {
    transform: rotateY(180deg) translateZ(46px);
  }
  100% {
    transform: rotateY(180deg) translateZ(22px);
  }
}

.card-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.card-front {
  background: linear-gradient(160deg, #fffdf6 0%, #f4ecd8 100%);
  transform: rotateY(180deg);
  box-shadow:
    inset 0 3px 0 rgba(255, 255, 255, 0.9),
    inset 0 -4px 0 rgba(120, 96, 60, 0.28),
    0 6px 14px rgba(10, 16, 32, 0.45);
}

/* 卡面边缘的"厚度"高光条 */
.front-edge {
  position: absolute;
  inset: 0;
  border-radius: 14px;
  border: 2px solid rgba(185, 152, 92, 0.4);
  pointer-events: none;
}

.card-back {
  background:
    radial-gradient(circle at 50% 42%, rgba(255, 236, 170, 0.5) 0%, transparent 34%),
    linear-gradient(155deg, #8d6cc4 0%, #6a4fae 58%, #553c92 100%);
  box-shadow:
    inset 0 3px 0 rgba(255, 255, 255, 0.35),
    inset 0 -5px 0 rgba(30, 16, 66, 0.5),
    0 8px 16px rgba(10, 16, 32, 0.5);
}

.card-back::after {
  content: '';
  position: absolute;
  inset: 6px;
  border: 2px dashed rgba(255, 255, 255, 0.55);
  border-radius: 10px;
}

.back-emblem {
  font-size: clamp(26px, 10vmin, 48px);
  filter: drop-shadow(0 3px 4px rgba(30, 16, 66, 0.55));
}

/* 卡片投在桌面上的影子：翻起/悬停时影子随高度变化 */
.card-shadow {
  position: absolute;
  inset: 8% 6% 0;
  border-radius: 40%;
  background: rgba(8, 12, 26, 0.4);
  filter: blur(7px);
  transform: translateZ(1px);
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}

.card3d:hover .card-shadow {
  transform: translateZ(1px) scale(1.06);
  opacity: 0.75;
}

.card3d.matched .card-shadow {
  transform: translateZ(1px) scale(0.88);
  opacity: 0.9;
}

.card-image {
  width: 92%;
  height: 92%;
  object-fit: contain;
  filter: drop-shadow(0 3px 3px rgba(90, 70, 30, 0.3));
}
</style>
