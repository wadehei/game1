import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useGameSounds } from '@/composables/useGameSounds';
import { useGameProgress } from '@/composables/useGameProgress';
import { useGameLifecycle } from '@/composables/useGameLifecycle';
import { soundManager } from '@/utils/sound';
import { getLevelOverride } from '@/api/game';
import { playVoice } from '@/utils/voice';
import { defaultLevelConfig } from '@/utils/levelDefaults';

/**
 * 音乐记忆（Simon）逻辑层（2D/3D 共用）
 * 序列生成/播放调度/点按判定/生命与重试/进度上报都在这层
 */
export interface SimonPad {
  id: number;
  color: string;
  tone: number;
  emoji: string;
}

// 四个音块：颜色 + 音高（C5 / E5 / G5 / C6，五度上行，儿童音域友好）
export const PADS: SimonPad[] = [
  { id: 0, color: 'red', tone: 523.25, emoji: '🍓' },
  { id: 1, color: 'yellow', tone: 659.25, emoji: '⭐' },
  { id: 2, color: 'teal', tone: 783.99, emoji: '🌊' },
  { id: 3, color: 'green', tone: 1046.5, emoji: '🍀' },
];

export type SimonPhase = 'ready' | 'playing' | 'input' | 'replay' | 'done';

export function useSimonGame() {
  const sounds = useGameSounds();
  const { loadStartLevel, saveProgress: saveGameProgress, recordPlay } = useGameProgress('simon');

  const currentLevel = ref(1);
  const hearts = ref(3);
  const inputIndex = ref(0);
  const litPad = ref<number | null>(null);
  const wrongPad = ref<number | null>(null);
  const phase = ref<SimonPhase>('ready');
  const showResult = ref(false);
  const gameWon = ref(false);
  const stars = ref(0);
  const showLevelSelect = ref(false);
  const paused = ref(false);

  const levelConfig = ref<Record<string, any>>({ seqLength: 3, playbackMs: 595 });

  let sequence: number[] = [];
  let gameEnded = false;
  const playbackTimeouts: ReturnType<typeof setTimeout>[] = [];

  const headerItems = computed(() => [
    { label: '关卡', value: currentLevel.value },
    {
      label: '进度',
      value: `${Math.min(inputIndex.value, levelConfig.value.seqLength)}/${levelConfig.value.seqLength}`,
    },
    { label: '生命', value: '❤️'.repeat(hearts.value) },
  ]);

  const statusText = computed(() => {
    switch (phase.value) {
      case 'ready':
        return '看好了～';
      case 'playing':
        return '仔细听 👂';
      case 'input':
        return '轮到你啦 👆';
      case 'replay':
        return '没关系，再听一次～';
      case 'done':
        return '太棒了！';
    }
    return '';
  });

  const applyLevelConfig = async (level: number) => {
    levelConfig.value = {
      ...defaultLevelConfig('simon', level),
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

    const stepMs = Math.max(levelConfig.value.playbackMs, 150);
    sequence.forEach((padId, i) => {
      addTimeout(() => lightPad(padId, stepMs * 0.55), i * stepMs);
    });
    addTimeout(
      () => {
        phase.value = 'input';
      },
      sequence.length * stepMs + 150
    );
  };

  const tapPad = (padId: number) => {
    if (gameEnded || paused.value || phase.value !== 'input') return;

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
      recordPlay();
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

  // 切后台 / 护眼休息：取消播放，回来后重播当前序列
  const handlePause = () => {
    clearPlayback();
    if (!gameEnded) {
      phase.value = 'ready';
    }
  };

  const handleResume = () => {
    if (!gameEnded && !showResult.value && !paused.value) {
      playSequence();
    }
  };

  useGameLifecycle({ onPause: handlePause, onResume: handleResume });

  // ─── 手动暂停：停播序列，恢复后从头重播 ──────────────
  const pauseGame = () => {
    if (gameEnded || paused.value) return;
    paused.value = true;
    clearPlayback();
    phase.value = 'ready';
  };

  const resumeGame = () => {
    if (gameEnded || !paused.value) return;
    paused.value = false;
    if (!showResult.value) {
      playSequence();
    }
  };

  onMounted(async () => {
    sounds.init();

    // 续关：从上次通关的关卡继续
    currentLevel.value = await loadStartLevel();
    await applyLevelConfig(currentLevel.value);
    initGame();
    playVoice('simon_intro', '记住闪光的顺序，然后跟着点');
  });

  onUnmounted(() => {
    clearPlayback();
  });

  return {
    // 状态
    sounds,
    currentLevel,
    hearts,
    inputIndex,
    litPad,
    wrongPad,
    phase,
    showResult,
    gameWon,
    stars,
    showLevelSelect,
    paused,
    levelConfig,
    headerItems,
    statusText,
    // 动作
    tapPad,
    openLevelSelect,
    chooseLevel,
    closeLevelSelect: () => {
      showLevelSelect.value = false;
    },
    restartGame,
    nextLevel,
    pauseGame,
    resumeGame,
  };
}
