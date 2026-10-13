<template>
  <div class="math-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="headerItems"
      :muted="sounds.isMuted.value"
      headerClass="math-header"
      level-selectable
      @toggleSound="sounds.toggleSound"
      @goBack="router.back()"
      @selectLevel="openLevelSelect"
    />

    <!-- 计时展示 -->
    <div class="timer-bar">⏱️ {{ timeCost }} 秒</div>

    <!-- 小怪兽 + 题目 -->
    <div class="monster-area">
      <div class="monster" :class="monsterState">👾</div>
      <div class="bubble">{{ hintText }}</div>
    </div>

    <!-- 苹果演示区 -->
    <div class="visual-area">
      <template v-if="question.mode === 'count'">
        <div class="apple-group">
          <span v-for="n in question.countA" :key="n" class="apple">🍎</span>
        </div>
      </template>
      <template v-else>
        <div class="apple-group">
          <span v-for="n in question.countA" :key="'a' + n" class="apple">🍎</span>
        </div>
        <span class="math-sign">+</span>
        <div class="apple-group">
          <span v-for="n in question.countB" :key="'b' + n" class="apple">🍎</span>
        </div>
      </template>
    </div>

    <!-- 选项 -->
    <div class="options">
      <button
        v-for="option in question.options"
        :key="option"
        class="option-btn"
        @click="answerQuestion(option)"
      >
        {{ option }}
      </button>
    </div>

    <!-- 游戏结果弹窗 -->
    <ResultModal
      :show="showResult"
      :won="true"
      :stars="stars"
      icon="🎉"
      title="小怪兽吃饱啦！"
      :info="`答对 ${correctCount} 题 · 用时 ${finalSeconds} 秒`"
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
import { getLevelOverride } from '@/api/game';
import { speak } from '@/utils/voice';
import GameHeader from '@/components/GameHeader.vue';
import ResultModal from '@/components/ResultModal.vue';
import LevelSelectModal from '@/components/LevelSelectModal.vue';

interface MathQuestion {
  mode: 'count' | 'add';
  countA: number;
  countB: number;
  answer: number;
  options: number[];
}

const router = useRouter();
const sounds = useGameSounds();
const { loadStartLevel, saveProgress: saveGameProgress } = useGameProgress('math');

const currentLevel = ref(1);
const correctCount = ref(0);
const wrongCount = ref(0);
const monsterState = ref<'idle' | 'happy' | 'shake'>('idle');
const showResult = ref(false);
const stars = ref(0);
const showLevelSelect = ref(false);
// 计时统计：通关用时是成绩（秒），进排行榜比快慢
const timeCost = ref(0);
const finalSeconds = ref(0);
let levelStartTs = 0;
let timeTicker: ReturnType<typeof setInterval> | null = null;

const levelConfig = ref({ targetCorrect: 8 });
const question = ref<MathQuestion>({ mode: 'count', countA: 1, countB: 0, answer: 1, options: [1, 2, 3] });

let gameEnded = false;
let hintTimer: ReturnType<typeof setTimeout> | null = null;
let transitionTimer: ReturnType<typeof setTimeout> | null = null;

const headerItems = computed(() => [
  { label: '关卡', value: currentLevel.value },
  { label: '答对', value: `${correctCount.value}/${levelConfig.value.targetCorrect}` },
  { label: '用时', value: `${timeCost.value}s`, valueClass: 'math-timer' },
  { label: '想一想', value: wrongCount.value },
]);

const hintText = computed(() => {
  if (question.value.mode === 'count') {
    return '一共有几颗苹果呀？';
  }
  return '两盘合起来是多少呀？';
});

const applyLevelConfig = async (level: number) => {
  levelConfig.value = {
    targetCorrect: 8,
  };
  // 后台难度覆盖优先（离线/未配置时用内置公式）
  const override = await getLevelOverride('math', level);
  if (override && currentLevel.value === level) {
    levelConfig.value = { ...levelConfig.value, ...override };
  }
};

// 按关卡出题：数数(1-5) → 数数(4-10) → 5以内加法 → 10以内加法
const generateQuestion = (): MathQuestion => {
  const level = currentLevel.value;
  let mode: 'count' | 'add';
  let countA: number;
  let countB = 0;

  if (level <= 3) {
    mode = 'count';
    countA = 1 + Math.floor(Math.random() * 5);
  } else if (level <= 6) {
    mode = 'count';
    countA = 4 + Math.floor(Math.random() * 7);
  } else if (level <= 10) {
    mode = 'add';
    countA = 1 + Math.floor(Math.random() * 4);
    countB = 1 + Math.floor(Math.random() * (5 - countA));
  } else {
    mode = 'add';
    countA = 1 + Math.floor(Math.random() * 9);
    countB = 1 + Math.floor(Math.random() * (10 - countA));
  }

  const answer = mode === 'count' ? countA : countA + countB;

  // 三个选项：正确答案 + 两个邻近数
  const options = new Set<number>([answer]);
  while (options.size < 3) {
    const candidate = answer + Math.floor(Math.random() * 5) - 2;
    if (candidate >= 1 && candidate <= 12) {
      options.add(candidate);
    }
  }
  const optionList = [...options];
  for (let i = optionList.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [optionList[i], optionList[j]] = [optionList[j], optionList[i]];
  }

  return { mode, countA, countB, answer, options: optionList };
};

// 数字读成中文（数学题语音读题）
const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

const nextQuestion = () => {
  question.value = generateQuestion();
  const q = question.value;
  if (q.mode === 'count') {
    speak('一共有几个苹果呀？');
  } else {
    speak(`${CN_NUM[q.countA]} 加 ${CN_NUM[q.countB]}，等于几？`);
  }
};

const clearTimers = () => {
  if (hintTimer) {
    clearTimeout(hintTimer);
    hintTimer = null;
  }
  if (transitionTimer) {
    clearTimeout(transitionTimer);
    transitionTimer = null;
  }
};

const answerQuestion = (value: number) => {
  if (gameEnded || monsterState.value !== 'idle') return;

  if (value === question.value.answer) {
    correctCount.value++;
    monsterState.value = 'happy';
    sounds.play('collect');
    speak('答对啦！');

    transitionTimer = setTimeout(() => {
      monsterState.value = 'idle';
      if (correctCount.value >= levelConfig.value.targetCorrect) {
        endGame();
      } else {
        nextQuestion();
      }
    }, 1000);
  } else {
    // 答错不惩罚，怪兽想一想，同一题再试
    wrongCount.value++;
    monsterState.value = 'shake';
    sounds.play('bounce');
    speak('再想一想哦');

    hintTimer = setTimeout(() => {
      monsterState.value = 'idle';
    }, 550);
  }
};

const initGame = () => {
  gameEnded = false;
  correctCount.value = 0;
  wrongCount.value = 0;
  monsterState.value = 'idle';
  showResult.value = false;
  stars.value = 0;
  timeCost.value = 0;
  finalSeconds.value = 0;
  levelStartTs = Date.now();
  clearTimers();
  timeTicker = setInterval(() => {
    if (!gameEnded) {
      timeCost.value = Math.floor((Date.now() - levelStartTs) / 1000);
    }
  }, 1000);
  nextQuestion();
};

const endGame = () => {
  if (gameEnded) return;
  gameEnded = true;

  finalSeconds.value = Math.max(1, Math.round((Date.now() - levelStartTs) / 1000));
  if (timeTicker) {
    clearInterval(timeTicker);
    timeTicker = null;
  }
  sounds.play('success');
  // 错得越少星星越多：0 次失误 3 星，≤2 次 2 星
  stars.value = wrongCount.value === 0 ? 3 : wrongCount.value <= 2 ? 2 : 1;
  saveProgress();
  showResult.value = true;
};

const saveProgress = () => {
  saveGameProgress({
    level: currentLevel.value,
    score: finalSeconds.value,
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

onMounted(async () => {
  sounds.init();

  // 续关：从上次通关的关卡继续
  currentLevel.value = await loadStartLevel();
  await applyLevelConfig(currentLevel.value);
  initGame();
});

onUnmounted(() => {
  clearTimers();
  if (timeTicker) {
    clearInterval(timeTicker);
    timeTicker = null;
  }
});
</script>

<style scoped>
.math-game {
  min-height: 100vh;
  background: linear-gradient(180deg, #43C59E 0%, #2d9d7a 100%);
  padding: 20px;
  position: relative;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.math-header {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  margin-bottom: 14px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

:deep(.math-header .label) {
  color: #1d6f56;
  font-weight: 600;
}

:deep(.math-header .value) {
  color: #14513f;
}

:deep(.math-header .sound-btn),
:deep(.math-header .back-btn) {
  background: rgba(67, 197, 158, 0.15);
}

.timer-bar {
  text-align: center;
  font-size: 15px;
  font-weight: bold;
  color: #14513f;
  background: rgba(255, 255, 255, 0.45);
  display: table;
  margin: 0 auto 10px;
  padding: 5px 16px;
  border-radius: 14px;
  font-variant-numeric: tabular-nums;
}

.monster-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 14px;
}

.monster {
  font-size: 76px;
  line-height: 1.1;
  filter: drop-shadow(0 5px 8px rgba(0, 0, 0, 0.25));
}

.monster.idle {
  animation: monsterFloat 2.6s ease-in-out infinite;
}

.monster.happy {
  animation: monsterHappy 0.6s ease;
}

.monster.shake {
  animation: monsterShake 0.5s ease;
}

@keyframes monsterFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

@keyframes monsterHappy {
  0%, 100% { transform: translateY(0) scale(1); }
  30% { transform: translateY(-16px) scale(1.15) rotate(-6deg); }
  60% { transform: translateY(-4px) scale(1.08) rotate(5deg); }
}

@keyframes monsterShake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-9px) rotate(-4deg); }
  40% { transform: translateX(9px) rotate(4deg); }
  60% { transform: translateX(-6px); }
  80% { transform: translateX(6px); }
}

.bubble {
  position: relative;
  background: #fff;
  border-radius: 16px;
  padding: 10px 20px;
  font-size: 16px;
  font-weight: bold;
  color: #14513f;
  margin-top: 8px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
}

.bubble::before {
  content: '';
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  border: 8px solid transparent;
  border-bottom-color: #fff;
  border-top: 0;
}

.visual-area {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  flex-wrap: wrap;
  min-height: 120px;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 20px;
  padding: 16px;
  max-width: 420px;
  margin: 0 auto 20px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
}

.apple-group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
  max-width: 180px;
}

.apple {
  font-size: 30px;
  line-height: 1;
  animation: appleIn 0.3s ease backwards;
}

@keyframes appleIn {
  from { transform: scale(0); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.math-sign {
  font-size: 34px;
  font-weight: bold;
  color: #fff;
}

.options {
  display: flex;
  justify-content: center;
  gap: 14px;
  max-width: 420px;
  margin: 0 auto;
}

.option-btn {
  flex: 1;
  max-width: 110px;
  padding: 18px 0;
  font-size: 30px;
  font-weight: bold;
  color: #fff;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
  box-shadow: 0 6px 0 rgba(0, 0, 0, 0.18);
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.option-btn:nth-child(1) { background: linear-gradient(135deg, #FF6B6B 0%, #ee5253 100%); }
.option-btn:nth-child(2) { background: linear-gradient(135deg, #FF9F43 0%, #feca57 100%); }
.option-btn:nth-child(3) { background: linear-gradient(135deg, #54a0ff 0%, #2e86de 100%); }

.option-btn:active {
  transform: translateY(4px);
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.18);
}

@media (max-width: 380px) {
  .option-btn {
    font-size: 26px;
    padding: 15px 0;
  }

  .apple {
    font-size: 26px;
  }
}
</style>
