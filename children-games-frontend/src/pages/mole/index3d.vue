<template>
  <div class="mole3d-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="headerItems"
      :muted="sounds.isMuted.value"
      header-class="mole3d-header"
      level-selectable
      @toggle-sound="sounds.toggleSound"
      @go-back="router.back()"
      @select-level="openLevelSelect"
    >
      <template #actions>
        <button class="mode-switch-btn" title="切换 2D 模式" @click="go2d">2D</button>
      </template>
    </GameHeader>

    <!-- 3D 草坪场景：洞口是带深度的坑，地鼠从坑里立体蹦出 -->
    <div class="scene">
      <div class="lawn">
        <div class="lawn-edge" aria-hidden="true"></div>
        <div class="fence" aria-hidden="true">
          <span v-for="i in 9" :key="i" class="fence-post"></span>
        </div>
        <div class="mole-board3d">
          <div v-for="(hole, index) in holes" :key="index" class="hole">
            <div class="hole-rim" aria-hidden="true"></div>
            <div class="well">
              <div
                v-if="hole.state !== 'empty'"
                class="critter"
                :class="[hole.kind, hole.state, { tempt: hole.kind === 'bunny' }]"
                @pointerdown.stop.prevent="whack(index)"
              >
                <span class="critter-body" aria-hidden="true"></span>
                <span class="critter-face">{{ hole.kind === 'bunny' ? '🐰' : '🐹' }}</span>
                <span v-if="hole.state === 'whacked'" class="hammer">🔨</span>
                <span v-if="hole.state === 'whacked'" class="hit-effect">💥</span>
              </div>
            </div>
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
import { setGameMode } from '@/utils/modePreference';

const router = useRouter();

// 同一颗逻辑心脏：只换渲染层
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

const go2d = () => {
  setGameMode('mole', '2d');
  router.push('/mole');
};
</script>

<style scoped>
.mole3d-game {
  min-height: 100vh;
  /* 天空到草地的纵深底色 */
  background: linear-gradient(180deg, #7ec8f0 0%, #bfe6a0 62%, #8fce62 100%);
  padding: 20px;
  position: relative;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
}

.mole3d-header {
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  margin-bottom: 14px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

:deep(.mole3d-header .label) {
  color: #4a7c2a;
  font-weight: 600;
}

:deep(.mole3d-header .value) {
  color: #2d5a12;
}

:deep(.mole3d-header .value.warning) {
  color: #e67e22;
}

:deep(.mole3d-header .sound-btn),
:deep(.mole3d-header .back-btn) {
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

/* ─── 3D 场景 ─────────────────────────── */
.scene {
  perspective: 950px;
  perspective-origin: 50% 8%;
  display: flex;
  justify-content: center;
  padding-bottom: 26px;
}

.lawn {
  position: relative;
  width: min(92vw, 460px);
  padding: 34px 16px 22px;
  border-radius: 22px;
  background: linear-gradient(180deg, #79b850 0%, #5d9e3a 100%);
  box-shadow:
    inset 0 12px 26px rgba(255, 255, 255, 0.22),
    inset 0 -8px 22px rgba(24, 60, 12, 0.35);
  transform: rotateX(18deg);
  transform-style: preserve-3d;
}

/* 草坪厚度侧面：让"地块"立起来 */
.lawn-edge {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -16px;
  height: 16px;
  border-radius: 0 0 18px 18px;
  background: linear-gradient(180deg, #4a2d18 0%, #38210f 100%);
  transform: rotateX(-72deg);
  transform-origin: 50% 0;
  box-shadow: 0 6px 14px rgba(20, 40, 10, 0.35);
}

/* 远处一排栅栏，撑起纵深 */
.fence {
  position: absolute;
  top: -30px;
  left: 8px;
  right: 8px;
  height: 30px;
  display: flex;
  justify-content: space-between;
  opacity: 0.85;
}

.fence-post {
  width: 10px;
  background: linear-gradient(90deg, #c9a06a 0%, #a87e4c 100%);
  border-radius: 3px 3px 0 0;
  box-shadow: 0 3px 5px rgba(60, 40, 16, 0.3);
}

.mole-board3d {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

/* ─── 立体洞口 ─────────────────────────── */
.hole {
  position: relative;
  aspect-ratio: 1;
}

/* 洞口土圈：微微凸起的环形边 */
.hole-rim {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(ellipse at 50% 42%, #2c1b0e 0%, #4d3117 58%, #7a5124 100%);
  box-shadow:
    inset 0 10px 18px rgba(0, 0, 0, 0.62),
    inset 0 -3px 8px rgba(255, 226, 160, 0.22),
    0 4px 0 rgba(46, 82, 24, 0.9),
    0 7px 12px rgba(20, 40, 10, 0.3);
}

/* 坑口上沿高光：洞是"凹下去"的关键暗示 */
.hole-rim::before {
  content: '';
  position: absolute;
  inset: 7%;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at 50% 20%,
    rgba(0, 0, 0, 0.75) 0%,
    #33200f 64%,
    #58391a 100%
  );
  box-shadow: inset 0 6px 12px rgba(0, 0, 0, 0.6);
}

/* 地鼠活动井：只允许地鼠出现在洞口中心线以上，钻出时被井口裁剪 */
.well {
  position: absolute;
  bottom: 50%;
  left: 13%;
  right: 13%;
  top: -105%;
  overflow: hidden;
  pointer-events: none;
}

.critter {
  pointer-events: auto;
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 84%;
  height: 88%;
  transform: translateX(-50%) translateY(102%);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

/* 地鼠圆滚滚的身体（纯色+暗部，低多边形思路） */
.critter-body {
  position: absolute;
  bottom: 0;
  width: 88%;
  height: 78%;
  border-radius: 46% 46% 40% 40%;
  background: radial-gradient(ellipse at 50% 30%, #c99b62 0%, #a97b48 70%, #8a5f34 100%);
  box-shadow:
    inset -6px -8px 12px rgba(90, 55, 20, 0.45),
    0 4px 8px rgba(20, 40, 10, 0.35);
}

.critter.bunny .critter-body {
  background: radial-gradient(ellipse at 50% 30%, #f5f0ea 0%, #e3d9cd 70%, #c4b8a8 100%);
}

/* 地鼠冒头：带一点向后仰的立体感 */
.critter.up {
  animation: critterRise3d 0.22s cubic-bezier(0.25, 1.4, 0.5, 1) forwards;
}

@keyframes critterRise3d {
  from {
    transform: translateX(-50%) translateY(102%) rotateX(38deg) scale(0.92);
  }
  to {
    transform: translateX(-50%) translateY(8%) rotateX(0deg) scale(1);
  }
}

.critter.whacked {
  animation: critterSquash3d 0.25s ease-in forwards;
}

@keyframes critterSquash3d {
  0% {
    transform: translateX(-50%) translateY(8%) scale(1, 1);
  }
  55% {
    transform: translateX(-50%) translateY(26%) scale(1.22, 0.68);
  }
  100% {
    transform: translateX(-50%) translateY(96%) scale(0.8, 0.5);
    opacity: 0;
  }
}

.critter.bunny.tempt .critter-face {
  animation: temptWiggle 0.8s ease-in-out infinite;
}

.critter-face {
  position: relative;
  z-index: 1;
  font-size: clamp(34px, 9vw, 52px);
  line-height: 1;
  padding-bottom: 8%;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.3));
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
  top: 20%;
  font-size: 30px;
  animation: hitPop 0.25s ease-out forwards;
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

@media (max-width: 480px) {
  .mole-board3d {
    gap: 10px;
  }

  .lawn {
    padding: 26px 12px 16px;
  }
}
</style>
