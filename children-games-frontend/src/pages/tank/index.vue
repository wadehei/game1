<template>
  <div class="tank-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="headerItems"
      :muted="engine.sounds.isMuted.value"
      header-class="tank-header"
      level-selectable
      @toggle-sound="engine.sounds.toggleSound"
      @go-back="router.back()"
      @select-level="engine.openLevelSelect"
    />

    <!-- 游戏画布 -->
    <canvas
      id="tank_canvas"
      ref="canvasRef"
      class="game-canvas"
      @mousedown="engine.startMove"
      @mousemove="engine.movePlayer"
      @mouseup="engine.stopMove"
      @mouseleave="engine.stopMove"
      @touchstart="engine.startMove"
      @touchmove="engine.movePlayer"
      @touchend="engine.stopMove"
      @touchcancel="engine.stopMove"
    />

    <!-- 控制按钮 -->
    <div class="controls">
      <div
        class="control-btn"
        @mousedown="engine.moveLeft"
        @mouseup="engine.stopMove"
        @mouseleave="engine.stopMove"
        @touchstart.prevent="engine.moveLeft"
        @touchend.prevent="engine.stopMove"
        @touchcancel="engine.stopMove"
      >
        <span>◀️</span>
      </div>
      <div class="control-btn fire-btn" @click="engine.fire" @touchstart.prevent="engine.fire">
        <span>🔥</span>
      </div>
      <div
        class="control-btn"
        @mousedown="engine.moveRight"
        @mouseup="engine.stopMove"
        @mouseleave="engine.stopMove"
        @touchstart.prevent="engine.moveRight"
        @touchend.prevent="engine.stopMove"
        @touchcancel="engine.stopMove"
      >
        <span>▶️</span>
      </div>
    </div>

    <!-- 游戏结果弹窗 -->
    <ResultModal
      :show="engine.showResult.value"
      :won="engine.gameWon.value"
      :stars="engine.stars.value"
      :icon="engine.gameWon.value ? '🎉' : '💪'"
      :title="engine.gameWon.value ? '恭喜通关！' : '差一点点，再来一次！'"
      @retry="engine.restartGame"
      @next="engine.nextLevel"
    />

    <!-- 暂停 -->
    <PauseMenu
      :show="engine.paused.value"
      @pause="engine.pauseGame"
      @resume="engine.resumeGame"
      @quit="router.back()"
    />

    <!-- 选关弹层 -->
    <LevelSelectModal
      :show="engine.showLevelSelect.value"
      :max-level="engine.currentLevel.value"
      :current="engine.currentLevel.value"
      @select="engine.chooseLevel"
      @close="engine.closeLevelSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useTankEngine } from '@/composables/useTankEngine';
import GameHeader from '@/components/GameHeader.vue';
import ResultModal from '@/components/ResultModal.vue';
import LevelSelectModal from '@/components/LevelSelectModal.vue';
import PauseMenu from '@/components/PauseMenu.vue';

const router = useRouter();
const engine = useTankEngine();

const canvasRef = ref<HTMLCanvasElement | null>(null);

const headerItems = computed(() => [
  { label: '关卡', value: engine.currentLevel.value },
  { label: '生命', value: '❤️'.repeat(engine.playerHP.value) },
  { label: '敌人', value: engine.enemyCount.value },
]);

onMounted(async () => {
  await engine.onMountedSetup(canvasRef.value);
});

onUnmounted(() => {
  engine.onUnmountedCleanup();
});
</script>

<style scoped>
.tank-game {
  min-height: 100vh;
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%);
  position: relative;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.tank-header {
  position: relative;
  margin: 12px 16px 0;
  background: rgba(44, 62, 80, 0.85);
  backdrop-filter: blur(12px);
  border-radius: 16px;
  padding: 14px 50px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

:deep(.tank-header .label) {
  color: rgba(255, 255, 255, 0.7);
  font-weight: 600;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.5px;
}

:deep(.tank-header .value) {
  font-size: 22px;
  color: #ffd700;
  font-weight: 700;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

:deep(.tank-header .sound-btn) {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

:deep(.tank-header .back-btn) {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.game-canvas {
  width: calc(100% - 24px);
  height: calc(100vh - 200px);
  margin: 12px auto 0;
  display: block;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  border: 3px solid rgba(255, 255, 255, 0.1);
}

.controls {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 16px;
  z-index: 10;
  padding: 12px 20px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  border-radius: 40px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.control-btn {
  width: 64px;
  height: 64px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.1) 100%);
  backdrop-filter: blur(8px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 2px solid rgba(255, 255, 255, 0.3);
  user-select: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.control-btn:active {
  transform: scale(0.9);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.2) 100%);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.control-btn.fire-btn {
  background: linear-gradient(135deg, rgba(255, 100, 100, 0.5) 0%, rgba(255, 50, 50, 0.3) 100%);
  border-color: rgba(255, 150, 150, 0.5);
  width: 72px;
  height: 72px;
  font-size: 30px;
}

.control-btn.fire-btn:active {
  background: linear-gradient(135deg, rgba(255, 120, 120, 0.6) 0%, rgba(255, 70, 70, 0.4) 100%);
}

:deep(.result-content) {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 24px;
  padding: 36px;
  border: 2px solid rgba(255, 215, 0, 0.3);
  color: #fff;
}

:deep(.result-title) {
  color: #ffd700;
}

:deep(.result-info) {
  color: rgba(255, 255, 255, 0.7);
}

:deep(.btn-retry) {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

:deep(.btn-next) {
  background: linear-gradient(135deg, #ffd700 0%, #ffa500 100%);
  color: #1a1a2e;
  font-weight: 700;
}

@media (max-width: 480px) {
  .control-btn {
    width: 56px;
    height: 56px;
    font-size: 22px;
  }
  .control-btn.fire-btn {
    width: 64px;
    height: 64px;
    font-size: 26px;
  }
  .controls {
    gap: 12px;
    padding: 10px 16px;
  }
}
</style>
