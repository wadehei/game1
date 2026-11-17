<template>
  <div class="simon-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="headerItems"
      :muted="sounds.isMuted.value"
      header-class="simon-header"
      level-selectable
      @toggle-sound="sounds.toggleSound"
      @go-back="router.back()"
      @select-level="openLevelSelect"
    >
      <template #actions>
        <button class="mode-switch-btn" title="切换 3D 模式" @click="go3d">3D</button>
      </template>
    </GameHeader>

    <!-- 状态提示 -->
    <div class="status-bar">
      <span class="status-text">{{ statusText }}</span>
    </div>

    <!-- 四色音块 -->
    <div class="simon-board">
      <div
        v-for="pad in PADS"
        :key="pad.id"
        class="pad"
        :class="[pad.color, { lit: litPad === pad.id, wrong: wrongPad === pad.id }]"
        @pointerdown.stop.prevent="tapPad(pad.id)"
      >
        <span class="pad-icon">{{ pad.emoji }}</span>
      </div>
    </div>

    <div class="tip-text">跟着灯光和声音，按顺序点出来！</div>

    <!-- 游戏结果弹窗 -->
    <ResultModal
      :show="showResult"
      :won="gameWon"
      :stars="stars"
      :icon="gameWon ? '🎉' : '💪'"
      :title="gameWon ? '恭喜通关！' : '没关系，再听一次！'"
      :info="`记忆了 ${levelConfig.seqLength} 步序列`"
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
import { useSimonGame, PADS } from './useSimonGame';

const router = useRouter();

// 逻辑层（2D/3D 共用）：序列生成/播放调度/点按判定/进度上报
const {
  sounds,
  currentLevel,
  showResult,
  gameWon,
  stars,
  showLevelSelect,
  paused,
  levelConfig,
  headerItems,
  statusText,
  litPad,
  wrongPad,
  tapPad,
  openLevelSelect,
  chooseLevel,
  closeLevelSelect,
  restartGame,
  nextLevel,
  pauseGame,
  resumeGame,
} = useSimonGame();

const quitGame = () => {
  router.back();
};

// 游戏内一键切 3D
const go3d = () => {
  router.push('/simon-3d');
};
</script>

<style scoped>
.simon-game {
  min-height: 100vh;
  background: linear-gradient(180deg, #1a1a2e 0%, #24243e 100%);
  padding: 20px;
  position: relative;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.simon-header {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  margin-bottom: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

:deep(.simon-header .label) {
  color: rgba(255, 255, 255, 0.6);
}

:deep(.simon-header .value) {
  color: #fff;
}

:deep(.simon-header .sound-btn),
:deep(.simon-header .back-btn) {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.mode-switch-btn {
  background: rgba(255, 255, 255, 0.12);
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
  background: rgba(255, 255, 255, 0.26);
  transform: scale(1.1);
}

.mode-switch-btn:active {
  transform: scale(0.95);
}

.status-bar {
  text-align: center;
  margin-bottom: 16px;
}

.status-text {
  display: inline-block;
  font-size: 18px;
  font-weight: bold;
  color: #ffe66d;
  background: rgba(255, 230, 109, 0.1);
  padding: 8px 22px;
  border-radius: 20px;
}

.simon-board {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
  max-width: 340px;
  margin: 0 auto;
}

.pad {
  aspect-ratio: 1;
  border-radius: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 3px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease,
    filter 0.12s ease;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.pad:active {
  transform: scale(0.96);
}

.pad.red {
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5253 100%);
}
.pad.yellow {
  background: linear-gradient(135deg, #ffe66d 0%, #feca57 100%);
}
.pad.teal {
  background: linear-gradient(135deg, #4ecdc4 0%, #1dd1a1 100%);
}
.pad.green {
  background: linear-gradient(135deg, #95e1d3 0%, #7acbb8 100%);
}

.pad.lit {
  transform: scale(1.07);
  filter: brightness(1.35);
  box-shadow:
    0 0 0 4px rgba(255, 255, 255, 0.85),
    0 0 34px rgba(255, 255, 255, 0.6);
}

.pad.wrong {
  animation: padShake 0.4s ease;
  filter: grayscale(0.5) brightness(0.7);
}

@keyframes padShake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-7px);
  }
  50% {
    transform: translateX(7px);
  }
  75% {
    transform: translateX(-5px);
  }
}

.pad-icon {
  font-size: clamp(40px, 11vw, 58px);
  filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.3));
}

.tip-text {
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  margin-top: 18px;
}

@media (max-width: 380px) {
  .simon-board {
    gap: 10px;
  }
}
</style>
