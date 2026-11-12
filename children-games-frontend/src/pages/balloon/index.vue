<template>
  <div class="balloon-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="engine.headerItems.value"
      :muted="engine.sounds.isMuted.value"
      header-class="balloon-header"
      level-selectable
      @toggle-sound="engine.sounds.toggleSound"
      @go-back="router.back()"
      @select-level="engine.openLevelSelect"
    />

    <!-- 游戏画布 -->
    <canvas id="balloonCanvas" ref="canvasRef" class="game-canvas" @click="engine.shoot" />

    <!-- 游戏结果弹窗 -->
    <ResultModal
      :show="engine.showResult.value"
      :won="engine.gameWon.value"
      :stars="engine.stars.value"
      :icon="engine.gameWon.value ? '🎉' : '💪'"
      :title="engine.gameWon.value ? '恭喜通关！' : '子弹用完了，再试一次！'"
      :info="`得分: ${engine.score.value}`"
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
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useBalloonEngine } from '@/composables/useBalloonEngine';
import GameHeader from '@/components/GameHeader.vue';
import ResultModal from '@/components/ResultModal.vue';
import LevelSelectModal from '@/components/LevelSelectModal.vue';
import PauseMenu from '@/components/PauseMenu.vue';

const router = useRouter();
const engine = useBalloonEngine();

const canvasRef = ref<HTMLCanvasElement | null>(null);

onMounted(async () => {
  await engine.onMountedSetup(canvasRef.value);
});

onUnmounted(() => {
  engine.onUnmountedCleanup();
});
</script>

<style scoped>
.balloon-game {
  min-height: 100vh;
  background: linear-gradient(180deg, #87ceeb 0%, #e0f7fa 60%, #98fb98 100%);
  position: relative;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* Decorative clouds via CSS */
.balloon-game::before,
.balloon-game::after {
  content: '';
  position: absolute;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 50px;
  z-index: 0;
}

.balloon-game::before {
  width: 120px;
  height: 40px;
  top: 15%;
  left: -20px;
  box-shadow: 30px -15px 0 10px rgba(255, 255, 255, 0.3);
}

.balloon-game::after {
  width: 100px;
  height: 35px;
  top: 25%;
  right: -10px;
  box-shadow: -20px -12px 0 8px rgba(255, 255, 255, 0.25);
}

.balloon-header {
  position: relative;
  margin: 12px 16px 0;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  border-radius: 16px;
  padding: 14px 50px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.5);
}

:deep(.balloon-header .value) {
  font-size: 22px;
  color: #2c3e50;
  font-weight: 700;
}

:deep(.balloon-header .label) {
  color: #667eea;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.5px;
}

.game-canvas {
  width: calc(100% - 24px);
  height: calc(100vh - 120px);
  margin: 12px auto 0;
  display: block;
  cursor: crosshair;
  touch-action: none;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  border: 3px solid rgba(255, 255, 255, 0.5);
}

:deep(.result-content) {
  background: linear-gradient(135deg, #fff 0%, #f0f8ff 100%);
  border-radius: 24px;
  padding: 36px;
  border: 2px solid rgba(67, 233, 123, 0.3);
}

:deep(.btn-next) {
  background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
}
</style>
