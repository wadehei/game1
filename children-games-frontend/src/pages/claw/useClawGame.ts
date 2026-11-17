import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useGameSounds } from '@/composables/useGameSounds';
import { useGameProgress } from '@/composables/useGameProgress';
import { useGameLifecycle } from '@/composables/useGameLifecycle';
import { useAdaptiveAssist } from '@/composables/useAdaptiveAssist';
import { getLevelOverride } from '@/api/game';
import { playVoice } from '@/utils/voice';
import { defaultLevelConfig } from '@/utils/levelDefaults';

/**
 * 抓娃娃机逻辑层（2D/3D 共用）
 * 爪子巡航/下爪判定/奖品生成与补充/计时/进度上报都在这层。
 * 坐标约定：clawX 与 prize.x 均为 0~1 归一化位置（渲染层自行换算百分比或场景坐标）；
 * 巡航宽度由 getRailWidth 注入（2D=导轨 DOM 宽 px，3D=场景导轨逻辑宽）。
 */

export interface Prize {
  id: number;
  emoji: string;
  x: number; // 0~1 归一化横向位置
  grabbed: boolean;
}

const TOYS = ['🧸', '🎁', '🐶', '🍭', '🚗', '🌈', '⭐', '🍬', '🦄', '🐧'];

// 归一化坐标常量（与 2D 原版 6%~94% / ±9% 容差完全对应）
export const CLAW_MIN_X = 0.06;
export const CLAW_MAX_X = 0.94;
export const HIT_TOLERANCE = 0.09;

const DROP_MS = 450;
const GRAB_HOLD_MS = 180;

export function useClawGame(getRailWidth: () => number) {
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

  const clawX = ref(0.5); // 0~1
  const clawDir = ref(1);
  const isDropping = ref(false);
  const isReleasing = ref(false); // 收爪中（渲染层据此回弹）
  const isHolding = ref(false);
  const prizes = ref<Prize[]>([]);
  const collected = ref(0);
  const collectedPrizes = ref<string[]>([]);

  const levelConfig = ref<Record<string, number>>({
    clawSpeed: 120,
    targetGrabs: 8,
    timeLimit: 75,
  });

  let gameEnded = false;
  let rafId = 0;
  let lastTs = 0;
  let dropTimer: ReturnType<typeof setTimeout> | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let prizeSeq = 0;

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
      x = 0.08 + Math.random() * 0.84;
      if (!prizes.value.some((p) => !p.grabbed && Math.abs(p.x - x) < 0.14)) break;
    }
    return {
      id: prizeSeq,
      emoji: TOYS[Math.floor(Math.random() * TOYS.length)],
      x,
      grabbed: false,
    };
  };

  const refillPrizes = (): void => {
    while (prizes.value.filter((p) => !p.grabbed).length < 6) {
      prizes.value.push(spawnPrize());
    }
  };

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
    const width = getRailWidth() || 300;
    const speedNorm = levelConfig.value.clawSpeed / width;
    clawX.value += clawDir.value * speedNorm * dt;
    if (clawX.value >= CLAW_MAX_X) {
      clawX.value = CLAW_MAX_X;
      clawDir.value = -1;
    } else if (clawX.value <= CLAW_MIN_X) {
      clawX.value = CLAW_MIN_X;
      clawDir.value = 1;
    }
  };

  const startLoop = (): void => {
    rafId = requestAnimationFrame(step);
  };

  // ── 下爪 ──
  const dropClaw = (): void => {
    if (isDropping.value || gameEnded || paused.value) return;
    isDropping.value = true;
    sounds.play('click');
    dropTimer = setTimeout(() => {
      // 命中判定：爪心与奖品横向距离（归一化容差）
      const hit = prizes.value.find(
        (p) => !p.grabbed && Math.abs(p.x - clawX.value) < HIT_TOLERANCE
      );
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
        // 收爪信号先于解锁巡航（渲染层据此回弹爪子，与原版逐帧等价）
        isReleasing.value = true;
        dropTimer = setTimeout(() => {
          isHolding.value = false;
          isDropping.value = false;
          isReleasing.value = false;
          refillPrizes();
          if (collected.value >= levelConfig.value.targetGrabs) endGame(true);
        }, DROP_MS);
      }, GRAB_HOLD_MS);
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
    clawX.value = 0.5;
    clawDir.value = 1;
    isDropping.value = false;
    isReleasing.value = false;
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
    if (assistLevel >= 1)
      levelConfig.value.clawSpeed = Math.round(levelConfig.value.clawSpeed * 0.8);
    if (assistLevel >= 2) levelConfig.value.targetGrabs -= 2;
  };

  // ── 暂停（手动 + 护眼） ──
  const pauseGame = (): void => {
    paused.value = true;
  };
  const resumeGame = (): void => {
    paused.value = false;
  };

  useGameLifecycle({
    onPause: () => (paused.value = true),
    onResume: () => (paused.value = false),
  });

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
    startLoop();
    currentLevel.value = await loadStartLevel();
    await applyLevelConfig(currentLevel.value);
    initGame();
  });

  onUnmounted(() => {
    cancelAnimationFrame(rafId);
    if (tickTimer) clearInterval(tickTimer);
    if (dropTimer) clearTimeout(dropTimer);
  });

  return {
    // 状态
    sounds,
    currentLevel,
    timeLeft,
    showResult,
    gameWon,
    stars,
    showLevelSelect,
    paused,
    clawX,
    clawDir,
    isDropping,
    isReleasing,
    isHolding,
    prizes,
    collected,
    collectedPrizes,
    levelConfig,
    headerItems,
    statusText,
    // 动作
    dropClaw,
    initGame,
    pauseGame,
    resumeGame,
    openLevelSelect,
    chooseLevel,
    quitGame,
    restartGame,
    nextLevel,
  };
}
