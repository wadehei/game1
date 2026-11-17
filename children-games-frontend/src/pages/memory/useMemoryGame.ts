import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useGameSounds } from '@/composables/useGameSounds';
import { useGameProgress } from '@/composables/useGameProgress';
import { useGameLifecycle } from '@/composables/useGameLifecycle';
import { getLevelOverride } from '@/api/game';
import { playVoice } from '@/utils/voice';
import { useAdaptiveAssist } from '@/composables/useAdaptiveAssist';
import { defaultLevelConfig } from '@/utils/levelDefaults';

/**
 * 记忆翻牌逻辑层（2D/3D 共用）
 * 渲染层只消费这里的响应式状态与动作，翻牌判定/计时/进度上报/难度系统都在这层
 */
export interface MemoryCard {
  id: number;
  emoji: string;
  flipped: boolean;
  matched: boolean;
}

export const MEMORY_EMOJIS = [
  '🐶',
  '🐱',
  '🐼',
  '🦊',
  '🐸',
  '🐵',
  '🐷',
  '🐮',
  '🐔',
  '🐙',
  '🦁',
  '🐯',
  '🐻',
  '🐨',
  '🐰',
  '🐲',
];

export function useMemoryGame() {
  const sounds = useGameSounds();

  const currentLevel = ref(1);
  const moves = ref(0);
  const timeLeft = ref(60);
  const cards = ref<MemoryCard[]>([]);
  const flippedCards = ref<number[]>([]);
  const showResult = ref(false);
  const gameWon = ref(false);
  const stars = ref(0);
  const paused = ref(false);
  const showLevelSelect = ref(false);
  let levelSelectPaused = false;
  const { loadStartLevel, saveProgress: saveGameProgress, recordPlay } = useGameProgress('memory');
  const assist = useAdaptiveAssist('memory');
  let timer: ReturnType<typeof setInterval> | null = null;
  let gameEnded = false;

  const levelConfig = ref<Record<string, any>>({
    pairs: 2,
    timeLimit: 90,
  });

  const gridSize = computed(() => {
    const total = levelConfig.value.pairs * 2;
    // 在 2~4 列里选能整除、且最接近方形（略竖）的布局——卡片尽可能大，无残行
    let best = 2;
    let bestScore = Infinity;
    for (const cols of [4, 3, 2]) {
      if (total % cols !== 0) continue;
      const rows = total / cols;
      const score = Math.abs(rows / cols - 1.4);
      if (score < bestScore) {
        bestScore = score;
        best = cols;
      }
    }
    return best;
  });

  const totalCards = computed(() => levelConfig.value.pairs * 2);

  const headerItems = computed(() => [
    { label: '关卡', value: currentLevel.value },
    {
      label: '时间',
      value: `${timeLeft.value}s`,
      valueClass: timeLeft.value <= 10 ? 'warning' : '',
    },
    { label: '步数', value: moves.value },
  ]);

  const initGame = () => {
    const { pairs } = levelConfig.value;
    const selectedEmojis = MEMORY_EMOJIS.slice(0, pairs);
    const cardPairs = [...selectedEmojis, ...selectedEmojis];

    // Fisher-Yates 均匀洗牌
    cards.value = shuffle(cardPairs).map((emoji, index) => ({
      id: index,
      emoji,
      flipped: false,
      matched: false,
    }));

    moves.value = 0;
    timeLeft.value = levelConfig.value.timeLimit;
    flippedCards.value = [];
    showResult.value = false;
    gameWon.value = false;
    stars.value = 0;
    gameEnded = false;
    paused.value = false;

    startTimer();
  };

  // 均匀洗牌，避免 sort(random) 的分布偏差
  const shuffle = <T>(arr: T[]): T[] => {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };

  const stopTimer = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const startTimer = () => {
    stopTimer();
    timer = setInterval(() => {
      if (timeLeft.value > 0) {
        timeLeft.value--;
      } else {
        endGame(false);
      }
    }, 1000);
  };

  const pauseGame = () => {
    if (gameEnded) return;
    paused.value = true;
    stopTimer();
  };

  const resumeGame = () => {
    if (gameEnded) return;
    paused.value = false;
    startTimer();
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

  // 系统自动暂停（切后台 / 护眼休息）与用户主动暂停的区分
  let autoPausedByRest = false;

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

  const flipCard = (index: number) => {
    const card = cards.value[index];
    if (paused.value || card.flipped || card.matched || flippedCards.value.length >= 2) return;

    card.flipped = true;
    flippedCards.value.push(index);
    sounds.play('click');

    if (flippedCards.value.length === 2) {
      moves.value++;
      checkMatch();
    }
  };

  const checkMatch = () => {
    const [first, second] = flippedCards.value;
    const card1 = cards.value[first];
    const card2 = cards.value[second];

    if (card1.emoji === card2.emoji) {
      card1.matched = true;
      card2.matched = true;
      flippedCards.value = [];
      sounds.play('match');
      checkWin();
    } else {
      sounds.play('bounce');
      setTimeout(() => {
        card1.flipped = false;
        card2.flipped = false;
        flippedCards.value = [];
      }, 800);
    }
  };

  const checkWin = () => {
    const allMatched = cards.value.every((card) => card.matched);
    if (allMatched) {
      endGame(true);
    }
  };

  const endGame = (won: boolean) => {
    if (gameEnded) return;
    gameEnded = true;

    stopTimer();
    paused.value = false;
    gameWon.value = won;

    if (won) {
      sounds.play('success');
      const timeUsed = levelConfig.value.timeLimit - timeLeft.value;
      const timeRatio = timeUsed / levelConfig.value.timeLimit;
      const moveRatio = moves.value / levelConfig.value.pairs;

      if (timeRatio < 0.5 && moveRatio < 2.5) {
        stars.value = 3;
      } else if (timeRatio < 0.7 && moveRatio < 3.5) {
        stars.value = 2;
      } else {
        stars.value = 1;
      }

      assist.record(true);
      // 保存进度
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
      score: moves.value,
      stars: stars.value,
    });
  };

  const restartGame = () => {
    initGame();
  };

  const applyLevelConfig = async (level: number) => {
    const a = assist.level();
    const base = defaultLevelConfig('memory', level);
    levelConfig.value = {
      ...base,
      timeLimit: Math.round(base.timeLimit * (1 + 0.3 * a)),
    };
    // 后台难度覆盖优先（离线/未配置时用内置公式）
    const override = await getLevelOverride('memory', level);
    if (override && currentLevel.value === level) {
      levelConfig.value = { ...levelConfig.value, ...override };
    }
  };

  const nextLevel = async () => {
    currentLevel.value++;
    sounds.play('levelUp');
    // 更新关卡配置
    await applyLevelConfig(currentLevel.value);
    initGame();
  };

  onMounted(async () => {
    sounds.init();

    // 续关：从上次通关的关卡继续
    currentLevel.value = await loadStartLevel();
    await applyLevelConfig(currentLevel.value);
    initGame();
    playVoice('memory_intro', '翻一翻卡片，找出两个一样的图案');
  });

  onUnmounted(() => {
    stopTimer();
  });

  return {
    // 状态
    sounds,
    currentLevel,
    moves,
    timeLeft,
    cards,
    showResult,
    gameWon,
    stars,
    paused,
    showLevelSelect,
    levelConfig,
    gridSize,
    totalCards,
    headerItems,
    // 动作
    initGame,
    flipCard,
    pauseGame,
    resumeGame,
    openLevelSelect,
    closeLevelSelect,
    chooseLevel,
    restartGame,
    nextLevel,
  };
}
