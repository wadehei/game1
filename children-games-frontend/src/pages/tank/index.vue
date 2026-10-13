<template>
  <div class="tank-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="headerItems"
      :muted="sounds.isMuted.value"
      headerClass="tank-header"
      level-selectable
      @toggleSound="sounds.toggleSound"
      @goBack="router.back()"
      @selectLevel="openLevelSelect"
    />

    <!-- 游戏画布 -->
    <canvas
      ref="canvasRef"
      id="tank_canvas"
      class="game-canvas"
      @mousedown="startMove"
      @mousemove="movePlayer"
      @mouseup="stopMove"
      @mouseleave="stopMove"
      @touchstart="startMove"
      @touchmove="movePlayer"
      @touchend="stopMove"
      @touchcancel="stopMove"
    />

    <!-- 控制按钮 -->
    <div class="controls">
      <div
        class="control-btn"
        @mousedown="moveLeft"
        @mouseup="stopMove"
        @mouseleave="stopMove"
        @touchstart.prevent="moveLeft"
        @touchend.prevent="stopMove"
        @touchcancel="stopMove"
      >
        <span>◀️</span>
      </div>
      <div class="control-btn fire-btn" @click="fire" @touchstart.prevent="fire">
        <span>🔥</span>
      </div>
      <div
        class="control-btn"
        @mousedown="moveRight"
        @mouseup="stopMove"
        @mouseleave="stopMove"
        @touchstart.prevent="moveRight"
        @touchend.prevent="stopMove"
        @touchcancel="stopMove"
      >
        <span>▶️</span>
      </div>
    </div>

    <!-- 游戏结果弹窗 -->
    <ResultModal
      :show="showResult"
      :won="gameWon"
      :stars="stars"
      :icon="gameWon ? '🎉' : '💪'"
      :title="gameWon ? '恭喜通关！' : '差一点点，再来一次！'"
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
import { useGameCanvas } from '@/composables/useGameCanvas';
import { useGameProgress } from '@/composables/useGameProgress';
import { GAME_PAUSE_EVENT, GAME_RESUME_EVENT } from '@/utils/gameEvents';
import { getLevelOverride } from '@/api/game';
import { speak } from '@/utils/voice';
import { useAdaptiveAssist } from '@/composables/useAdaptiveAssist';
import { defaultLevelConfig } from '@/utils/levelDefaults';
import GameHeader from '@/components/GameHeader.vue';
import ResultModal from '@/components/ResultModal.vue';
import LevelSelectModal from '@/components/LevelSelectModal.vue';
import PauseMenu from '@/components/PauseMenu.vue';
import tankPlayerSvg from '@/static/images/games/tank/tank-player.svg';
import tankEnemySvg from '@/static/images/games/tank/tank-enemy.svg';
import tankBossSvg from '@/static/images/games/tank/tank-boss.svg';
import bulletPlayerSvg from '@/static/images/games/tank/bullet-player.svg';
import bulletEnemySvg from '@/static/images/games/tank/bullet-enemy.svg';
import groundSvg from '@/static/images/games/tank/ground.svg';
import { ImageLoader } from '@/utils/imageLoader';

interface Tank {
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  speed: number;
  direction: number;
  lastFire: number;
}

interface Bullet {
  x: number;
  y: number;
  speed: number;
  isPlayer: boolean;
}

interface Explosion {
  x: number; y: number;
  radius: number; alpha: number;
  color: string;
}

const router = useRouter();
const sounds = useGameSounds();

const currentLevel = ref(1);
const playerHP = ref(3);
// 每帧高频读写的实体用普通对象/数组，避免 Vue 深响应式开销（canvas 渲染不需要响应式）
let enemies: Tank[] = [];
let bullets: Bullet[] = [];
const enemyCount = ref(0);
const player: Tank = {
  x: 0,
  y: 0,
  width: 50,
  height: 60,
  hp: 3,
  speed: 3,
  direction: 0,
  lastFire: 0,
};
const showResult = ref(false);
const gameWon = ref(false);
const stars = ref(0);
const showLevelSelect = ref(false);
const paused = ref(false);
let levelSelectPaused = false;
let explosions: Explosion[] = [];
const playerHitFlash = ref(0);
let muzzleFlash: { x: number; y: number; life: number } | null = null;
let gameEnded = false;

const canvasRef = ref<HTMLCanvasElement | null>(null);
const gameCanvas = useGameCanvas();
const canvasWidth = gameCanvas.canvasWidth;
const canvasHeight = gameCanvas.canvasHeight;
const { loadStartLevel, saveProgress: saveGameProgress } = useGameProgress('tank');
const assist = useAdaptiveAssist('tank');
let ctx: CanvasRenderingContext2D | null = null;
let animationId: number | null = null;
let moveDirection = 0; // -1 left, 1 right, 0 stop
let isPressed = false;
let autoFireInterval: ReturnType<typeof setInterval> | null = null;

const tankImages = new ImageLoader();
const imagesLoaded = ref(false);

const levelConfig = ref<Record<string, any>>({
  enemyCount: 4,
  enemySpeed: 1,
  enemyFireRate: 0.3,
  bossLevel: false,
  bossHP: 11,
  playerSpeed: 3,
  autoFireInterval: 500,
  enemyBulletSpeed: 5,
  playerBulletSpeed: 8,
});

const headerItems = computed(() => [
  { label: '关卡', value: currentLevel.value },
  { label: '生命', value: '❤️'.repeat(playerHP.value) },
  { label: '敌人', value: enemyCount.value },
]);

const initGame = async () => {
  if (!imagesLoaded.value) {
    await tankImages.loadAll({
      player: tankPlayerSvg,
      enemy: tankEnemySvg,
      boss: tankBossSvg,
      bulletPlayer: bulletPlayerSvg,
      bulletEnemy: bulletEnemySvg,
      ground: groundSvg,
    });
    imagesLoaded.value = true;
  }

  await gameCanvas.whenReady();
  ctx = gameCanvas.getCtx();

  playerHP.value = 3;
  player.hp = 3;
  bullets = [];
  explosions = [];
  muzzleFlash = null;
  playerHitFlash.value = 0;
  showResult.value = false;
  gameWon.value = false;
  stars.value = 0;
  gameEnded = false;

  player.x = canvasWidth.value / 2 - player.width / 2;
  player.y = canvasHeight.value - 120;

  createEnemies();
  startGame();
};

const createEnemies = () => {
  const count = levelConfig.value.enemyCount;
  enemies = [];

  for (let i = 0; i < count; i++) {
    const isBoss = levelConfig.value.bossLevel && i === 0;
    enemies.push({
      x: (canvasWidth.value / (count + 1)) * (i + 1) - 25,
      y: 60 + Math.random() * 100,
      width: isBoss ? 70 : 50,
      height: isBoss ? 80 : 60,
      hp: isBoss ? levelConfig.value.bossHP : 1,
      speed: levelConfig.value.enemySpeed,
      direction: Math.random() > 0.5 ? 1 : -1,
      lastFire: Date.now(),
    });
  }
  enemyCount.value = enemies.length;
};

const pauseLoop = () => {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  if (autoFireInterval) {
    clearInterval(autoFireInterval);
    autoFireInterval = null;
  }
};

const resumeLoop = () => {
  if (gameEnded || animationId !== null) return;
  gameLoop();
  autoFireInterval = setInterval(() => {
    fire();
  }, levelConfig.value.autoFireInterval);
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

const gameLoop = () => {
  update();
  render();
  animationId = requestAnimationFrame(gameLoop);
};

const update = () => {
  // 更新玩家位置
  if (moveDirection !== 0) {
    player.x += moveDirection * player.speed;
    player.x = Math.max(0, Math.min(player.x, canvasWidth.value - player.width));
  }

  // 更新敌人
  enemies.forEach((enemy) => {
    // 移动
    enemy.x += enemy.speed * enemy.direction;
    if (enemy.x <= 0 || enemy.x >= canvasWidth.value - enemy.width) {
      enemy.direction *= -1;
    }

    // 随机开火
    if (Math.random() < levelConfig.value.enemyFireRate * 0.01) {
      enemyShoot(enemy);
    }
  });

  // 更新子弹
  bullets = bullets.filter((bullet) => {
    if (bullet.isPlayer) {
      bullet.y -= bullet.speed;
      // 检查击中敌人
      for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        if (
          bullet.x >= enemy.x &&
          bullet.x <= enemy.x + enemy.width &&
          bullet.y >= enemy.y &&
          bullet.y <= enemy.y + enemy.height
        ) {
          enemy.hp--;
          if (enemy.hp <= 0) {
            // 敌人被摧毁时的爆炸效果
            for (let i = 0; i < 6; i++) {
              if (explosions.length < 20) {
                explosions.push({
                  x: enemy.x + enemy.width / 2,
                  y: enemy.y + enemy.height / 2,
                  radius: 3 + Math.random() * 5,
                  alpha: 1,
                  color: ['#FF4500', '#FF6347', '#FFA500', '#FFD700'][Math.floor(Math.random() * 4)],
                });
              }
            }
            sounds.play('explosion');
            enemies.splice(i, 1);
            enemyCount.value = enemies.length;
          }
          return false;
        }
      }
    } else {
      bullet.y += bullet.speed;
      // 检查击中玩家
      if (
        bullet.x >= player.x &&
        bullet.x <= player.x + player.width &&
        bullet.y >= player.y &&
        bullet.y <= player.y + player.height
      ) {
        playerHP.value--;
        player.hp--;
        sounds.play('bounce');
        playerHitFlash.value = 10; // 被击中闪烁帧数
        if (playerHP.value <= 0) {
          endGame(false);
        }
        return false;
      }
    }

    return bullet.y > 0 && bullet.y < canvasHeight.value;
  });

  // 检查胜利
  if (enemies.length === 0) {
    endGame(true);
  }
};

const render = () => {
  if (!ctx) return;
  const c = ctx;

  c.clearRect(0, 0, canvasWidth.value, canvasHeight.value);

  // 绘制背景
  c.fillStyle = '#8B4513';
  c.fillRect(0, 0, canvasWidth.value, canvasHeight.value);

  // 绘制地面
  const groundImg = tankImages.get('ground');
  if (groundImg) {
    c.drawImage(groundImg, 0, canvasHeight.value - 60, canvasWidth.value, 60);
  }

  // 绘制敌人
  enemies.forEach((enemy) => {
    const enemyImg = tankImages.get(enemy.hp > 3 ? 'boss' : 'enemy');
    if (enemyImg) {
      c.drawImage(enemyImg, enemy.x, enemy.y, enemy.width, enemy.height);
    } else {
      // 坦克主体
      c.fillStyle = '#8B0000';
      c.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
      // 坦克炮塔
      c.fillStyle = '#A52A2A';
      c.beginPath();
      c.arc(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.width / 3, 0, Math.PI * 2);
      c.fill();
    }

    // 血条（Boss）
    if (enemy.hp > 1) {
      c.fillStyle = '#333';
      c.fillRect(enemy.x, enemy.y - 10, enemy.width, 6);
      c.fillStyle = '#FF0000';
      c.fillRect(enemy.x, enemy.y - 10, (enemy.width * enemy.hp) / levelConfig.value.bossHP, 6);
    }
  });

  // 绘制玩家
  const playerImg = tankImages.get('player');
  if (playerImg) {
    // 被击中闪烁效果
    if (playerHitFlash.value > 0) {
      ctx.globalAlpha = 0.5 + Math.sin(playerHitFlash.value * 2) * 0.5;
      playerHitFlash.value--;
    }
    ctx.drawImage(playerImg, player.x, player.y, player.width, player.height);
    ctx.globalAlpha = 1;
  } else {
    if (playerHitFlash.value > 0) {
      ctx.globalAlpha = 0.5 + Math.sin(playerHitFlash.value * 2) * 0.5;
      playerHitFlash.value--;
    }
    ctx.fillStyle = '#4169E1';
    ctx.fillRect(player.x, player.y, player.width, player.height);
    ctx.fillStyle = '#1E90FF';
    ctx.beginPath();
    ctx.arc(
      player.x + player.width / 2,
      player.y + player.height / 2,
      player.width / 3,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // 绘制子弹
  bullets.forEach((bullet) => {
    if (bullet.isPlayer) {
      const pbImg = tankImages.get('bulletPlayer');
      if (pbImg) {
        c.drawImage(pbImg, bullet.x - 10, bullet.y - 10, 20, 20);
        return;
      }
    } else {
      const ebImg = tankImages.get('bulletEnemy');
      if (ebImg) {
        c.drawImage(ebImg, bullet.x - 10, bullet.y - 10, 20, 20);
        return;
      }
    }
    c.fillStyle = bullet.isPlayer ? '#FFD700' : '#FF0000';
    c.beginPath();
    c.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2);
    c.fill();
  });

  // 绘制爆炸效果：光晕 + 放射火花
  if (explosions.length > 0) {
    explosions = explosions.filter(e => {
      e.radius += 1.5;
      e.alpha -= 0.04;
      if (e.alpha <= 0) return false;
      const glow = c.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.radius * 1.6);
      glow.addColorStop(0, e.color);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      c.globalAlpha = e.alpha;
      c.fillStyle = glow;
      c.beginPath();
      c.arc(e.x, e.y, e.radius * 1.6, 0, Math.PI * 2);
      c.fill();
      // 四向火花线
      c.strokeStyle = e.color;
      c.lineWidth = 2;
      for (let k = 0; k < 4; k++) {
        const angle = (Math.PI / 2) * k + e.radius * 0.3;
        const r1 = e.radius * 1.2;
        const r2 = e.radius * 1.9;
        c.beginPath();
        c.moveTo(e.x + Math.cos(angle) * r1, e.y + Math.sin(angle) * r1);
        c.lineTo(e.x + Math.cos(angle) * r2, e.y + Math.sin(angle) * r2);
        c.stroke();
      }
      c.globalAlpha = 1;
      return true;
    });
  }

  // 炮口火光
  if (muzzleFlash) {
    muzzleFlash.life--;
    if (muzzleFlash.life <= 0) {
      muzzleFlash = null;
    } else {
      const r = 6 + (5 - muzzleFlash.life) * 2;
      const flash = c.createRadialGradient(muzzleFlash.x, muzzleFlash.y, 0, muzzleFlash.x, muzzleFlash.y, r);
      flash.addColorStop(0, 'rgba(255,241,118,0.95)');
      flash.addColorStop(1, 'rgba(255,160,0,0)');
      c.fillStyle = flash;
      c.beginPath();
      c.arc(muzzleFlash.x, muzzleFlash.y, r, 0, Math.PI * 2);
      c.fill();
    }
  }
};

const enemyShoot = (enemy: Tank) => {
  const now = Date.now();
  if (now - enemy.lastFire < 1000) return;

  bullets.push({
    x: enemy.x + enemy.width / 2,
    y: enemy.y + enemy.height,
    speed: levelConfig.value.enemyBulletSpeed,
    isPlayer: false,
  });

  enemy.lastFire = now;
};

const fire = () => {
  if (paused.value || gameEnded) return;
  const now = Date.now();
  if (now - player.lastFire < 300) return;
  sounds.play('shoot');

  bullets.push({
    x: player.x + player.width / 2,
    y: player.y,
    speed: levelConfig.value.playerBulletSpeed,
    isPlayer: true,
  });

  // 炮口火光
  muzzleFlash = { x: player.x + player.width / 2, y: player.y - 4, life: 5 };
  player.lastFire = now;
};

const moveLeft = () => {
  if (paused.value) return;
  moveDirection = -1;
};

const moveRight = () => {
  moveDirection = 1;
};

const stopMove = () => {
  isPressed = false;
  moveDirection = 0;
};

// 画布内坐标 = 视口坐标 - 画布偏移
const getCanvasX = (e: any): number => {
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const rect = canvasRef.value?.getBoundingClientRect();
  return rect ? clientX - rect.left : clientX;
};

const startMove = (e: any) => {
  if (paused.value) return;
  isPressed = true;
  moveDirection = getCanvasX(e) < canvasWidth.value / 2 ? -1 : 1;
};

const movePlayer = (e: any) => {
  if (!isPressed) return;
  const x = getCanvasX(e);
  player.x = Math.max(0, Math.min(x - player.width / 2, canvasWidth.value - player.width));
};

const endGame = (won: boolean) => {
  if (gameEnded) return;
  gameEnded = true;

  pauseLoop();

  gameWon.value = won;

  if (won) {
    sounds.play('success');
    if (playerHP.value >= 3) {
      stars.value = 3;
    } else if (playerHP.value >= 2) {
      stars.value = 2;
    } else {
      stars.value = 1;
    }
    assist.record(true);
    saveProgress();
  } else {
    sounds.play('fail');
    assist.record(false);
  }

  showResult.value = true;
};

const saveProgress = () => {
  saveGameProgress({ level: currentLevel.value, score: currentLevel.value, stars: stars.value });
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
  const base = defaultLevelConfig('tank', level);
  levelConfig.value = {
    ...base,
    enemyCount: Math.max(2, base.enemyCount - a),
    enemyFireRate: base.enemyFireRate * (1 - 0.2 * a),
  };
  // 后台难度覆盖优先（离线/未配置时用内置公式）
  const override = await getLevelOverride('tank', level);
  if (override && currentLevel.value === level) {
    levelConfig.value = { ...levelConfig.value, ...override };
  }
  // 玩家坦克速度随配置
  player.speed = levelConfig.value.playerSpeed;
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
  // 画布尺寸变化后重新锚定玩家位置
  gameCanvas.onResize(() => {
    player.y = gameCanvas.canvasHeight.value - 120;
    player.x = Math.max(0, Math.min(player.x, gameCanvas.canvasWidth.value - player.width));
  });
  document.addEventListener('visibilitychange', handleVisibilityChange);
  document.addEventListener(GAME_PAUSE_EVENT, handleRestPause);
  document.addEventListener(GAME_RESUME_EVENT, handleRestResume);

  // 续关：从上次通关的关卡继续
  currentLevel.value = await loadStartLevel();
  await applyLevelConfig(currentLevel.value);
  initGame();
  speak('左右移动坦克，打败坏坦克');
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  document.removeEventListener(GAME_PAUSE_EVENT, handleRestPause);
  document.removeEventListener(GAME_RESUME_EVENT, handleRestResume);
  pauseLoop();
});
</script>

<style scoped>
.tank-game {
  min-height: 100vh;
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%);
  position: relative;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.tank-header {
  position: relative;
  margin: 12px 16px 0;
  background: rgba(44, 62, 80, 0.85);
  backdrop-filter: blur(12px);
  border-radius: 16px;
  padding: 14px 50px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

:deep(.tank-header .label) {
  color: rgba(255, 255, 255, 0.7);
  font-weight: 600;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.5px;
}

:deep(.tank-header .value) {
  font-size: 22px;
  color: #FFD700;
  font-weight: 700;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

:deep(.tank-header .sound-btn) {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

:deep(.tank-header .back-btn) {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.game-canvas {
  width: calc(100% - 24px);
  height: calc(100vh - 200px);
  margin: 12px auto 0;
  display: block;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  border: 3px solid rgba(255, 255, 255, 0.1);
}

.controls {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 16px;
  z-index: 10;
  padding: 12px 20px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  border-radius: 40px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.control-btn {
  width: 64px;
  height: 64px;
  background: linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.1) 100%);
  backdrop-filter: blur(8px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 2px solid rgba(255, 255, 255, 0.3);
  user-select: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.control-btn:active {
  transform: scale(0.9);
  background: linear-gradient(135deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.2) 100%);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.control-btn.fire-btn {
  background: linear-gradient(135deg, rgba(255,100,100,0.5) 0%, rgba(255,50,50,0.3) 100%);
  border-color: rgba(255, 150, 150, 0.5);
  width: 72px;
  height: 72px;
  font-size: 30px;
}

.control-btn.fire-btn:active {
  background: linear-gradient(135deg, rgba(255,120,120,0.6) 0%, rgba(255,70,70,0.4) 100%);
}

:deep(.result-content) {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 24px;
  padding: 36px;
  border: 2px solid rgba(255, 215, 0, 0.3);
  color: #fff;
}

:deep(.result-title) {
  color: #FFD700;
}

:deep(.result-info) {
  color: rgba(255, 255, 255, 0.7);
}

:deep(.btn-retry) {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

:deep(.btn-next) {
  background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
  color: #1a1a2e;
  font-weight: 700;
}

/* 响应式 */
@media (max-width: 480px) {
  .control-btn {
    width: 56px;
    height: 56px;
    font-size: 22px;
  }
  .control-btn.fire-btn {
    width: 64px;
    height: 64px;
    font-size: 26px;
  }
  .controls {
    gap: 12px;
    padding: 10px 16px;
  }
}
</style>
