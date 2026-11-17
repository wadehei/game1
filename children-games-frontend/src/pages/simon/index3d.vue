<template>
  <div class="simon3d-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="headerItems"
      :muted="sounds.isMuted.value"
      header-class="simon3d-header"
      level-selectable
      @toggle-sound="sounds.toggleSound"
      @go-back="router.back()"
      @select-level="openLevelSelect"
    >
      <template #actions>
        <button class="mode-switch-btn" title="切换 2D 模式" @click="go2d">2D</button>
      </template>
    </GameHeader>

    <!-- 状态提示 -->
    <div class="status-bar">
      <span class="status-text">{{ statusText }}</span>
    </div>

    <!-- 3D 街机面板：四枚厚实按键立在斜面上 -->
    <div class="scene">
      <div class="console3d">
        <div class="console-panel">
          <div
            v-for="pad in PADS"
            :key="pad.id"
            class="key3d"
            :class="[pad.color, { lit: litPad === pad.id, wrong: wrongPad === pad.id }]"
            @pointerdown.stop.prevent="tapPad(pad.id)"
          >
            <span class="key-icon">{{ pad.emoji }}</span>
          </div>
        </div>
        <div class="console-front" aria-hidden="true"></div>
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
import { setGameMode } from '@/utils/modePreference';

const router = useRouter();

// 同一颗逻辑心脏：只换渲染层
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

const go2d = () => {
  setGameMode('simon', '2d');
  router.push('/simon');
};
</script>

<style scoped>
.simon3d-game {
  min-height: 100vh;
  background: linear-gradient(180deg, #141428 0%, #262650 100%);
  padding: 20px;
  position: relative;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
}

.simon3d-header {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  margin-bottom: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

:deep(.simon3d-header .label) {
  color: rgba(255, 255, 255, 0.6);
}

:deep(.simon3d-header .value) {
  color: #fff;
}

:deep(.simon3d-header .sound-btn),
:deep(.simon3d-header .back-btn) {
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
  margin-bottom: 10px;
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

/* ─── 3D 街机面板 ─────────────────────── */
.scene {
  perspective: 900px;
  perspective-origin: 50% -12%;
  display: flex;
  justify-content: center;
  padding: 8px 0 30px;
}

.console3d {
  position: relative;
  width: min(88vw, 360px);
  transform-style: preserve-3d;
}

/* 面板本体：斜面朝向玩家 */
.console-panel {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18px;
  padding: 22px;
  border-radius: 26px;
  background: linear-gradient(165deg, #33335e 0%, #232348 100%);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow:
    inset 0 10px 24px rgba(255, 255, 255, 0.08),
    inset 0 -8px 20px rgba(0, 0, 0, 0.45),
    0 18px 40px rgba(0, 0, 0, 0.5);
  transform: rotateX(24deg);
  transform-style: preserve-3d;
}

/* 面板前缘厚度：让控制台"立"起来 */
.console-front {
  position: absolute;
  left: 2%;
  right: 2%;
  bottom: -20px;
  height: 22px;
  border-radius: 0 0 20px 20px;
  background: linear-gradient(180deg, #1d1d3e 0%, #12122a 100%);
  transform: rotateX(-68deg);
  transform-origin: 50% 0;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.45);
}

/* ─── 厚实按键 ─────────────────────────── */
.key3d {
  position: relative;
  aspect-ratio: 1;
  border-radius: 26px;
  cursor: pointer;
  user-select: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  /* 堆叠出按键的厚度台阶 */
  box-shadow:
    0 8px 0 var(--key-side),
    0 14px 0 var(--key-bottom),
    0 20px 26px rgba(0, 0, 0, 0.5);
  transition:
    transform 0.14s ease,
    box-shadow 0.14s ease,
    filter 0.14s ease;
  transform-style: preserve-3d;
}

.key3d.red {
  --key-face: linear-gradient(160deg, #ff7a7a 0%, #ee5253 100%);
  --key-side: #b03a3c;
  --key-bottom: #7e2628;
}
.key3d.yellow {
  --key-face: linear-gradient(160deg, #ffec8a 0%, #feca57 100%);
  --key-side: #c99a2e;
  --key-bottom: #8f6d1c;
}
.key3d.teal {
  --key-face: linear-gradient(160deg, #63e0d6 0%, #1dd1a1 100%);
  --key-side: #169a76;
  --key-bottom: #0e6e53;
}
.key3d.green {
  --key-face: linear-gradient(160deg, #a9e9da 0%, #7acbb8 100%);
  --key-side: #549c8b;
  --key-bottom: #38705f;
}

.key3d::before {
  /* 键帽顶面 */
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 26px;
  background: var(--key-face);
  box-shadow:
    inset 0 4px 6px rgba(255, 255, 255, 0.45),
    inset 0 -5px 8px rgba(0, 0, 0, 0.22);
}

/* 按下：键帽下沉 */
.key3d:active {
  transform: translateY(8px);
  box-shadow:
    0 0 0 var(--key-side),
    0 4px 0 var(--key-bottom),
    0 8px 14px rgba(0, 0, 0, 0.45);
}

/* 播放点亮：键帽弹起 + 泛光 */
.key3d.lit {
  transform: translateZ(16px) translateY(-3px);
  filter: brightness(1.3) saturate(1.15);
  box-shadow:
    0 10px 0 var(--key-side),
    0 16px 0 var(--key-bottom),
    0 0 0 4px rgba(255, 255, 255, 0.85),
    0 0 34px rgba(255, 255, 255, 0.55),
    0 24px 30px rgba(0, 0, 0, 0.5);
}

/* 点错：抖动 + 灰化 */
.key3d.wrong {
  animation: keyShake 0.4s ease;
  filter: grayscale(0.55) brightness(0.72);
}

@keyframes keyShake {
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

/* 键帽上的图腾：立在键面上的小立牌 */
.key-icon {
  position: absolute;
  left: 50%;
  top: 40%;
  transform: translate(-50%, -50%) rotateX(-24deg) translateZ(14px);
  font-size: clamp(38px, 11vw, 56px);
  line-height: 1;
  filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.35));
  pointer-events: none;
}

.tip-text {
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  margin-top: 12px;
}

@media (max-width: 380px) {
  .console-panel {
    gap: 12px;
    padding: 16px;
  }
}
</style>
