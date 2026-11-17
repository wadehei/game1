<template>
  <div class="claw3d-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="headerItems"
      :muted="sounds.isMuted.value"
      header-class="claw3d-header"
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

    <!-- 3D 机柜 -->
    <div ref="containerRef" class="scene3d"></div>

    <!-- 抓取按钮 -->
    <button
      class="drop-btn"
      :disabled="isDropping || showResult || paused"
      @pointerdown.stop.prevent="dropClaw"
    >
      抓！
    </button>

    <div class="tip-text">爪子左右移动，看准了按「抓！」——把小礼物都抓出来吧！</div>

    <!-- 加载过渡 -->
    <div v-if="loading" class="loading3d">
      <div class="spinner"></div>
      <p>3D 机柜搭建中…</p>
    </div>

    <!-- 自动回退提示 -->
    <div v-if="fallbackTip" class="fallback-tip">此设备 3D 体验不畅，已为你切回 2D 模式～</div>

    <!-- 游戏结果弹窗 -->
    <ResultModal
      :show="showResult"
      :won="gameWon"
      :stars="stars"
      :icon="gameWon ? '🧸' : '💪'"
      :title="gameWon ? '全部抓到啦！' : '时间到了，再试一次！'"
      :info="gameWon ? `抓到 ${collected} 只礼物` : '看准再按，不着急'"
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
      @close="showLevelSelect = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import GameHeader from '@/components/GameHeader.vue';
import ResultModal from '@/components/ResultModal.vue';
import LevelSelectModal from '@/components/LevelSelectModal.vue';
import PauseMenu from '@/components/PauseMenu.vue';
import { useClawGame } from './useClawGame';
import { createClawMachine3D, type ClawMachine3D } from './claw3d';
import { detectWebGL, startFpsGuard, type FpsGuard } from '@/composables/use3dGuard';

const router = useRouter();

const containerRef = ref<HTMLElement | null>(null);
const loading = ref(true);
const fallbackTip = ref(false);

// 同一颗逻辑心脏：只换渲染层（巡航宽度=场景逻辑宽）
const {
  sounds,
  currentLevel,
  showResult,
  gameWon,
  stars,
  showLevelSelect,
  paused,
  clawX,
  isDropping,
  isReleasing,
  isHolding,
  prizes,
  collected,
  headerItems,
  statusText,
  dropClaw,
  pauseGame,
  resumeGame,
  openLevelSelect,
  chooseLevel,
  quitGame,
  restartGame,
  nextLevel,
} = useClawGame(() => 460);

let machine: ClawMachine3D | null = null;
let fpsGuard: FpsGuard | null = null;

const go2d = () => {
  router.push('/claw');
};

// WebGL 不可用或持续低帧 → 回退 2D（一次性）
const fallbackTo2d = (withTip: boolean) => {
  fpsGuard?.stop();
  fpsGuard = null;
  if (withTip) {
    fallbackTip.value = true;
    setTimeout(() => router.replace('/claw'), 900);
  } else {
    router.replace('/claw');
  }
};

onMounted(async () => {
  if (!detectWebGL()) {
    fallbackTo2d(false);
    return;
  }
  if (!containerRef.value) return;
  try {
    machine = await createClawMachine3D({
      container: containerRef.value,
      getState: () => ({
        clawX: clawX.value,
        dropping: isDropping.value,
        releasing: isReleasing.value,
        holding: isHolding.value,
        prizes: prizes.value.map((p) => ({ id: p.id, x: p.x, grabbed: p.grabbed })),
      }),
    });
    machine.startRenderLoop();
    loading.value = false;
    fpsGuard = startFpsGuard({ onFallback: () => fallbackTo2d(true) });
  } catch {
    fallbackTo2d(false);
  }
});

onUnmounted(() => {
  fpsGuard?.stop();
  fpsGuard = null;
  machine?.dispose();
  machine = null;
});
</script>

<style scoped>
.claw3d-game {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 16px 24px;
  background: linear-gradient(160deg, #fdeff4 0%, #f9e0ec 55%, #f3d2e3 100%);
  box-sizing: border-box;
  overflow: hidden;
  position: relative;
}

.claw3d-header {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  margin-bottom: 8px;
  box-shadow: 0 4px 18px rgba(190, 110, 150, 0.18);
  align-self: stretch;
}

:deep(.claw3d-header .label) {
  color: #a05a7c;
}

:deep(.claw3d-header .value) {
  color: #7c3556;
}

:deep(.claw3d-header .sound-btn),
:deep(.claw3d-header .back-btn) {
  background: rgba(232, 68, 127, 0.12);
}

.mode-switch-btn {
  background: rgba(232, 68, 127, 0.12);
  color: #c2416e;
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
  background: rgba(232, 68, 127, 0.24);
  transform: scale(1.1);
}

.mode-switch-btn:active {
  transform: scale(0.95);
}

.status-bar {
  margin: 4px 0 8px;
}

.status-text {
  font-size: 16px;
  color: #a05a7c;
  font-weight: 600;
}

/* 3D 场景容器：占满主要视区 */
.scene3d {
  width: min(94vw, 560px);
  height: min(56vh, 430px);
  min-height: 300px;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 12px 32px rgba(190, 110, 150, 0.28);
  background: #fdeff4;
}

.scene3d :deep(canvas) {
  display: block;
}

/* 抓取按钮 */
.drop-btn {
  margin-top: 14px;
  width: 130px;
  height: 54px;
  border: none;
  border-radius: 27px;
  background: linear-gradient(135deg, #f66d9b 0%, #e8447f 100%);
  color: #fff;
  font-size: 22px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(232, 68, 127, 0.4);
  transition:
    transform 0.1s ease,
    opacity 0.15s ease;
}

.drop-btn:active {
  transform: scale(0.94);
}

.drop-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.tip-text {
  margin-top: 10px;
  font-size: 14px;
  color: #b5788f;
  text-align: center;
}

/* 加载过渡（避免 3D 首帧白屏突兀） */
.loading3d {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(253, 239, 244, 0.92);
  z-index: 20;
  color: #a05a7c;
  font-size: 15px;
}

.spinner {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 4px solid rgba(232, 68, 127, 0.2);
  border-top-color: #e8447f;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 自动回退提示 */
.fallback-tip {
  position: fixed;
  left: 50%;
  bottom: 16%;
  transform: translateX(-50%);
  background: rgba(90, 40, 60, 0.88);
  color: #ffe9f2;
  font-size: 14px;
  padding: 10px 18px;
  border-radius: 20px;
  z-index: 40;
}
</style>
