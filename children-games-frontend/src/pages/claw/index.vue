<template>
  <div class="claw-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="headerItems"
      :muted="sounds.isMuted.value"
      header-class="claw-header"
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

    <!-- 娃娃机 -->
    <div class="machine" :class="{ dropping: isDropping }">
      <!-- 爪子导轨 + 爪子 -->
      <div ref="railRef" class="rail">
        <div
          class="claw"
          :class="{ dropping: isDropping, holding: isHolding }"
          :style="{ left: clawX * 100 + '%', top: clawY + 'px' }"
        >
          <div class="claw-arm">🪝</div>
        </div>
      </div>
      <!-- 奖品台 -->
      <div ref="shelfRef" class="shelf">
        <button
          v-for="prize in prizes"
          :key="prize.id"
          class="prize"
          :class="{ gone: prize.grabbed }"
          :style="{ left: prize.x * 100 + '%' }"
          :disabled="prize.grabbed"
        >
          {{ prize.emoji }}
        </button>
      </div>
      <!-- 出口 -->
      <div class="chute">
        <span v-for="(p, i) in collectedPrizes.slice(-6)" :key="i" class="chute-prize">{{
          p
        }}</span>
      </div>
      <!-- 抓取按钮 -->
      <button class="drop-btn" :disabled="isDropping || showResult || paused" @click="dropClaw">
        抓！
      </button>
    </div>

    <div class="tip-text">爪子左右移动，看准了按「抓！」——把小礼物都抓出来吧！</div>

    <!-- 游戏结果弹窗（通关自动开始下一关） -->
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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import GameHeader from '@/components/GameHeader.vue';
import ResultModal from '@/components/ResultModal.vue';
import LevelSelectModal from '@/components/LevelSelectModal.vue';
import PauseMenu from '@/components/PauseMenu.vue';
import { useClawGame } from './useClawGame';

const router = useRouter();

// 逻辑层（2D/3D 共用）：巡航/下爪判定/计时/进度上报；巡航宽度注入导轨 DOM 宽
const railRef = ref<HTMLElement | null>(null);
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
  collectedPrizes,
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
} = useClawGame(() => railRef.value?.offsetWidth || 300);

// 渲染细节：下爪/收爪位移只属 2D CSS（450ms 与逻辑层下爪时序对齐）
const clawY = ref(0);
watch(isDropping, (dropping) => {
  if (dropping) clawY.value = 150;
});
watch(isReleasing, (releasing) => {
  if (releasing) clawY.value = 0;
});

const go3d = () => {
  router.push('/claw-3d');
};
</script>

<style scoped>
.claw-game {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 16px 24px;
  background: linear-gradient(160deg, #fdeff4 0%, #f9e0ec 55%, #f3d2e3 100%);
  box-sizing: border-box;
  overflow-x: hidden;
}

.status-bar {
  margin: 8px 0 12px;
}

.status-text {
  font-size: 16px;
  color: #a05a7c;
  font-weight: 600;
}

/* ── 娃娃机 ── */
.machine {
  width: min(92vw, 420px);
  background: #fff;
  border-radius: 20px;
  padding: 14px;
  box-shadow: 0 10px 28px rgba(190, 110, 150, 0.22);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rail {
  position: relative;
  height: 150px;
  background: linear-gradient(180deg, #fdf2f7 0%, #fbe4ef 100%);
  border-radius: 12px;
  overflow: hidden;
}

.claw {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  transition: top 0.45s ease-in-out;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}

.claw-arm {
  font-size: 34px;
  line-height: 1;
  filter: drop-shadow(0 3px 4px rgba(160, 90, 125, 0.35));
}

.claw.holding .claw-arm {
  transform: rotate(-12deg);
}

/* ── 奖品台 ── */
.shelf {
  position: relative;
  height: 110px;
  background: repeating-linear-gradient(90deg, #fce8f1 0, #fce8f1 22px, #f9dceb 22px, #f9dceb 24px);
  border-radius: 12px;
  overflow: hidden;
}

.prize {
  position: absolute;
  bottom: 8px;
  transform: translateX(-50%);
  font-size: 34px;
  line-height: 1;
  background: none;
  border: none;
  cursor: default;
  padding: 0;
  filter: drop-shadow(0 2px 3px rgba(160, 90, 125, 0.3));
}

.prize.gone {
  visibility: hidden;
}

/* ── 出口 ── */
.chute {
  min-height: 34px;
  background: #fbe4ef;
  border-radius: 10px;
  padding: 4px 10px;
  display: flex;
  gap: 6px;
  align-items: center;
  overflow: hidden;
}

.chute-prize {
  font-size: 20px;
}

/* ── 抓取按钮 ── */
.drop-btn {
  align-self: center;
  width: 120px;
  height: 52px;
  border: none;
  border-radius: 26px;
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

.tip-text {
  margin-top: 14px;
  font-size: 14px;
  color: #b5788f;
  text-align: center;
}

@media (max-width: 420px) {
  .rail {
    height: 130px;
  }

  .prize {
    font-size: 30px;
  }
}
</style>
