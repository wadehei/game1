<template>
  <div class="brick-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="headerItems"
      :muted="sounds.isMuted.value"
      headerClass="brick-header"
      level-selectable
      @toggleSound="sounds.toggleSound"
      @goBack="router.back()"
      @selectLevel="openLevelSelect"
    />

    <!-- 游戏画布：鼠标/触摸移动球拍 -->
    <canvas
      ref="canvasRef"
      id="brickCanvas"
      class="game-canvas"
      @mousemove="movePaddle"
      @touchmove="movePaddleTouch"
    />

    <!-- 游戏结果弹窗 -->
    <ResultModal
      :show="showResult"
      :won="gameWon"
      :stars="stars"
      :icon="gameWon ? '🎉' : '💪'"
      :title="gameWon ? '砖块全清！' : '球掉啦，再来一次！'"
      :info="`得分: ${score}`"
      @retry="restartGame"
      @next="nextLevel"
    />

    <!-- 暂停（头部为 fixed，按钮下移避开） -->
    <PauseMenu :show="paused" :btn-top="96" @pause="pauseGame" @resume="resumeGame" @quit="quitGame" />

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
import { useGameCanvas } from '@/composables/useGameCanvas';
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

const router = useRouter();
const sounds = useGameSounds();

interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  points: number;
  alive: boolean;
}

const currentLevel = ref(1);
const score = ref(0);
const lives = ref(3);
const showResult = ref(false);
const gameWon = ref(false);
const stars = ref(0);
const showLevelSelect = ref(false);
const paused = ref(false);
let levelSelectPaused = false;

const canvasRef = ref<HTMLCanvasElement | null>(null);
const gameCanvas = useGameCanvas();
const canvasWidth = gameCanvas.canvasWidth;
const canvasHeight = gameCanvas.canvasHeight;
const { loadStartLevel, saveProgress: saveGameProgress, recordPlay } = useGameProgress('brick');
const assist = useAdaptiveAssist('brick');
let ctx: CanvasRenderingContext2D | null = null;
let animationId: number | null = null;
let gameEnded = false;

// 砖块配色（按行循环，彩虹排布）
const BRICK_COLORS = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#a18cd1', '#ff9966', '#4ECDC4', '#e84393'];
const BRICK_H = 22;

let bricks: Brick[] = [];
let particles: Array<{ x: number; y: number; radius: number; alpha: number; color: string; vx: number; vy: number }> = [];

const paddleHeight = 12;
let paddleX = 140;
let paddleWidth = 110;
let paddleY = 0;

let ballX = 200;
let ballY = 300;
let ballVX = 2.2;
let ballVY = -3;
const BALL_R = 7;

const levelConfig = ref<Record<string, any>>({
  rows: 3,
  ballSpeed: 170,
  paddleWidth: 110,
  lives: 3,
});

const headerItems = computed(() => [
  { label: '关卡', value: currentLevel.value },
  { label: '分数', value: score.value },
  { label: '生命', value: '❤️'.repeat(Math.max(lives.value, 0)) },
  { label: '砖块', value: bricks.filter((b) => b.alive).length },
]);

const resetBall = () => {
  ballX = canvasWidth.value / 2;
  ballY = canvasHeight.value - 60;
  // 每次发球给一点随机横向角度，避免死循环轨迹
  const speed = levelConfig.value.ballSpeed / 60;
  const angle = (-60 - Math.random() * 40) * (Math.PI / 180);
  ballVX = Math.cos(angle) * speed * (Math.random() < 0.5 ? -1 : 1);
  ballVY = Math.sin(angle) * speed;
  paddleX = canvasWidth.value / 2 - paddleWidth / 2;
};

const buildBricks = () => {
  bricks = [];
  const rows = levelConfig.value.rows ?? 3;
  const cols = 6;
  const gap = 6;
  const marginX = 14;
  const top = 70;
  const w = (canvasWidth.value - marginX * 2 - gap * (cols - 1)) / cols;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      bricks.push({
        x: marginX + c * (w + gap),
        y: top + r * (BRICK_H + gap),
        w,
        h: BRICK_H,
        color: BRICK_COLORS[r % BRICK_COLORS.length],
        // 越靠上的行分值越高
        points: (rows - r) * 10,
        alive: true,
      });
    }
  }
};

const initGame = async () => {
  score.value = 0;
  lives.value = levelConfig.value.lives ?? 3;
  paddleWidth = levelConfig.value.paddleWidth ?? 110;
  particles = [];
  bricks = [];
  showResult.value = false;
  gameWon.value = false;
  stars.value = 0;
  gameEnded = false;

  await gameCanvas.whenReady();
  ctx = gameCanvas.getCtx();
  paddleY = canvasHeight.value - 34;
  buildBricks();
  resetBall();
  startGame();
};

const pauseLoop = () => {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
};

const resumeLoop = () => {
  if (gameEnded || animationId !== null) return;
  gameLoop();
};

const startGame = () => resumeLoop();

// 切后台自动暂停，回到游戏继续
const handleVisibilityChange = () => {
  if (document.hidden) {
    pauseLoop();
  } else {
    resumeLoop();
  }
};

// 护眼休息等全局层叫停/恢复
const handleRestPause = () => {
  if (!gameEnded) pauseLoop();
};

const handleRestResume = () => {
  // 用户主动暂停期间不因休息结束而恢复
  if (!paused.value) resumeLoop();
};

// ─── 手动暂停 ────────────────────────────────
const pauseGame = () => {
  if (gameEnded || paused.value) return;
  paused.value = true;
  pauseLoop();
};

const resumeGame = () => {
  if (gameEnded || !paused.value) return;
  paused.value = false;
  resumeLoop();
};

const quitGame = () => {
  router.back();
};

const spawnParticles = (x: number, y: number, color: string) => {
  for (let i = 0; i < 6; i += 1) {
    if (particles.length < 30) {
      particles.push({
        x, y,
        radius: 2 + Math.random() * 4,
        alpha: 1,
        color,
        vx: (Math.random() - 0.5) * 3,
        vy: -(1 + Math.random() * 2.5),
      });
    }
  }
};

const gameLoop = () => {
  // 终局/暂停后：当前帧里调用的 pauseLoop 取消的是已执行的旧 rAF id，
  // 必须在这里拦住，否则本函数末尾又会排下一帧，球掉落会持续扣命成负数
  if (gameEnded || paused.value) {
    animationId = null;
    return;
  }
  update();
  render();
  animationId = requestAnimationFrame(gameLoop);
};

const update = () => {
  if (gameEnded || paused.value) return;
  // 球运动
  ballX += ballVX;
  ballY += ballVY;

  // 墙壁反弹
  if (ballX < BALL_R) {
    ballX = BALL_R;
    ballVX = Math.abs(ballVX);
  }
  if (ballX > canvasWidth.value - BALL_R) {
    ballX = canvasWidth.value - BALL_R;
    ballVX = -Math.abs(ballVX);
  }
  if (ballY < BALL_R) {
    ballY = BALL_R;
    ballVY = Math.abs(ballVY);
  }

  // 球拍反弹（命中位置影响横向角度，有"打弧线"的手感）
  if (
    ballVY > 0 &&
    ballY + BALL_R >= paddleY &&
    ballY - BALL_R <= paddleY + paddleHeight &&
    ballX >= paddleX - BALL_R &&
    ballX <= paddleX + paddleWidth + BALL_R
  ) {
    ballY = paddleY - BALL_R;
    const hit = (ballX - (paddleX + paddleWidth / 2)) / (paddleWidth / 2); // -1~1
    const speed = Math.max(Math.sqrt(ballVX * ballVX + ballVY * ballVY), 3);
    const angle = hit * 1.05; // 最大约 60°
    ballVX = Math.sin(angle) * speed;
    ballVY = -Math.abs(Math.cos(angle) * speed);
    sounds.play('click');
  }

  // 砖块碰撞（AABB，命中即反弹并消砖）
  for (const b of bricks) {
    if (!b.alive) continue;
    if (
      ballX + BALL_R >= b.x && ballX - BALL_R <= b.x + b.w &&
      ballY + BALL_R >= b.y && ballY - BALL_R <= b.y + b.h
    ) {
      b.alive = false;
      score.value += b.points;
      spawnParticles(b.x + b.w / 2, b.y + b.h / 2, b.color);
      sounds.play('collect');
      // 按穿透深度选择反弹轴（简单可靠）
      const overlapX = Math.min(ballX + BALL_R - b.x, b.x + b.w - (ballX - BALL_R));
      const overlapY = Math.min(ballY + BALL_R - b.y, b.y + b.h - (ballY - BALL_R));
      if (overlapX < overlapY) ballVX = -ballVX;
      else ballVY = -ballVY;
      break; // 一帧只碰一块
    }
  }

  // 全清 → 通关
  if (bricks.every((b) => !b.alive)) {
    endGame(true);
    return;
  }

  // 掉球 → 扣生命
  if (ballY > canvasHeight.value + 20) {
    lives.value -= 1;
    sounds.play('fail');
    if (lives.value <= 0) {
      endGame(false);
      return;
    }
    resetBall();
  }

  // 粒子
  particles = particles.filter((p) => p.alpha > 0.05);
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08;
    p.alpha -= 0.03;
  }
};

const render = () => {
  if (!ctx) return;
  const c = ctx;

  c.clearRect(0, 0, canvasWidth.value, canvasHeight.value);

  // 背景
  c.fillStyle = '#12161f';
  c.fillRect(0, 0, canvasWidth.value, canvasHeight.value);

  // 砖块
  for (const b of bricks) {
    if (!b.alive) continue;
    c.fillStyle = b.color;
    c.beginPath();
    c.roundRect(b.x, b.y, b.w, b.h, 4);
    c.fill();
  }

  // 球拍（圆角）
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.roundRect(paddleX, paddleY, paddleWidth, paddleHeight, 6);
  c.fill();

  // 球
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.arc(ballX, ballY, BALL_R, 0, Math.PI * 2);
  c.fill();

  // 粒子
  for (const p of particles) {
    c.globalAlpha = Math.max(p.alpha, 0);
    c.fillStyle = p.color;
    c.beginPath();
    c.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
};

const movePaddle = (e: MouseEvent) => {
  if (paused.value) return;
  const canvas = document.querySelector('#brickCanvas') as HTMLCanvasElement;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  paddleX = Math.max(0, Math.min(x - paddleWidth / 2, canvasWidth.value - paddleWidth));
};

const movePaddleTouch = (e: TouchEvent) => {
  e.preventDefault();
  if (paused.value) return;
  const canvas = document.querySelector('#brickCanvas') as HTMLCanvasElement;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.touches[0].clientX - rect.left;
  paddleX = Math.max(0, Math.min(x - paddleWidth / 2, canvasWidth.value - paddleWidth));
};

const endGame = (won: boolean) => {
  if (gameEnded) return;
  gameEnded = true;

  pauseLoop();

  gameWon.value = won;

  if (won) {
    sounds.play('success');
    const ratio = lives.value / (levelConfig.value.lives ?? 3);
    if (ratio >= 1 && score.value >= bricksTotalPoints() * 0.6) {
      stars.value = 3;
    } else if (ratio >= 0.66) {
      stars.value = 2;
    } else {
      stars.value = 1;
    }
    assist.record(true);
    saveProgress();
  } else {
    sounds.play('fail');
    assist.record(false);
    recordPlay();
  }

  showResult.value = true;
};

// 全部砖块的理论总分（用于星级）
const bricksTotalPoints = (): number => {
  const rows = levelConfig.value.rows ?? 3;
  const cols = 6;
  let sum = 0;
  for (let r = 0; r < rows; r += 1) sum += (rows - r) * 10 * cols;
  return sum;
};

const saveProgress = () => {
  saveGameProgress({ level: currentLevel.value, score: score.value, stars: stars.value });
};

const restartGame = () => {
  initGame();
};

// ─── 选关 ────────────────────────────────
const openLevelSelect = () => {
  if (!gameEnded) {
    levelSelectPaused = true;
    pauseLoop();
  }
  showLevelSelect.value = true;
};

const closeLevelSelect = () => {
  showLevelSelect.value = false;
  if (levelSelectPaused) {
    levelSelectPaused = false;
    resumeLoop();
  }
};

const chooseLevel = async (level: number) => {
  levelSelectPaused = false;
  showLevelSelect.value = false;
  currentLevel.value = level;
  await applyLevelConfig(level);
  initGame();
};

const applyLevelConfig = async (level: number) => {
  const a = assist.level();
  const base = defaultLevelConfig('brick', level);
  levelConfig.value = {
    ...base,
    ballSpeed: Math.round(base.ballSpeed * (1 + 0.12 * a)),
    paddleWidth: Math.round(base.paddleWidth * (1 - 0.12 * a)),
    lives: Math.max(2, (base.lives ?? 3) - (a >= 2 ? 1 : 0)),
  };
  // 后台难度覆盖优先（离线/未配置时用内置公式）
  const override = await getLevelOverride('brick', level);
  if (override && currentLevel.value === level) {
    levelConfig.value = { ...levelConfig.value, ...override };
  }
};

const nextLevel = async () => {
  currentLevel.value++;
  sounds.play('levelUp');
  await applyLevelConfig(currentLevel.value);
  initGame();
};

onMounted(async () => {
  sounds.init();
  gameCanvas.bind(canvasRef.value);
  // 画布尺寸变化后重新锚定球拍
  gameCanvas.onResize(() => {
    paddleY = gameCanvas.canvasHeight.value - 34;
    paddleX = Math.max(0, Math.min(paddleX, gameCanvas.canvasWidth.value - paddleWidth));
    buildBricks();
    resetBall();
  });
  document.addEventListener('visibilitychange', handleVisibilityChange);
  document.addEventListener(GAME_PAUSE_EVENT, handleRestPause);
  document.addEventListener(GAME_RESUME_EVENT, handleRestResume);

  // 续关：从上次通关的关卡继续
  currentLevel.value = await loadStartLevel();
  await applyLevelConfig(currentLevel.value);
  initGame();
  playVoice('brick_intro', '移动球拍接住小球，把砖块全部打掉吧');
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  document.removeEventListener(GAME_PAUSE_EVENT, handleRestPause);
  document.removeEventListener(GAME_RESUME_EVENT, handleRestResume);
  pauseLoop();
});
</script>

<style scoped>
.brick-game {
  min-height: 100vh;
  background: #0f131b;
  position: relative;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.brick-header {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(28, 35, 48, 0.95);
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
  z-index: 10;
}

:deep(.brick-header .label) {
  color: #8b95a8;
}

:deep(.brick-header .value) {
  color: #e6eaf2;
}

.game-canvas {
  width: 100%;
  height: calc(100vh - 80px);
  margin-top: 80px;
  display: block;
  touch-action: none;
}
</style>
