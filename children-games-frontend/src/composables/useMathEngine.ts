import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useGameSounds } from '@/composables/useGameSounds';
import { useGameProgress } from '@/composables/useGameProgress';
import { useGameLifecycle } from '@/composables/useGameLifecycle';
import { useAdaptiveAssist } from '@/composables/useAdaptiveAssist';
import { getLevelOverride } from '@/api/game';
import { speak, stopSpeaking, playVoice } from '@/utils/voice';
import { defaultLevelConfig } from '@/utils/levelDefaults';

export interface MathQuestion {
  mode: 'count' | 'add';
  countA: number;
  countB: number;
  answer: number;
  options: number[];
  subtract?: boolean;
  icon?: string;
}

export interface MathLevelConfig {
  targetCorrect: number;
  forceMode: number;
  countMax: number;
  addMax: number;
  [key: string]: any;
}

// 数数用的演示物件：每题随机一种（不再是只有苹果）
const COUNT_ICONS = ['🍎', '🍌', '🍇', '🍊', '🍓', '🌟', '🎈', '🐥', '🐟', '🧁'];

// 数字读成中文（数学题语音读题）
const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

// 物件中文名 + 量词（语音读题和提示用）
const ICON_NAMES: Record<string, { name: string; mw: string }> = {
  '🍎': { name: '苹果', mw: '个' },
  '🍌': { name: '香蕉', mw: '根' },
  '🍇': { name: '葡萄', mw: '颗' },
  '🍊': { name: '橘子', mw: '个' },
  '🍓': { name: '草莓', mw: '颗' },
  '🌟': { name: '星星', mw: '颗' },
  '🎈': { name: '气球', mw: '个' },
  '🐥': { name: '小鸡', mw: '只' },
  '🐟': { name: '小鱼', mw: '条' },
  '🧁': { name: '蛋糕', mw: '个' },
};

const iconInfo = (icon?: string) => ICON_NAMES[icon || '🍎'] || { name: '苹果', mw: '个' };

export function useMathEngine() {
  const router = useRouter();
  const sounds = useGameSounds();
  const { loadStartLevel, saveProgress: saveGameProgress } = useGameProgress('math');
  const assist = useAdaptiveAssist('math');

  // ── 响应式状态 ──
  const currentLevel = ref(1);
  const correctCount = ref(0);
  const wrongCount = ref(0);
  const monsterState = ref<'idle' | 'happy' | 'shake'>('idle');
  const showResult = ref(false);
  const stars = ref(0);
  const showLevelSelect = ref(false);
  const paused = ref(false);
  // 计时统计：通关用时是成绩（秒），进排行榜比快慢
  const timeCost = ref(0);
  const finalSeconds = ref(0);

  const levelConfig = ref<MathLevelConfig>({
    targetCorrect: 8,
    forceMode: 0,
    countMax: 0,
    addMax: 0,
  });
  const question = ref<MathQuestion>({
    mode: 'count',
    countA: 1,
    countB: 0,
    answer: 1,
    options: [1, 2, 3],
  });

  // ── 非响应式状态 ──
  let levelStartTs = 0;
  let timeTicker: ReturnType<typeof setInterval> | null = null;
  let gameEnded = false;
  let hintTimer: ReturnType<typeof setTimeout> | null = null;
  let transitionTimer: ReturnType<typeof setTimeout> | null = null;
  let pausedAt = 0;
  // 区分系统自动暂停与用户手动暂停
  let autoPausedByRest = false;

  // ── Computed ──
  const headerItems = computed(() => [
    { label: '关卡', value: currentLevel.value },
    { label: '答对', value: `${correctCount.value}/${levelConfig.value.targetCorrect}` },
    { label: '用时', value: `${timeCost.value}s`, valueClass: 'math-timer' },
    { label: '想一想', value: wrongCount.value },
  ]);

  const hintText = computed(() => {
    const q = question.value;
    const info = iconInfo(q.icon);
    if (q.mode === 'count') {
      return `一共有几${info.mw}${info.name}呀？`;
    }
    return q.subtract ? '拿走了一部分，还剩几个呀？' : '两盘合起来是多少呀？';
  });

  // ── 关卡配置 ──
  const applyLevelConfig = async (level: number) => {
    const a = assist.level();
    const base = defaultLevelConfig('math', level);
    levelConfig.value = {
      ...base,
      targetCorrect: Math.round(base.targetCorrect * (1 + 0.1 * a)),
    };
    // 后台难度覆盖优先（离线/未配置时用内置公式）
    const override = await getLevelOverride('math', level);
    if (override && currentLevel.value === level) {
      levelConfig.value = { ...levelConfig.value, ...override };
    }
  };

  // ── 出题逻辑 ──
  // 按关卡出题：数数(1-5) → 数数(4-10) → 5以内加法 → 10以内加法 → 15以内加法 → 20以内加减混合
  // 后台可强制题目模式（forceMode）并指定数数/加法上限
  const generateQuestion = (): MathQuestion => {
    const level = currentLevel.value;
    const { forceMode = 0, countMax = 0, addMax = 0 } = levelConfig.value;
    let mode: 'count' | 'add';
    let countA: number;
    let countB = 0;
    let subtract = false; // 高关卡引入减法

    if (forceMode === 1) {
      mode = 'count';
      const max = countMax > 0 ? countMax : 5;
      countA = Math.max(1, max - 4) + Math.floor(Math.random() * (max - Math.max(1, max - 4) + 1));
    } else if (forceMode === 2) {
      mode = 'add';
      const max = addMax > 0 ? addMax : 10;
      countA = 1 + Math.floor(Math.random() * (max - 1));
      countB = 1 + Math.floor(Math.random() * (max - countA));
    } else if (level <= 3) {
      mode = 'count';
      countA = 1 + Math.floor(Math.random() * 5);
    } else if (level <= 6) {
      mode = 'count';
      countA = 4 + Math.floor(Math.random() * 7);
    } else if (level <= 10) {
      mode = 'add';
      countA = 1 + Math.floor(Math.random() * 4);
      countB = 1 + Math.floor(Math.random() * (5 - countA));
    } else if (level <= 14) {
      // 10~15 以内加法
      mode = 'add';
      const max = 10 + Math.min(5, level - 10);
      countA = 1 + Math.floor(Math.random() * (max - 2));
      countB = 1 + Math.floor(Math.random() * (max - countA));
    } else {
      // 20 以内加减混合：一半加法一半减法
      mode = 'add';
      subtract = Math.random() < 0.5;
      const max = 20;
      countA = 2 + Math.floor(Math.random() * (max - 3));
      if (subtract) {
        countB = 1 + Math.floor(Math.random() * (countA - 1));
      } else {
        countB = 1 + Math.floor(Math.random() * (max - countA));
      }
    }

    const answer = mode === 'count' ? countA : subtract ? countA - countB : countA + countB;

    // 三个选项：正确答案 + 邻近数（范围随答案放大到 20）
    const optMax = Math.max(12, answer + 3);
    const options = new Set<number>([answer]);
    while (options.size < 3) {
      const candidate = answer + Math.floor(Math.random() * 7) - 3;
      if (candidate >= 1 && candidate <= optMax) {
        options.add(candidate);
      }
    }
    const optionList = [...options];
    for (let i = optionList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [optionList[i], optionList[j]] = [optionList[j], optionList[i]];
    }

    return {
      mode,
      countA,
      countB,
      answer,
      options: optionList,
      subtract,
      icon: COUNT_ICONS[Math.floor(Math.random() * COUNT_ICONS.length)],
    };
  };

  const nextQuestion = () => {
    question.value = generateQuestion();
    const q = question.value;
    const info = iconInfo(q.icon);
    if (q.mode === 'count') {
      speak(`一共有几${info.mw}${info.name}呀？`);
    } else if (q.subtract) {
      speak(`${CN_NUM[q.countA]} 减 ${CN_NUM[q.countB]}，等于几？`);
    } else {
      speak(`${CN_NUM[q.countA]} 加 ${CN_NUM[q.countB]}，等于几？`);
    }
  };

  // ── 计时器管理 ──
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

  // ── 答题 ──
  const answerQuestion = (value: number) => {
    if (gameEnded || paused.value || monsterState.value !== 'idle') return;

    if (value === question.value.answer) {
      correctCount.value++;
      monsterState.value = 'happy';
      sounds.play('collect');
      playVoice('math_correct', '答对啦！');

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
      playVoice('math_wrong', '再想一想哦');

      hintTimer = setTimeout(() => {
        monsterState.value = 'idle';
      }, 550);
    }
  };

  // ── 暂停/恢复：冻结计时（成绩=用时，暂停不计数），禁止答题 ──
  const pauseGame = () => {
    if (gameEnded || paused.value) return;
    paused.value = true;
    pausedAt = Date.now();
    if (timeTicker) {
      clearInterval(timeTicker);
      timeTicker = null;
    }
    clearTimers();
    stopSpeaking();
  };

  const resumeGame = () => {
    if (gameEnded || !paused.value) return;
    paused.value = false;
    // 把暂停时长从计时里剔除
    levelStartTs += Date.now() - pausedAt;
    timeTicker = setInterval(() => {
      if (!gameEnded && !paused.value) {
        timeCost.value = Math.floor((Date.now() - levelStartTs) / 1000);
      }
    }, 1000);
  };

  const quitGame = () => {
    router.back();
  };

  // ── 游戏初始化 ──
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

  // ── 游戏结束 ──
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

  // ── 选关 ──
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

  // ── 生命周期集成 ──
  const handlePause = () => {
    if (!paused.value) {
      autoPausedByRest = true;
      pauseGame();
    }
  };

  const handleResume = () => {
    if (autoPausedByRest) {
      autoPausedByRest = false;
      resumeGame();
    }
  };

  useGameLifecycle({ onPause: handlePause, onResume: handleResume });

  const onMountedSetup = async () => {
    sounds.init();

    // 续关：从上次通关的关卡继续
    currentLevel.value = await loadStartLevel();
    await applyLevelConfig(currentLevel.value);
    initGame();
  };

  const onUnmountedCleanup = () => {
    clearTimers();
    if (timeTicker) {
      clearInterval(timeTicker);
      timeTicker = null;
    }
  };

  return {
    // 状态
    currentLevel,
    correctCount,
    wrongCount,
    monsterState,
    showResult,
    stars,
    showLevelSelect,
    paused,
    timeCost,
    finalSeconds,

    // 游戏状态
    question,

    // Computed
    headerItems,
    hintText,

    // 方法
    answerQuestion,
    pauseGame,
    resumeGame,
    quitGame,
    openLevelSelect,
    chooseLevel,
    nextLevel,
    restartGame,

    // 生命周期
    onMountedSetup,
    onUnmountedCleanup,

    // 依赖（模板访问）
    sounds,
  };
}
