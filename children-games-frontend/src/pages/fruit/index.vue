<template>
  <div class="fruit-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="headerItems"
      :muted="sounds.isMuted.value"
      headerClass="fruit-header"
      level-selectable
      @toggleSound="sounds.toggleSound"
      @goBack="router.back()"
      @selectLevel="openLevelSelect"
    />

    <!-- 游戏画布 -->
    <canvas
      ref="canvasRef"
      id="fruitCanvas"
      class="game-canvas"
      @mousemove="moveBasket"
      @touchmove="moveBasketTouch"
    />

    <!-- 游戏结果弹窗 -->
    <ResultModal
      :show="showResult"
      :won="gameWon"
      :stars="stars"
      :icon="gameWon ? '🎉' : '💪'"
      :title="gameWon ? '恭喜通关！' : '差一点点，再来一次！'"
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
import appleSvg from '@/static/images/games/fruit/apple.svg';
import bananaSvg from '@/static/images/games/fruit/banana.svg';
import orangeSvg from '@/static/images/games/fruit/orange.svg';
import grapeSvg from '@/static/images/games/fruit/grape.svg';
import bombSvg from '@/static/images/games/fruit/bomb.svg';
import basketSvg from '@/static/images/games/fruit/basket.svg';
import cloudSvg from '@/static/images/games/fruit/cloud.svg';
import { ImageLoader } from '@/utils/imageLoader';

const router = useRouter();
const sounds = useGameSounds();

const fruitImages = new ImageLoader();
const imagesLoaded = ref(false);

interface Fruit {
  x: number;
  y: number;
  size: number;
  speed: number;
  type: 'apple' | 'banana' | 'orange' | 'grape' | 'bomb';
  emoji: string;
  points: number;
}

interface Particle {
  x: number; y: number;
  radius: number; alpha: number;
  color: string; speed: number;
}

const fruitTypes = [
  { type: 'apple' as const, emoji: '🍎', points: 10 },
  { type: 'banana' as const, emoji: '🍌', points: 15 },
  { type: 'orange' as const, emoji: '🍊', points: 12 },
  { type: 'grape' as const, emoji: '🍇', points: 20 },
];

const currentLevel = ref(1);
const score = ref(0);
const lives = ref(3);
const targetScore = ref(100);
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
const { loadStartLevel, saveProgress: saveGameProgress, recordPlay } = useGameProgress('fruit');
const assist = useAdaptiveAssist('fruit');
let ctx: CanvasRenderingContext2D | null = null;
let animationId: number | null = null;
let spawnTimer: ReturnType<typeof setInterval> | null = null;
let bgGradient: CanvasGradient | null = null;
let gameEnded = false;

let basketX = 150;
const basketWidth = 70;
const basketHeight = 40;
let basketY = 0;

let fruits: Fruit[] = [];
let particles: Particle[] = [];

const levelConfig = ref<Record<string, any>>({
  spawnRate: 1000,
  fallSpeed: 2,
  bombChance: 0.15,
  targetScore: 100,
  lives: 3,
});

const headerItems = computed(() => [
  { label: '关卡', value: currentLevel.value },
  { label: '分数', value: `${score.value}/${targetScore.value}` },
  { label: '生命', value: '❤️'.repeat(lives.value) },
]);

const initGame = async () => {
  score.value = 0;
  lives.value = levelConfig.value.lives ?? 3;
  targetScore.value = levelConfig.value.targetScore;
  fruits = [];
  showResult.value = false;
  gameWon.value = false;
  stars.value = 0;
  bgGradient = null;
  gameEnded = false;

  // 加载图片资源
  if (!imagesLoaded.value) {
    await fruitImages.loadAll({
      apple: appleSvg, banana: bananaSvg, orange: orangeSvg,
      grape: grapeSvg, bomb: bombSvg, basket: basketSvg, cloud: cloudSvg,
    });
    imagesLoaded.value = true;
  }

  await gameCanvas.whenReady();
  ctx = gameCanvas.getCtx();

  basketX = canvasWidth.value / 2 - basketWidth / 2;
  basketY = canvasHeight.value - basketHeight - 20;
  startGame();
};

const pauseLoop = () => {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  if (spawnTimer) {
    clearInterval(spawnTimer);
    spawnTimer = null;
  }
};

const resumeLoop = () => {
  if (gameEnded || animationId !== null) return;
  spawnTimer = setInterval(spawnFruit, levelConfig.value.spawnRate);
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

const spawnFruit = () => {
  const isBomb = Math.random() < levelConfig.value.bombChance;

  if (isBomb) {
    fruits.push({
      x: Math.random() * (canvasWidth.value - 40) + 20,
      y: -30,
      size: 30,
      speed: levelConfig.value.fallSpeed + Math.random() * 0.5,
      type: 'bomb',
      emoji: '💣',
      points: 0,
    });
  } else {
    const fruitType = fruitTypes[Math.floor(Math.random() * fruitTypes.length)];
    fruits.push({
      x: Math.random() * (canvasWidth.value - 40) + 20,
      y: -30,
      size: 28,
      speed: levelConfig.value.fallSpeed + Math.random() * 0.5,
      type: fruitType.type,
      emoji: fruitType.emoji,
      points: fruitType.points,
    });
  }
};

const gameLoop = () => {
  update();
  render();
  animationId = requestAnimationFrame(gameLoop);
};

const update = () => {
  fruits = fruits.filter((fruit) => {
    fruit.y += fruit.speed;

    // 检查是否被篮子接住
    const basketCenterX = basketX + basketWidth / 2;
    const dx = Math.abs(fruit.x - basketCenterX);
    const dy = Math.abs(fruit.y - basketY);

    if (dx < basketWidth / 2 + fruit.size / 2 && dy < basketHeight / 2) {
      if (fruit.type === 'bomb') {
        sounds.play('explosion');
        lives.value--;
        if (lives.value <= 0) {
          endGame(false);
        }
      } else {
        sounds.play('collect');
        score.value += fruit.points;
        // 接住水果时的粒子效果
        for (let i = 0; i < 5; i++) {
          if (particles.length < 20) {
            particles.push({
              x: fruit.x, y: fruit.y,
              radius: 3 + Math.random() * 5,
              alpha: 1,
              color: ['#FFD700', '#FF6B6B', '#4ECDC4'][Math.floor(Math.random() * 3)],
              speed: 1 + Math.random() * 2,
            });
          }
        }
        if (score.value >= targetScore.value) {
          endGame(true);
        }
      }
      return false;
    }

    // 水果掉出屏幕（只有水果扣分，炸弹不扣）
    if (fruit.y > canvasHeight.value + 30) {
      if (fruit.type !== 'bomb') {
        // 错过水果不扣分，但也不加分
      }
      return false;
    }

    return true;
  });
};

const render = () => {
  if (!ctx) return;
  const c = ctx;

  ctx.clearRect(0, 0, canvasWidth.value, canvasHeight.value);

  // 绘制背景渐变（按当前画布尺寸惰性缓存）
  if (!bgGradient) {
    bgGradient = ctx.createLinearGradient(0, 0, 0, canvasHeight.value);
    bgGradient.addColorStop(0, '#87CEEB');
    bgGradient.addColorStop(1, '#E0F7FA');
  }
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, canvasWidth.value, canvasHeight.value);

  // 绘制云朵装饰
  drawCloud(50, 60, 30);
  drawCloud(200, 100, 25);
  drawCloud(320, 70, 20);

  // 绘制水果和炸弹
  fruits.forEach((fruit) => {
    const img = fruitImages.get(fruit.type);
    if (img) {
      const s = fruit.size * 2;
      c.drawImage(img, fruit.x - s / 2, fruit.y - s / 2, s, s);
    } else {
      // emoji fallback
      c.font = `${fruit.size}px Arial`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(fruit.emoji, fruit.x, fruit.y);
    }
  });

  // 绘制篮子
  drawBasket();

  // 绘制并更新粒子
  if (particles.length > 0) {
    particles = particles.filter(p => {
      p.radius += p.speed;
      p.alpha -= 0.03;
      if (p.alpha <= 0) return false;
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx!.fillStyle = p.color;
      ctx!.globalAlpha = p.alpha;
      ctx!.fill();
      ctx!.globalAlpha = 1;
      return true;
    });
  }
};

const drawCloud = (x: number, y: number, size: number) => {
  if (!ctx) return;
  const img = fruitImages.get('cloud');
  if (img) {
    ctx.drawImage(img, x - size, y - size * 0.5, size * 2.5, size * 1.2);
  } else {
    // fallback: 原来的云朵绘制
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.arc(x + size, y - size * 0.3, size * 0.8, 0, Math.PI * 2);
    ctx.arc(x + size * 1.5, y, size * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawBasket = () => {
  if (!ctx) return;
  const img = fruitImages.get('basket');
  if (img) {
    ctx.drawImage(img, basketX, basketY, basketWidth, basketHeight);
  } else {
    // fallback: 原来的篮子绘制
    const x = basketX;
    const y = basketY;

    // 篮子主体
    ctx.fillStyle = '#8B4513';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + basketWidth, y);
    ctx.lineTo(x + basketWidth - 8, y + basketHeight);
    ctx.lineTo(x + 8, y + basketHeight);
    ctx.closePath();
    ctx.fill();

    // 篮子边缘
    ctx.strokeStyle = '#654321';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.lineTo(x + basketWidth + 5, y);
    ctx.stroke();

    // 篮子纹理
    ctx.strokeStyle = '#A0522D';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 8 + i * 2, y + i * 10);
      ctx.lineTo(x + basketWidth - 8 - i * 2, y + i * 10);
      ctx.stroke();
    }
  }
};

const moveBasket = (e: MouseEvent) => {
  if (paused.value) return;
  const canvas = document.querySelector('#fruitCanvas') as HTMLCanvasElement;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  basketX = Math.max(0, Math.min(x - basketWidth / 2, canvasWidth.value - basketWidth));
};

const moveBasketTouch = (e: TouchEvent) => {
  e.preventDefault();
  if (paused.value) return;
  const canvas = document.querySelector('#fruitCanvas') as HTMLCanvasElement;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.touches[0].clientX - rect.left;
  basketX = Math.max(0, Math.min(x - basketWidth / 2, canvasWidth.value - basketWidth));
};

const endGame = (won: boolean) => {
  if (gameEnded) return;
  gameEnded = true;

  pauseLoop();

  gameWon.value = won;

  if (won) {
    sounds.play('success');
    const ratio = score.value / targetScore.value;
    if (ratio >= 1.5 && lives.value === 3) {
      stars.value = 3;
    } else if (ratio >= 1.2 && lives.value >= 2) {
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
  const base = defaultLevelConfig('fruit', level);
  levelConfig.value = {
    ...base,
    spawnRate: Math.round(base.spawnRate * (1 + 0.15 * a)),
    targetScore: Math.round(base.targetScore * (1 - 0.2 * a)),
  };
  // 后台难度覆盖优先（离线/未配置时用内置公式）
  const override = await getLevelOverride('fruit', level);
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
  // 画布尺寸变化后重建背景渐变、重新锚定篮子
  gameCanvas.onResize(() => {
    bgGradient = null;
    basketY = gameCanvas.canvasHeight.value - basketHeight - 20;
    basketX = Math.max(0, Math.min(basketX, gameCanvas.canvasWidth.value - basketWidth));
  });
  document.addEventListener('visibilitychange', handleVisibilityChange);
  document.addEventListener(GAME_PAUSE_EVENT, handleRestPause);
  document.addEventListener(GAME_RESUME_EVENT, handleRestResume);

  // 续关：从上次通关的关卡继续
  currentLevel.value = await loadStartLevel();
  await applyLevelConfig(currentLevel.value);
  initGame();
  playVoice('fruit_intro', '移动篮子，接住水果，小心炸弹哦');
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  document.removeEventListener(GAME_PAUSE_EVENT, handleRestPause);
  document.removeEventListener(GAME_RESUME_EVENT, handleRestResume);
  pauseLoop();
});
</script>

<style scoped>
.fruit-game {
  min-height: 100vh;
  background: linear-gradient(180deg, #87CEEB 0%, #E0F7FA 100%);
  position: relative;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.fruit-header {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  z-index: 10;
}

:deep(.fruit-header .label) {
  color: #666;
}

:deep(.fruit-header .value) {
  color: #333;
}

.game-canvas {
  width: 100%;
  height: calc(100vh - 80px);
  margin-top: 80px;
  display: block;
  touch-action: none;
}
</style>
