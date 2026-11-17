<template>
  <div class="match3-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="engine.headerItems.value"
      :muted="engine.sounds.isMuted.value"
      header-class="match3-header"
      level-selectable
      @toggle-sound="engine.sounds.toggleSound"
      @go-back="router.back()"
      @select-level="engine.showLevelSelect.value = true"
    >
      <template #actions>
        <button class="mode-switch-btn" title="切换 3D 模式" @click="go3d">3D</button>
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

    <!-- 棋盘 -->
    <div class="m3-board" :class="{ locked: engine.busy.value || engine.paused.value }">
      <button
        v-for="cell in engine.flatCells.value"
        :key="cell.id"
        class="m3-cell"
        :class="{
          picked: engine.isSelected(cell.r, cell.c),
          clearing: cell.clearing,
          popin: cell.popin,
          neighbor: engine.isNeighborOfSelected(cell.r, cell.c),
        }"
        :style="
          engine.isNumberTheme.value
            ? {
                '--m3-bg': ['#FF8F8F', '#FFB74D', '#FFF176', '#AED581', '#80CBC4', '#90CAF9'][
                  cell.kind
                ],
              }
            : {}
        "
        @click="engine.tapCell(cell.r, cell.c)"
      >
        {{ engine.theme.value[cell.kind] }}
      </button>
    </div>

    <div class="tip-text">点两个相邻的小图交换位置，三个连成一排就消除！</div>

    <!-- 洗牌提示 -->
    <div v-if="engine.shuffleTip.value" class="shuffle-tip">
      🔄 没有可以消除的啦，帮你重新洗牌～
    </div>

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
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useMatch3Engine } from '@/composables/useMatch3Engine';
import { getGameMode, setGameMode, maybeShow3dHint } from '@/utils/modePreference';
import { showToast } from '@/utils/toastBus';
import GameHeader from '@/components/GameHeader.vue';
import ResultModal from '@/components/ResultModal.vue';
import LevelSelectModal from '@/components/LevelSelectModal.vue';
import PauseMenu from '@/components/PauseMenu.vue';

const router = useRouter();
const engine = useMatch3Engine();

onMounted(async () => {
  // 默认模式：家长中心设为 3D 或本游戏上次切到 3D → 直接进 3D 版
  if (getGameMode('match3') === '3d') {
    router.replace('/match3-3d');
    return;
  }
  if (maybeShow3dHint('match3')) {
    showToast('试试右上角「3D」按钮，切换立体画面～', 'info');
  }
  await engine.onMountedSetup();
});

const go3d = () => {
  setGameMode('match3', '3d');
  router.push('/match3-3d');
};
</script>

<style scoped>
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

.match3-game {
  min-height: 100vh;
  background: linear-gradient(180deg, #fdf6ec 0%, #f9ecd9 100%);
  display: flex;
  flex-direction: column;
  padding: 10px 12px 20px;
  box-sizing: border-box;
  max-width: 520px;
  margin: 0 auto;
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

.m3-board {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
  background: rgba(255, 255, 255, 0.75);
  border-radius: 16px;
  padding: 8px;
  box-shadow: 0 4px 14px rgba(107, 79, 42, 0.1);
  touch-action: manipulation;
}

.m3-board.locked {
  pointer-events: none;
}

.m3-cell {
  aspect-ratio: 1;
  border: none;
  border-radius: 10px;
  background: var(--m3-bg, #fff8ee);
  font-size: clamp(18px, 4.6vw, 26px);
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition:
    transform 0.1s ease,
    background 0.1s ease;
}

.m3-cell.picked {
  background: #ffdf9e;
  transform: scale(1.12);
  box-shadow: 0 0 0 3px #f5a623 inset;
}

.m3-cell.neighbor {
  background: #fff1d6;
}

.m3-cell.clearing {
  transform: scale(0);
  opacity: 0;
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}

.m3-cell.popin {
  animation: pop-in 0.28s ease backwards;
}

@keyframes pop-in {
  from {
    transform: scale(0.3);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
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
</style>
