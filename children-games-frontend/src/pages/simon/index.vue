<template>
  <div class="simon-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="headerItems"
      :muted="sounds.isMuted.value"
      headerClass="simon-header"
      level-selectable
      @toggleSound="sounds.toggleSound"
      @goBack="router.back()"
      @selectLevel="openLevelSelect"
    />

    <!-- 状态提示 -->
    <div class="status-bar">
      <span class="status-text">{{ statusText }}</span>
    </div>

    <!-- 四色音块 -->
    <div class="simon-board">
      <div
        v-for="pad in PADS"
        :key="pad.id"
        class="pad"
        :class="[pad.color, { lit: litPad === pad.id, wrong: wrongPad === pad.id }]"
        @pointerdown.stop.prevent="tapPad(pad.id)"
      >
        <span class="pad-icon">{{ pad.emoji }}</span>
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
import { soundManager } from '@/utils/sound';
import { GAME_PAUSE_EVENT, GAME_RESUME_EVENT } from '@/utils/gameEvents';
import { getLevelOverride } from '@/api/game';
import { speak } from '@/utils/voice';
import GameHeader from '@/components/GameHeader.vue';
import ResultModal from '@/components/ResultModal.vue';
import LevelSelectModal from '@/components/LevelSelectModal.vue';

// 四个音块：颜色 + 音高（C5 / E5 / G5 / C6，五度上行，儿童音域友好）
const PADS = [
  { id: 0, color: 'red', tone: 523.25, emoji: '🍓' },
  { id: 1, color: 'yellow', tone: 659.25, emoji: '⭐' },
  { id: 2, color: 'teal', tone: 783.99, emoji: '🌊' },
  { id: 3, color: 'green', tone: 1046.5, emoji: '🍀' },
] as const;

type Phase = 'ready' | 'playing' | 'input' | 'replay' | 'done';

const router = useRouter();
const sounds = useGameSounds();
const { loadStartLevel, saveProgress: saveGameProgress } = useGameProgress('simon');

const currentLevel = ref(1);
const hearts = ref(3);
const inputIndex = ref(0);
const litPad = ref<number | null>(null);
const wrongPad = ref<number | null>(null);
const phase = ref<Phase>('ready');
const showResult = ref(false);
const gameWon = ref(false);
const stars = ref(0);
const showLevelSelect = ref(false);

const levelConfig = ref({ seqLength: 3 });

let sequence: number[] = [];
let gameEnded = false;
const playbackTimeouts: ReturnType<typeof setTimeout>[] = [];

const headerItems = computed(() => [
  { label: '关卡', value: currentLevel.value },
  { label: '进度', value: `${Math.min(inputIndex.value, levelConfig.value.seqLength)}/${levelConfig.value.seqLength}` },
  { label: '生命', value: '❤️'.repeat(hearts.value) },
]);

const statusText = computed(() => {
  switch (phase.value) {
    case 'ready': return '看好了～';
    case 'playing': return '仔细听 👂';
    case 'input': return '轮到你啦 👆';
    case 'replay': return '没关系，再听一次～';
    case 'done': return '太棒了！';
  }
  return '';
});

const applyLevelConfig = async (level: number) => {
  levelConfig.value = {
    seqLength: Math.min(2 + level, 12),
  };
  // 后台难度覆盖优先（离线/未配置时用内置公式）
  const override = await getLevelOverride('simon', level);
  if (override && currentLevel.value === level) {
    levelConfig.value = { ...levelConfig.value, ...override };
  }
};

const clearPlayback = () => {
  playbackTimeouts.forEach(clearTimeout);
  playbackTimeouts.length = 0;
};

const addTimeout = (fn: () => void, ms: number) => {
  playbackTimeouts.push(setTimeout(fn, ms));
};

// 生成序列，避免相邻重复（孩子更容易跟住）
const generateSequence = (length: number): number[] => {
  const result: number[] = [];
  while (result.length < length) {
    const next = Math.floor(Math.random() * PADS.length);
    if (next !== result[result.length - 1]) {
      result.push(next);
    }
  }
  return result;
};

const lightPad = (padId: number, ms: number) => {
  litPad.value = padId;
  soundManager.playTone(PADS[padId].tone);
  addTimeout(() => {
    if (litPad.value === padId) {
      litPad.value = null;
    }
  }, ms);
};

const playSequence = () => {
  if (gameEnded) return;
  clearPlayback();
  phase.value = 'playing';
  inputIndex.value = 0;
  litPad.value = null;

  const stepMs = Math.max(620 - currentLevel.value * 25, 380);
  sequence.forEach((padId, i) => {
    addTimeout(() => lightPad(padId, stepMs * 0.55), i * stepMs);
  });
  addTimeout(() => {
    phase.value = 'input';
  }, sequence.length * stepMs + 150);
};

const tapPad = (padId: number) => {
  if (gameEnded || phase.value !== 'input') return;

  soundManager.playTone(PADS[padId].tone);
  litPad.value = padId;
  addTimeout(() => {
    if (litPad.value === padId) {
      litPad.value = null;
    }
  }, 160);

  if (padId === sequence[inputIndex.value]) {
    inputIndex.value++;
    if (inputIndex.value >= sequence.length) {
      phase.value = 'done';
      endGame(true);
    }
  } else {
    hearts.value--;
    wrongPad.value = padId;
    addTimeout(() => {
      wrongPad.value = null;
    }, 450);
    sounds.play('bounce');

    if (hearts.value <= 0) {
      endGame(false);
    } else {
      // 温和重试：同样的序列再听一次，不惩罚
      phase.value = 'replay';
      addTimeout(() => playSequence(), 950);
    }
  }
};

const initGame = () => {
  gameEnded = false;
  hearts.value = 3;
  showResult.value = false;
  gameWon.value = false;
  stars.value = 0;
  inputIndex.value = 0;
  clearPlayback();

  sequence = generateSequence(levelConfig.value.seqLength);
  phase.value = 'ready';
  // 首播留出语音引导时间
  addTimeout(() => playSequence(), 2400);
};

const endGame = (won: boolean) => {
  if (gameEnded) return;
  gameEnded = true;

  clearPlayback();
  gameWon.value = won;

  if (won) {
    sounds.play('success');
    stars.value = hearts.value >= 3 ? 3 : hearts.value === 2 ? 2 : 1;
    saveProgress();
  } else {
    sounds.play('fail');
  }

  showResult.value = true;
};

const saveProgress = () => {
  saveGameProgress({
    level: currentLevel.value,
    score: levelConfig.value.seqLength,
    stars: stars.value,
  });
};

const restartGame = () => {
  initGame();
};

// ─── 选关（无计时，弹层打开时无需暂停） ──────────────
const openLevelSelect = () => {
  showLevelSelect.value = true;
};

const chooseLevel = async (level: number) => {
  showLevelSelect.value = false;
  currentLevel.value = level;
  await applyLevelConfig(level);
  initGame();
};

const nextLevel = async () => {
  currentLevel.value++;
  sounds.play('levelUp');
  await applyLevelConfig(currentLevel.value);
  initGame();
};

// 切走时取消播放/输入，回来重新播一遍当前序列
const handleVisibilityChange = () => {
  if (document.hidden) {
    clearPlayback();
    if (!gameEnded) {
      phase.value = 'ready';
    }
  } else if (!gameEnded && showResult.value === false) {
    playSequence();
  }
};

// 护眼休息等全局层叫停/恢复
const handleRestPause = () => {
  if (!gameEnded) {
    clearPlayback();
    phase.value = 'ready';
  }
};

const handleRestResume = () => {
  if (!gameEnded && !showResult.value) {
    playSequence();
  }
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
  speak('记住闪光的顺序，然后跟着点');
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  document.removeEventListener(GAME_PAUSE_EVENT, handleRestPause);
  document.removeEventListener(GAME_RESUME_EVENT, handleRestResume);
  clearPlayback();
});
</script>

<style scoped>
.simon-game {
  min-height: 100vh;
  background: linear-gradient(180deg, #1a1a2e 0%, #24243e 100%);
  padding: 20px;
  position: relative;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.simon-header {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  margin-bottom: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

:deep(.simon-header .label) {
  color: rgba(255, 255, 255, 0.6);
}

:deep(.simon-header .value) {
  color: #fff;
}

:deep(.simon-header .sound-btn),
:deep(.simon-header .back-btn) {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.status-bar {
  text-align: center;
  margin-bottom: 16px;
}

.status-text {
  display: inline-block;
  font-size: 18px;
  font-weight: bold;
  color: #FFE66D;
  background: rgba(255, 230, 109, 0.1);
  padding: 8px 22px;
  border-radius: 20px;
}

.simon-board {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
  max-width: 340px;
  margin: 0 auto;
}

.pad {
  aspect-ratio: 1;
  border-radius: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 3px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
  transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.pad:active {
  transform: scale(0.96);
}

.pad.red { background: linear-gradient(135deg, #FF6B6B 0%, #ee5253 100%); }
.pad.yellow { background: linear-gradient(135deg, #FFE66D 0%, #feca57 100%); }
.pad.teal { background: linear-gradient(135deg, #4ECDC4 0%, #1dd1a1 100%); }
.pad.green { background: linear-gradient(135deg, #95E1D3 0%, #7acbb8 100%); }

.pad.lit {
  transform: scale(1.07);
  filter: brightness(1.35);
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.85), 0 0 34px rgba(255, 255, 255, 0.6);
}

.pad.wrong {
  animation: padShake 0.4s ease;
  filter: grayscale(0.5) brightness(0.7);
}

@keyframes padShake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-7px); }
  50% { transform: translateX(7px); }
  75% { transform: translateX(-5px); }
}

.pad-icon {
  font-size: clamp(40px, 11vw, 58px);
  filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.3));
}

.tip-text {
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  margin-top: 18px;
}

@media (max-width: 380px) {
  .simon-board {
    gap: 10px;
  }
}
</style>
