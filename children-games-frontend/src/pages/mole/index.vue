<template>
  <div class="mole-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="headerItems"
      :muted="sounds.isMuted.value"
      header-class="mole-header"
      level-selectable
      @toggle-sound="sounds.toggleSound"
      @go-back="router.back()"
      @select-level="openLevelSelect"
    >
      <template #actions>
        <button class="mode-switch-btn" title="切换 3D 模式" @click="go3d">3D</button>
      </template>
    </GameHeader>

    <!-- 打地鼠 3x3 -->
    <div class="mole-board">
      <div v-for="(hole, index) in holes" :key="index" class="hole">
        <div
          v-if="hole.state !== 'empty'"
          class="critter"
          :class="[hole.kind, hole.state, { tempt: hole.kind === 'bunny' }]"
          @pointerdown.stop.prevent="whack(index)"
        >
          <span class="critter-face">{{ hole.kind === 'bunny' ? '🐰' : '🐹' }}</span>
          <span v-if="hole.state === 'whacked'" class="hammer">🔨</span>
          <span v-if="hole.state === 'whacked'" class="hit-effect">💥</span>
        </div>
      </div>
    </div>

    <!-- 游戏结果弹窗 -->
    <ResultModal
      :show="showResult"
      :won="gameWon"
      :stars="stars"
      :icon="gameWon ? '🎉' : '💪'"
      :title="gameWon ? '恭喜通关！' : failReason"
      :info="`击中 ${hits} 只地鼠`"
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
import { useMoleGame } from './useMoleGame';
import { onMounted } from 'vue';
import { getGameMode, setGameMode, maybeShow3dHint } from '@/utils/modePreference';
import { showToast } from '@/utils/toastBus';

const router = useRouter();

// 逻辑层（2D/3D 共用）：生成节奏/命中判定/生命计时/进度上报
const {
  sounds,
  currentLevel,
  hits,
  hearts,
  timeLeft,
  showResult,
  gameWon,
  stars,
  failReason,
  paused,
  showLevelSelect,
  holes,
  levelConfig,
  headerItems,
  whack,
  pauseGame,
  resumeGame,
  openLevelSelect,
  closeLevelSelect,
  chooseLevel,
  restartGame,
  nextLevel,
} = useMoleGame();

const quitGame = () => {
  router.back();
};

// 游戏内一键切 3D
const go3d = () => {
  setGameMode('mole', '3d');
  router.push('/mole-3d');
};
// 默认模式：家长中心设为 3D 或本游戏上次切到 3D → 直接进 3D 版
onMounted(() => {
  if (getGameMode('mole') === '3d') {
    router.replace('/mole-3d');
    return;
  }
  if (maybeShow3dHint('mole')) {
    showToast('试试右上角「3D」按钮，切换立体画面～', 'info');
  }
});
</script>

<style scoped>
.mole-game {
  min-height: 100vh;
  background: linear-gradient(180deg, #a8e063 0%, #56ab2f 100%);
  padding: 20px;
  position: relative;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.mole-header {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  margin-bottom: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

:deep(.mole-header .label) {
  color: #4a7c2a;
  font-weight: 600;
}

:deep(.mole-header .value) {
  color: #2d5a12;
}

:deep(.mole-header .value.warning) {
  color: #e67e22;
}

:deep(.mole-header .sound-btn),
:deep(.mole-header .back-btn) {
  background: rgba(86, 171, 47, 0.15);
}

.mode-switch-btn {
  background: rgba(86, 171, 47, 0.15);
  color: #2d5a12;
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
  background: rgba(86, 171, 47, 0.3);
  transform: scale(1.1);
}

.mode-switch-btn:active {
  transform: scale(0.95);
}

.mole-board {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  max-width: 420px;
  margin: 0 auto;
  padding: 16px;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 20px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.hole {
  aspect-ratio: 1;
  position: relative;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, #3d2817 0%, #5d3a1a 55%, #8b5a2b 100%);
  box-shadow:
    inset 0 6px 14px rgba(0, 0, 0, 0.55),
    0 3px 0 rgba(255, 255, 255, 0.35);
  overflow: hidden;
}

.critter {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: 78%;
  height: 78%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  animation: critterUp 0.16s ease-out;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.critter-face {
  font-size: clamp(34px, 9vw, 52px);
  line-height: 1;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.3));
}

.critter.bunny.tempt .critter-face {
  animation: temptWiggle 0.8s ease-in-out infinite;
}

.critter.whacked {
  animation: critterWhacked 0.25s ease-in forwards;
}

/* 敲击锤子：从右上抡下来 */
.hammer {
  position: absolute;
  right: -8px;
  top: -16px;
  font-size: 32px;
  transform-origin: 85% 85%;
  animation: hammerSmack 0.28s ease-out forwards;
  pointer-events: none;
  z-index: 2;
}

@keyframes hammerSmack {
  0% {
    transform: rotate(-70deg) scale(1.15);
    opacity: 1;
  }
  55% {
    transform: rotate(6deg) scale(1);
    opacity: 1;
  }
  100% {
    transform: rotate(6deg) translateY(5px);
    opacity: 0;
  }
}

.hit-effect {
  position: absolute;
  font-size: 30px;
  animation: hitPop 0.25s ease-out forwards;
}

@keyframes critterUp {
  from {
    transform: translateX(-50%) translateY(90%);
  }
  to {
    transform: translateX(-50%) translateY(0);
  }
}

@keyframes critterWhacked {
  0% {
    transform: translateX(-50%) scale(1);
    opacity: 1;
  }
  100% {
    transform: translateX(-50%) scale(0.3) rotate(20deg);
    opacity: 0;
  }
}

@keyframes temptWiggle {
  0%,
  100% {
    transform: rotate(-6deg);
  }
  50% {
    transform: rotate(6deg);
  }
}

@keyframes hitPop {
  0% {
    transform: scale(0.5);
    opacity: 1;
  }
  100% {
    transform: scale(1.6);
    opacity: 0;
  }
}

/* 响应式 */
@media (max-width: 480px) {
  .mole-board {
    gap: 10px;
    padding: 12px;
  }
}
</style>
