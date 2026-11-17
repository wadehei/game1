<template>
  <div class="match3d-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="engine.headerItems.value"
      :muted="engine.sounds.isMuted.value"
      header-class="match3d-header"
      level-selectable
      @toggle-sound="engine.sounds.toggleSound"
      @go-back="router.back()"
      @select-level="engine.showLevelSelect.value = true"
    >
      <template #actions>
        <button class="mode-switch-btn" title="切换 2D 模式" @click="go2d">2D</button>
      </template>
    </GameHeader>

    <!-- 状态栏 -->
    <div class="m3-status">
      <span class="m3-chip score"
        >⭐ {{ engine.score.value }} / {{ engine.targetScore.value }}</span
      >
      <span class="m3-chip moves" :class="{ danger: engine.movesLeft.value <= 5 }"
        >👣 剩余步数 {{ engine.movesLeft.value }}</span
      >
      <span v-if="engine.combo.value > 1" class="m3-chip combo"
        >🔥 连击 ×{{ engine.combo.value }}</span
      >
    </div>

    <!-- 目标进度条 -->
    <div class="m3-progress">
      <div class="m3-progress-fill" :style="{ width: engine.progressPct.value + '%' }">
        <span v-if="engine.progressPct.value >= 18" class="m3-progress-text"
          >{{ engine.progressPct.value }}%</span
        >
      </div>
    </div>

    <!-- 3D 棋盘 -->
    <div ref="containerRef" class="scene3d"></div>

    <div class="tip-text">点两个相邻的小块交换位置，三个连成一排就消除！（3D：直接点方块）</div>

    <!-- 洗牌提示 -->
    <div v-if="engine.shuffleTip.value" class="shuffle-tip">
      🔄 没有可以消除的啦，帮你重新洗牌～
    </div>

    <!-- 加载过渡 -->
    <div v-if="loading" class="loading3d">
      <div class="spinner"></div>
      <p>3D 棋盘搭建中…</p>
    </div>

    <!-- 自动回退提示 -->
    <div v-if="fallbackTip" class="fallback-tip">此设备 3D 体验不畅，已为你切回 2D 模式～</div>

    <!-- 结果弹窗 -->
    <ResultModal
      :show="engine.showResult.value"
      :won="engine.gameWon.value"
      :stars="engine.stars.value"
      :icon="engine.gameWon.value ? '🎉' : '💪'"
      :title="engine.gameWon.value ? '消除大成功！' : '步数用完啦，再试一次！'"
      :info="
        engine.gameWon.value
          ? `用了 ${engine.movesUsed.value} 步，得到 ${engine.score.value} 分`
          : `还差 ${engine.targetScore.value - engine.score.value} 分，加油！`
      "
      @retry="engine.restartGame"
      @next="engine.nextLevel"
    />

    <!-- 暂停 -->
    <PauseMenu
      :show="engine.paused.value"
      @pause="engine.pauseGame"
      @resume="engine.resumeGame"
      @quit="engine.quitGame"
    />

    <!-- 选关 -->
    <LevelSelectModal
      :show="engine.showLevelSelect.value"
      :max-level="engine.currentLevel.value"
      :current="engine.currentLevel.value"
      @select="engine.chooseLevel"
      @close="engine.showLevelSelect.value = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useMatch3Engine } from '@/composables/useMatch3Engine';
import GameHeader from '@/components/GameHeader.vue';
import ResultModal from '@/components/ResultModal.vue';
import LevelSelectModal from '@/components/LevelSelectModal.vue';
import PauseMenu from '@/components/PauseMenu.vue';
import { createMatch3Board3D, type Match3Board3D } from './match3d';
import { detectWebGL, startFpsGuard, type FpsGuard } from '@/composables/use3dGuard';

const router = useRouter();
const engine = useMatch3Engine();

const containerRef = ref<HTMLElement | null>(null);
const loading = ref(true);
const fallbackTip = ref(false);

let board3d: Match3Board3D | null = null;
let fpsGuard: FpsGuard | null = null;

const go2d = () => {
  router.push('/match3');
};

const fallbackTo2d = (withTip: boolean) => {
  fpsGuard?.stop();
  fpsGuard = null;
  if (withTip) {
    fallbackTip.value = true;
    setTimeout(() => router.replace('/match3'), 900);
  } else {
    router.replace('/match3');
  }
};

onMounted(async () => {
  await engine.onMountedSetup();

  if (!detectWebGL()) {
    fallbackTo2d(false);
    return;
  }
  if (!containerRef.value) return;
  try {
    board3d = await createMatch3Board3D({
      container: containerRef.value,
      getState: () => ({
        cells: engine.flatCells.value.map((cell) => ({
          id: cell.id,
          r: cell.r,
          c: cell.c,
          kind: cell.kind,
          clearing: cell.clearing,
          popin: cell.popin,
        })),
        selected: engine.selected.value,
      }),
      onTapCell: (r, c) => {
        engine.tapCell(r, c);
      },
    });
    board3d.startRenderLoop();
    loading.value = false;
    fpsGuard = startFpsGuard({ onFallback: () => fallbackTo2d(true) });
  } catch {
    fallbackTo2d(false);
  }
});

onUnmounted(() => {
  fpsGuard?.stop();
  fpsGuard = null;
  board3d?.dispose();
  board3d = null;
});
</script>

<style scoped>
.match3d-game {
  min-height: 100vh;
  background: linear-gradient(180deg, #fdf6ec 0%, #f9ecd9 100%);
  display: flex;
  flex-direction: column;
  padding: 10px 12px 20px;
  box-sizing: border-box;
  max-width: 520px;
  margin: 0 auto;
  position: relative;
}

.match3d-header {
  background: rgba(255, 255, 255, 0.85);
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(107, 79, 42, 0.1);
}

:deep(.match3d-header .label) {
  color: #a9895f;
}

:deep(.match3d-header .value) {
  color: #6b4f2a;
}

:deep(.match3d-header .sound-btn),
:deep(.match3d-header .back-btn) {
  background: rgba(107, 79, 42, 0.1);
}

.mode-switch-btn {
  background: rgba(107, 79, 42, 0.1);
  color: #6b4f2a;
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
  background: rgba(107, 79, 42, 0.22);
  transform: scale(1.1);
}

.mode-switch-btn:active {
  transform: scale(0.95);
}

.m3-status {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin: 8px 0 10px;
  flex-wrap: wrap;
}

.m3-chip {
  background: #fff;
  border-radius: 20px;
  padding: 6px 14px;
  font-size: 14px;
  font-weight: bold;
  color: #6b4f2a;
  box-shadow: 0 2px 6px rgba(107, 79, 42, 0.12);
}

.m3-chip.combo {
  background: #ffe3b8;
  color: #c25705;
  animation: combo-pop 0.3s ease;
}

@keyframes combo-pop {
  50% {
    transform: scale(1.25);
  }
}

.m3-progress {
  height: 12px;
  background: rgba(107, 79, 42, 0.15);
  border-radius: 8px;
  overflow: hidden;
  margin: 0 2px 10px;
}

.m3-progress-fill {
  height: 100%;
  border-radius: 8px;
  background: linear-gradient(90deg, #ffb347 0%, #ff5e62 100%);
  transition: width 0.35s ease;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
}

.m3-progress-text {
  font-size: 9px;
  color: #fff;
  font-weight: bold;
  padding-right: 6px;
  white-space: nowrap;
}

.m3-chip.moves.danger {
  background: #ffd9d9;
  color: #c0392b;
  animation: danger-blink 1s ease-in-out infinite;
}

@keyframes danger-blink {
  50% {
    transform: scale(1.08);
  }
}

/* 3D 场景容器 */
.scene3d {
  flex: 1;
  min-height: 320px;
  border-radius: 16px;
  overflow: hidden;
  background: #fdf6ec;
  box-shadow: 0 4px 14px rgba(107, 79, 42, 0.14);
}

.scene3d :deep(canvas) {
  display: block;
}

.tip-text {
  text-align: center;
  font-size: 13px;
  color: #a9895f;
  margin-top: 10px;
}

.shuffle-tip {
  position: fixed;
  left: 50%;
  bottom: 18%;
  transform: translateX(-50%);
  background: rgba(60, 40, 10, 0.85);
  color: #ffe9c2;
  font-size: 14px;
  padding: 10px 18px;
  border-radius: 20px;
  z-index: 30;
}

/* 加载过渡 */
.loading3d {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(253, 246, 236, 0.94);
  z-index: 20;
  color: #a9895f;
  font-size: 15px;
}

.spinner {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 4px solid rgba(255, 179, 71, 0.25);
  border-top-color: #ffb347;
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
  background: rgba(70, 50, 20, 0.88);
  color: #ffe9c2;
  font-size: 14px;
  padding: 10px 18px;
  border-radius: 20px;
  z-index: 40;
}
</style>
