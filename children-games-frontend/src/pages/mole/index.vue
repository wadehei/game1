<template>
  <div class="mole-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="headerItems"
      :muted="sounds.isMuted.value"
      headerClass="mole-header"
      level-selectable
      @toggleSound="sounds.toggleSound"
      @goBack="router.back()"
      @selectLevel="openLevelSelect"
    />

    <!-- 打地鼠 3x3 -->
    <div class="mole-board">
      <div v-for="(hole, index) in holes" :key="index" class="hole">
        <div
          v-if="hole.state !== 'empty'"
          class="critter"
          :class="[hole.kind, hole.state, { tempt: hole.kind === 'bunny' }]"
          @pointerdown.stop.prevent="whack(index)"
        >
          <span class="critter-face">{{ hole.kind === 'bunny' ? '🐰' : '🐹' }}</span>
          <span v-if="hole.state === 'whacked'" class="hammer">🔨</span>
          <span v-if="hole.state === 'whacked'" class="hit-effect">💥</span>
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
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useGameSounds } from '@/composables/useGameSounds';
import { useGameProgress } from '@/composables/useGameProgress';
import { GAME_PAUSE_EVENT, GAME_RESUME_EVENT } from '@/utils/gameEvents';
import { getLevelOverride } from '@/api/game';
import { speak, playVoice } from '@/utils/voice';
import { useAdaptiveAssist } from '@/composables/useAdaptiveAssist';
import { defaultLevelConfig } from '@/utils/levelDefaults';
import GameHeader from '@/components/GameHeader.vue';
import ResultModal from '@/components/ResultModal.vue';
import LevelSelectModal from '@/components/LevelSelectModal.vue';
import PauseMenu from '@/components/PauseMenu.vue';

type HoleState = 'empty' | 'up' | 'whacked';

interface Hole {
  state: HoleState;
  kind: 'mole' | 'bunny';
}

const router = useRouter();
const sounds = useGameSounds();
const { loadStartLevel, saveProgress: saveGameProgress, recordPlay } = useGameProgress('mole');
const assist = useAdaptiveAssist('mole');

const currentLevel = ref(1);
const hits = ref(0);
const hearts = ref(3);
const timeLeft = ref(60);
const showResult = ref(false);
const gameWon = ref(false);
const stars = ref(0);
const failReason = ref('');
const paused = ref(false);
const showLevelSelect = ref(false);
let levelSelectPaused = false;

const holes = ref<Hole[]>(
  Array.from({ length: 9 }, () => ({ state: 'empty' as HoleState, kind: 'mole' as const }))
);

const levelConfig = ref<Record<string, any>>({
  spawnInterval: 900,
  upDuration: 1300,
  bunnyChance: 0,
  timeLimit: 60,
  targetHits: 15,
});

let gameEnded = false;
let autoPausedByHidden = false;
let autoPausedByRest = false;
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let spawnTimer: ReturnType<typeof setInterval> | null = null;
const hideTimeouts = new Map<number, ReturnType<typeof setTimeout>>();

const headerItems = computed(() => [
  { label: '关卡', value: currentLevel.value },
  { label: '击中', value: `${hits.value}/${levelConfig.value.targetHits}` },
  { label: '时间', value: `${timeLeft.value}s`, valueClass: timeLeft.value <= 10 ? 'warning' : '' },
  { label: '生命', value: '❤️'.repeat(hearts.value) },
]);

const applyLevelConfig = async (level: number) => {
  const a = assist.level();
  const base = defaultLevelConfig('mole', level);
  levelConfig.value = {
    ...base,
    upDuration: base.upDuration + 120 * a,
    targetHits: Math.max(5, base.targetHits - 2 * a),
  };
  // 后台难度覆盖优先（离线/未配置时用内置公式）
  const override = await getLevelOverride('mole', level);
  if (override && currentLevel.value === level) {
    levelConfig.value = { ...levelConfig.value, ...override };
  }
};

const clearHideTimeout = (index: number) => {
  const t = hideTimeouts.get(index);
  if (t) {
    clearTimeout(t);
    hideTimeouts.delete(index);
  }
};

const clearAllHoleTimeouts = () => {
  hideTimeouts.forEach((t) => clearTimeout(t));
  hideTimeouts.clear();
};

const spawnCritter = () => {
  if (paused.value || gameEnded) return;
  const emptyHoles = holes.value
    .map((hole, index) => (hole.state === 'empty' ? index : -1))
    .filter((index) => index >= 0);
  if (emptyHoles.length === 0) return;

  const index = emptyHoles[Math.floor(Math.random() * emptyHoles.length)];
  const kind = Math.random() < levelConfig.value.bunnyChance ? 'bunny' : 'mole';
  holes.value[index] = { state: 'up', kind };

  clearHideTimeout(index);
  hideTimeouts.set(
    index,
    setTimeout(() => {
      if (holes.value[index].state === 'up') {
        holes.value[index] = { state: 'empty', kind };
      }
      hideTimeouts.delete(index);
    }, levelConfig.value.upDuration)
  );
};

const whack = (index: number) => {
  if (paused.value || gameEnded) return;
  const hole = holes.value[index];
  if (hole.state !== 'up') return;

  clearHideTimeout(index);

  if (hole.kind === 'mole') {
    holes.value[index] = { state: 'whacked', kind: 'mole' };
    hits.value++;
    sounds.play('pop');

    setTimeout(() => {
      if (holes.value[index].state === 'whacked') {
        holes.value[index] = { state: 'empty', kind: 'mole' };
      }
    }, 250);

    if (hits.value >= levelConfig.value.targetHits) {
      endGame(true);
    }
  } else {
    // 小兔子是朋友，不能打！
    holes.value[index] = { state: 'empty', kind: 'bunny' };
    hearts.value--;
    sounds.play('explosion');
    if (hearts.value <= 0) {
      failReason.value = '小兔子是好朋友，下次忍住不打它哦';
      endGame(false);
    }
  }
};

const startGame = () => {
  gameEnded = false;
  paused.value = false;
  spawnTimer = setInterval(spawnCritter, levelConfig.value.spawnInterval);
  startCountdown();
};

const stopLoops = () => {
  if (spawnTimer) {
    clearInterval(spawnTimer);
    spawnTimer = null;
  }
  stopCountdown();
  clearAllHoleTimeouts();
};

const stopCountdown = () => {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
};

const startCountdown = () => {
  stopCountdown();
  countdownTimer = setInterval(() => {
    if (timeLeft.value > 0) {
      timeLeft.value--;
    } else {
      failReason.value = '时间到，就差一点点！';
      endGame(false);
    }
  }, 1000);
};

const pauseGame = () => {
  if (gameEnded) return;
  paused.value = true;
  stopLoops();
  // 清空场面，回来重新开始冒头
  holes.value = holes.value.map(() => ({ state: 'empty' as HoleState, kind: 'mole' as const }));
};

const resumeGame = () => {
  if (gameEnded || !paused.value) return;
  paused.value = false;
  spawnTimer = setInterval(spawnCritter, levelConfig.value.spawnInterval);
  startCountdown();
};

const quitGame = () => {
  router.back();
};

// ─── 选关 ────────────────────────────────
const openLevelSelect = () => {
  if (!gameEnded && !paused.value) {
    levelSelectPaused = true;
    pauseGame();
  }
  showLevelSelect.value = true;
};

const closeLevelSelect = () => {
  showLevelSelect.value = false;
  if (levelSelectPaused) {
    levelSelectPaused = false;
    resumeGame();
  }
};

const chooseLevel = async (level: number) => {
  levelSelectPaused = false;
  showLevelSelect.value = false;
  currentLevel.value = level;
  await applyLevelConfig(level);
  initGame();
};

// 切后台自动暂停，回到游戏继续
const handleVisibilityChange = () => {
  if (document.hidden) {
    if (!paused.value) {
      autoPausedByHidden = true;
      pauseGame();
    }
  } else if (autoPausedByHidden) {
    autoPausedByHidden = false;
    resumeGame();
  }
};

// 护眼休息等全局层叫停/恢复
const handleRestPause = () => {
  if (!gameEnded && !paused.value) {
    autoPausedByRest = true;
    pauseGame();
  }
};

const handleRestResume = () => {
  if (autoPausedByRest) {
    autoPausedByRest = false;
    resumeGame();
  }
};

const initGame = () => {
  hits.value = 0;
  hearts.value = 3;
  timeLeft.value = levelConfig.value.timeLimit;
  failReason.value = '';
  showResult.value = false;
  gameWon.value = false;
  stars.value = 0;
  holes.value = holes.value.map(() => ({ state: 'empty' as HoleState, kind: 'mole' as const }));
  stopLoops();
  startGame();
};

const endGame = (won: boolean) => {
  if (gameEnded) return;
  gameEnded = true;

  stopLoops();
  paused.value = false;
  gameWon.value = won;

  if (won) {
    sounds.play('success');
    stars.value = hearts.value >= 3 ? 3 : hearts.value === 2 ? 2 : 1;
    assist.record(true);
    saveProgress();
  } else {
    sounds.play('fail');
    assist.record(false);
    recordPlay();
  }

  showResult.value = true;
};

const saveProgress = () => {
  saveGameProgress({
    level: currentLevel.value,
    score: hits.value,
    stars: stars.value,
  });
};

const restartGame = () => {
  initGame();
};

const nextLevel = async () => {
  currentLevel.value++;
  sounds.play('levelUp');
  await applyLevelConfig(currentLevel.value);
  initGame();
};

onMounted(async () => {
  sounds.init();

  // 续关：从上次通关的关卡继续
  currentLevel.value = await loadStartLevel();
  await applyLevelConfig(currentLevel.value);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  document.addEventListener(GAME_PAUSE_EVENT, handleRestPause);
  document.addEventListener(GAME_RESUME_EVENT, handleRestResume);
  initGame();
  playVoice('mole_intro', '打地鼠咯！小兔子是好朋友，不能打哦');
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  document.removeEventListener(GAME_PAUSE_EVENT, handleRestPause);
  document.removeEventListener(GAME_RESUME_EVENT, handleRestResume);
  stopLoops();
});
</script>

<style scoped>
.mole-game {
  min-height: 100vh;
  background: linear-gradient(180deg, #A8E063 0%, #56ab2f 100%);
  padding: 20px;
  position: relative;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.mole-header {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  margin-bottom: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

:deep(.mole-header .label) {
  color: #4a7c2a;
  font-weight: 600;
}

:deep(.mole-header .value) {
  color: #2d5a12;
}

:deep(.mole-header .value.warning) {
  color: #e67e22;
}

:deep(.mole-header .sound-btn),
:deep(.mole-header .back-btn) {
  background: rgba(86, 171, 47, 0.15);
}

.mole-board {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  max-width: 420px;
  margin: 0 auto;
  padding: 16px;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 20px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.hole {
  aspect-ratio: 1;
  position: relative;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, #3d2817 0%, #5d3a1a 55%, #8b5a2b 100%);
  box-shadow: inset 0 6px 14px rgba(0, 0, 0, 0.55), 0 3px 0 rgba(255, 255, 255, 0.35);
  overflow: hidden;
}

.critter {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: 78%;
  height: 78%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  animation: critterUp 0.16s ease-out;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.critter-face {
  font-size: clamp(34px, 9vw, 52px);
  line-height: 1;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.3));
}

.critter.bunny.tempt .critter-face {
  animation: temptWiggle 0.8s ease-in-out infinite;
}

.critter.whacked {
  animation: critterWhacked 0.25s ease-in forwards;
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
  0% { transform: rotate(-70deg) scale(1.15); opacity: 1; }
  55% { transform: rotate(6deg) scale(1); opacity: 1; }
  100% { transform: rotate(6deg) translateY(5px); opacity: 0; }
}

.hit-effect {
  position: absolute;
  font-size: 30px;
  animation: hitPop 0.25s ease-out forwards;
}

@keyframes critterUp {
  from { transform: translateX(-50%) translateY(90%); }
  to { transform: translateX(-50%) translateY(0); }
}

@keyframes critterWhacked {
  0% { transform: translateX(-50%) scale(1); opacity: 1; }
  100% { transform: translateX(-50%) scale(0.3) rotate(20deg); opacity: 0; }
}

@keyframes temptWiggle {
  0%, 100% { transform: rotate(-6deg); }
  50% { transform: rotate(6deg); }
}

@keyframes hitPop {
  0% { transform: scale(0.5); opacity: 1; }
  100% { transform: scale(1.6); opacity: 0; }
}


/* 响应式 */
@media (max-width: 480px) {
  .mole-board {
    gap: 10px;
    padding: 12px;
  }
}
</style>
