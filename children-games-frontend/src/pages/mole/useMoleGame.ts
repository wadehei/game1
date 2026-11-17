import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useGameSounds } from '@/composables/useGameSounds';
import { useGameProgress } from '@/composables/useGameProgress';
import { useGameLifecycle } from '@/composables/useGameLifecycle';
import { getLevelOverride } from '@/api/game';
import { playVoice } from '@/utils/voice';
import { useAdaptiveAssist } from '@/composables/useAdaptiveAssist';
import { defaultLevelConfig } from '@/utils/levelDefaults';

/**
 * 打地鼠逻辑层（2D/3D 共用）
 * 洞口状态机/生成节奏/命中判定/生命与计时/进度上报都在这层
 */
export type HoleState = 'empty' | 'up' | 'whacked';

export interface Hole {
  state: HoleState;
  kind: 'mole' | 'bunny';
}

export const emptyHoles = (): Hole[] =>
  Array.from({ length: 9 }, () => ({ state: 'empty' as HoleState, kind: 'mole' as const }));

export function useMoleGame() {
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

  const holes = ref<Hole[]>(emptyHoles());

  const levelConfig = ref<Record<string, any>>({
    spawnInterval: 900,
    upDuration: 1300,
    bunnyChance: 0,
    timeLimit: 60,
    targetHits: 15,
  });

  let gameEnded = false;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  let spawnTimer: ReturnType<typeof setInterval> | null = null;
  const hideTimeouts = new Map<number, ReturnType<typeof setTimeout>>();

  const headerItems = computed(() => [
    { label: '关卡', value: currentLevel.value },
    { label: '击中', value: `${hits.value}/${levelConfig.value.targetHits}` },
    {
      label: '时间',
      value: `${timeLeft.value}s`,
      valueClass: timeLeft.value <= 10 ? 'warning' : '',
    },
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
    const emptyHoleIdx = holes.value
      .map((hole, index) => (hole.state === 'empty' ? index : -1))
      .filter((index) => index >= 0);
    if (emptyHoleIdx.length === 0) return;

    const index = emptyHoleIdx[Math.floor(Math.random() * emptyHoleIdx.length)];
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
    holes.value = emptyHoles();
  };

  const resumeGame = () => {
    if (gameEnded || !paused.value) return;
    paused.value = false;
    spawnTimer = setInterval(spawnCritter, levelConfig.value.spawnInterval);
    startCountdown();
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

  const initGame = () => {
    hits.value = 0;
    hearts.value = 3;
    timeLeft.value = levelConfig.value.timeLimit;
    failReason.value = '';
    showResult.value = false;
    gameWon.value = false;
    stars.value = 0;
    holes.value = emptyHoles();
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
    initGame();
    playVoice('mole_intro', '打地鼠咯！小兔子是好朋友，不能打哦');
  });

  onUnmounted(() => {
    stopLoops();
  });

  return {
    // 状态
    sounds,
    currentLevel,
    hits,
    hearts,
    timeLeft,
    showResult,
    gameWon,
    stars,
    failReason,
    paused,
    showLevelSelect,
    holes,
    levelConfig,
    headerItems,
    // 动作
    whack,
    pauseGame,
    resumeGame,
    openLevelSelect,
    closeLevelSelect,
    chooseLevel,
    restartGame,
    nextLevel,
  };
}
