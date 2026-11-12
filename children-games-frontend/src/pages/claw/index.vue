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
    />

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
          :style="{ left: clawX + '%', top: clawY + 'px' }"
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
          :style="{ left: prize.x + '%' }"
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
      <button class="drop-btn" :disabled="isDropping || gameEnded || paused" @click="dropClaw">
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
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useGameSounds } from '@/composables/useGameSounds';
import { useGameProgress } from '@/composables/useGameProgress';
import { useGameLifecycle } from '@/composables/useGameLifecycle';
import { useAdaptiveAssist } from '@/composables/useAdaptiveAssist';
import { getLevelOverride } from '@/api/game';
import { playVoice } from '@/utils/voice';
import { defaultLevelConfig } from '@/utils/levelDefaults';
import GameHeader from '@/components/GameHeader.vue';
import ResultModal from '@/components/ResultModal.vue';
import LevelSelectModal from '@/components/LevelSelectModal.vue';
import PauseMenu from '@/components/PauseMenu.vue';

interface Prize {
  id: number;
  emoji: string;
  x: number; // 在奖品台的百分比位置
  grabbed: boolean;
}

const router = useRouter();
const sounds = useGameSounds();
const { loadStartLevel, saveProgress: saveGameProgress, recordPlay } = useGameProgress('claw');
const assist = useAdaptiveAssist('claw');

const currentLevel = ref(1);
const timeLeft = ref(75);
const showResult = ref(false);
const gameWon = ref(false);
const stars = ref(0);
const showLevelSelect = ref(false);
const paused = ref(false);

const clawX = ref(50); // 百分比位置
const clawDir = ref(1);
const clawY = ref(0); // 0=顶部待机，>0=下爪中（px，相对导轨）
const isDropping = ref(false);
const isHolding = ref(false);
const prizes = ref<Prize[]>([]);
const collected = ref(0);
const collectedPrizes = ref<string[]>([]);

const levelConfig = ref<Record<string, number>>({ clawSpeed: 120, targetGrabs: 8, timeLimit: 75 });

let gameEnded = false;
let rafId = 0;
let lastTs = 0;
let dropTimer: ReturnType<typeof setTimeout> | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let prizeSeq = 0;

const TOYS = ['🧸', '🎁', '🐶', '🍭', '🚗', '🌈', '⭐', '🍬', '🦄', '🐧'];

const headerItems = computed(() => [
  { label: '关卡', value: currentLevel.value },
  { label: '抓到', value: `${collected.value}/${levelConfig.value.targetGrabs}` },
  { label: '时间', value: `${timeLeft.value}s` },
]);

const statusText = computed(() => {
  if (gameEnded) return gameWon.value ? '礼物全抓走啦！' : '时间到啦～';
  if (paused.value) return '游戏暂停中';
  if (isDropping.value) return '下爪中…';
  return '看准小礼物，按「抓！」';
});

// ── 奖品生成 ──
const spawnPrize = (): Prize => {
  prizeSeq += 1;
  // 避免与现有奖品过近（保证可抓）
  let x = 0;
  for (let tries = 0; tries < 20; tries += 1) {
    x = 8 + Math.random() * 84;
    if (!prizes.value.some((p) => !p.grabbed && Math.abs(p.x - x) < 14)) break;
  }
  return { id: prizeSeq, emoji: TOYS[Math.floor(Math.random() * TOYS.length)], x, grabbed: false };
};

const refillPrizes = (): void => {
  while (prizes.value.filter((p) => !p.grabbed).length < 6) {
    prizes.value.push(spawnPrize());
  }
};

const railRef = ref<HTMLElement | null>(null);

// ── 爪子移动（rAF，暂停/结束即冻结） ──
const step = (ts: number): void => {
  rafId = requestAnimationFrame(step);
  if (lastTs === 0) {
    lastTs = ts;
    return;
  }
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;
  if (paused.value || gameEnded || isDropping.value) return;
  const width = railRef.value?.offsetWidth || 300;
  const speedPct = (levelConfig.value.clawSpeed / width) * 100;
  clawX.value += clawDir.value * speedPct * dt;
  if (clawX.value >= 94) {
    clawX.value = 94;
    clawDir.value = -1;
  } else if (clawX.value <= 6) {
    clawX.value = 6;
    clawDir.value = 1;
  }
};

// ── 下爪 ──
const dropClaw = (): void => {
  if (isDropping.value || gameEnded || paused.value) return;
  isDropping.value = true;
  sounds.play('click');
  const DROP_MS = 450;
  clawY.value = 150; // CSS transition 下移
  dropTimer = setTimeout(() => {
    // 命中判定：爪心与奖品横向距离
    const hit = prizes.value.find((p) => !p.grabbed && Math.abs(p.x - clawX.value) < 9);
    if (hit) {
      hit.grabbed = true;
      isHolding.value = true;
      collected.value += 1;
      collectedPrizes.value.push(hit.emoji);
      sounds.play('match');
    } else {
      sounds.play('fail');
    }
    dropTimer = setTimeout(() => {
      clawY.value = 0; // 收爪
      dropTimer = setTimeout(() => {
        isHolding.value = false;
        isDropping.value = false;
        refillPrizes();
        if (collected.value >= levelConfig.value.targetGrabs) endGame(true);
      }, DROP_MS);
    }, 180);
  }, DROP_MS);
};

// ── 计时 ──
const tick = (): void => {
  if (paused.value || gameEnded) return;
  timeLeft.value -= 1;
  if (timeLeft.value <= 0) {
    timeLeft.value = 0;
    endGame(false);
  }
};

// ── 生命周期流程 ──
const initGame = (): void => {
  gameEnded = false;
  showResult.value = false;
  gameWon.value = false;
  stars.value = 0;
  collected.value = 0;
  collectedPrizes.value = [];
  prizes.value = [];
  refillPrizes();
  clawX.value = 50;
  clawDir.value = 1;
  clawY.value = 0;
  isDropping.value = false;
  isHolding.value = false;
  timeLeft.value = levelConfig.value.timeLimit;
  lastTs = 0;

  sounds.play('click');
  playVoice('claw_intro', '看准小礼物，按抓抓，把它们都抓出来吧');
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(tick, 1000);
};

const endGame = (won: boolean): void => {
  if (gameEnded) return;
  gameEnded = true;
  gameWon.value = won;
  if (tickTimer) clearInterval(tickTimer);
  if (won) {
    sounds.play('success');
    const ratio = timeLeft.value / levelConfig.value.timeLimit;
    stars.value = ratio >= 0.5 ? 3 : ratio >= 0.25 ? 2 : 1;
    assist.record(true);
    // 胜局计入进度（成绩=抓到只数，越多越好）
    saveGameProgress({
      level: currentLevel.value + 1,
      score: collected.value,
      stars: stars.value,
    });
  } else {
    sounds.play('fail');
    assist.record(false);
    recordPlay();
  }
  showResult.value = true;
};

const restartGame = (): void => initGame();

const nextLevel = async (): Promise<void> => {
  currentLevel.value += 1;
  sounds.play('levelUp');
  await applyLevelConfig(currentLevel.value);
  initGame();
};

const applyLevelConfig = async (level: number): Promise<void> => {
  const base = defaultLevelConfig('claw', level);
  levelConfig.value = { ...base };
  const override = await getLevelOverride('claw', level);
  if (override) {
    // claw 的字段白名单全为数值（clawSpeed/targetGrabs/timeLimit）
    levelConfig.value = { ...levelConfig.value, ...override } as Record<string, number>;
  }
  // 自适应辅助：连败降速 / 减目标（孩子无感知）
  const assistLevel = assist.level();
  if (assistLevel >= 1) levelConfig.value.clawSpeed = Math.round(levelConfig.value.clawSpeed * 0.8);
  if (assistLevel >= 2) levelConfig.value.targetGrabs -= 2;
};

// ── 暂停（手动 + 护眼） ──
const pauseGame = (): void => {
  paused.value = true;
};
const resumeGame = (): void => {
  paused.value = false;
};

useGameLifecycle({ onPause: () => (paused.value = true), onResume: () => (paused.value = false) });

const openLevelSelect = (): void => {
  if (!gameEnded) paused.value = true;
  showLevelSelect.value = true;
};

const chooseLevel = async (level: number): Promise<void> => {
  showLevelSelect.value = false;
  paused.value = false;
  currentLevel.value = level;
  await applyLevelConfig(level);
  initGame();
};

const quitGame = (): void => {
  router.back();
};

onMounted(async () => {
  sounds.init();
  rafId = requestAnimationFrame(step);
  currentLevel.value = await loadStartLevel();
  await applyLevelConfig(currentLevel.value);
  initGame();
});

onUnmounted(() => {
  cancelAnimationFrame(rafId);
  if (tickTimer) clearInterval(tickTimer);
  if (dropTimer) clearTimeout(dropTimer);
});
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
