import { ref, type Ref } from 'vue';
import { useGameSounds } from '@/composables/useGameSounds';
import { useGameCanvas } from '@/composables/useGameCanvas';
import { useGameProgress } from '@/composables/useGameProgress';
import { useAdaptiveAssist } from '@/composables/useAdaptiveAssist';
import { GAME_PAUSE_EVENT, GAME_RESUME_EVENT } from '@/utils/gameEvents';
import { getLevelOverride } from '@/api/game';
import { playVoice } from '@/utils/voice';
import { defaultLevelConfig } from '@/utils/levelDefaults';
import { ImageLoader } from '@/utils/imageLoader';
import tankPlayerSvg from '@/static/images/games/tank/tank-player.svg';
import tankEnemySvg from '@/static/images/games/tank/tank-enemy.svg';
import tankBossSvg from '@/static/images/games/tank/tank-boss.svg';
import bulletPlayerSvg from '@/static/images/games/tank/bullet-player.svg';
import bulletEnemySvg from '@/static/images/games/tank/bullet-enemy.svg';
import groundSvg from '@/static/images/games/tank/ground.svg';

// ── 实体类型 ──
export interface Tank {
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  speed: number;
  direction: number;
  lastFire: number;
}

export interface Bullet {
  x: number;
  y: number;
  speed: number;
  isPlayer: boolean;
}

export interface Explosion {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  color: string;
}

export interface TankLevelConfig {
  enemyCount: number;
  enemySpeed: number;
  enemyFireRate: number;
  bossLevel: boolean;
  bossHP: number;
  playerSpeed: number;
  autoFireInterval: number;
  enemyBulletSpeed: number;
  playerBulletSpeed: number;
}

export function useTankEngine() {
  const sounds = useGameSounds();
  const gameCanvas = useGameCanvas();
  const canvasWidth = gameCanvas.canvasWidth;
  const canvasHeight = gameCanvas.canvasHeight;
  const { loadStartLevel, saveProgress: saveGameProgress, recordPlay } = useGameProgress('tank');
  const assist = useAdaptiveAssist('tank');

  // ── 响应式状态（UI 使用）──
  const currentLevel = ref(1);
  const playerHP = ref(3);
  const enemyCount = ref(0);
  const showResult = ref(false);
  const gameWon = ref(false);
  const stars = ref(0);
  const showLevelSelect = ref(false);
  const paused = ref(false);
  const playerHitFlash = ref(0);
  const imagesLoaded = ref(false);

  // ── 非响应式实体（高频读写，canvas 不需要响应式）──
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
  let enemies: Tank[] = [];
  let bullets: Bullet[] = [];
  let explosions: Explosion[] = [];
  let muzzleFlash: { x: number; y: number; life: number } | null = null;
  let gameEnded = false;
  let levelSelectPaused = false;
  let ctx: CanvasRenderingContext2D | null = null;
  let animationId: number | null = null;
  let moveDirection = 0;
  let isPressed = false;
  let autoFireInterval: ReturnType<typeof setInterval> | null = null;
  let boundCanvas: HTMLCanvasElement | null = null;

  const tankImages = new ImageLoader();

  const levelConfig = ref<TankLevelConfig>({
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

  // ── 图片加载 ──
  const loadImages = async () => {
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
  };

  const bindCanvas = (canvasEl: HTMLCanvasElement | null) => {
    boundCanvas = canvasEl;
    gameCanvas.bind(canvasEl);
  };

  const onCanvasResize = (cb: () => void) => {
    gameCanvas.onResize(cb);
  };

  // ── 游戏初始化 ──
  const initGame = async () => {
    await loadImages();
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
    resumeLoop();
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

  // ── 游戏循环控制 ──
  const stopAutoFire = () => {
    if (autoFireInterval) {
      clearInterval(autoFireInterval);
      autoFireInterval = null;
    }
  };

  const pauseLoop = () => {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    stopAutoFire();
  };

  const startAutoFire = () => {
    stopAutoFire();
    autoFireInterval = setInterval(() => {
      fire();
    }, levelConfig.value.autoFireInterval);
  };

  const resumeLoop = () => {
    if (gameEnded || animationId !== null) return;
    gameLoop();
    startAutoFire();
  };

  const gameLoop = () => {
    update();
    render();
    if (!gameEnded && !paused.value && autoFireInterval === null) {
      startAutoFire();
    }
    animationId = requestAnimationFrame(gameLoop);
  };

  // ── 游戏逻辑 ──
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
    muzzleFlash = { x: player.x + player.width / 2, y: player.y - 4, life: 5 };
    player.lastFire = now;
  };

  const update = () => {
    if (moveDirection !== 0) {
      player.x += moveDirection * player.speed;
      player.x = Math.max(0, Math.min(player.x, canvasWidth.value - player.width));
    }

    enemies.forEach((enemy) => {
      enemy.x += enemy.speed * enemy.direction;
      if (enemy.x <= 0 || enemy.x >= canvasWidth.value - enemy.width) {
        enemy.direction *= -1;
      }
      if (Math.random() < levelConfig.value.enemyFireRate * 0.01) {
        enemyShoot(enemy);
      }
    });

    bullets = bullets.filter((bullet) => {
      if (bullet.isPlayer) {
        bullet.y -= bullet.speed;
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
              for (let j = 0; j < 6; j++) {
                if (explosions.length < 20) {
                  explosions.push({
                    x: enemy.x + enemy.width / 2,
                    y: enemy.y + enemy.height / 2,
                    radius: 3 + Math.random() * 5,
                    alpha: 1,
                    color: ['#FF4500', '#FF6347', '#FFA500', '#FFD700'][
                      Math.floor(Math.random() * 4)
                    ],
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
        if (
          bullet.x >= player.x &&
          bullet.x <= player.x + player.width &&
          bullet.y >= player.y &&
          bullet.y <= player.y + player.height
        ) {
          playerHP.value--;
          player.hp--;
          sounds.play('bounce');
          playerHitFlash.value = 10;
          if (playerHP.value <= 0) {
            endGame(false);
          }
          return false;
        }
      }
      return bullet.y > 0 && bullet.y < canvasHeight.value;
    });

    if (enemies.length === 0) {
      endGame(true);
    }
  };

  // ── 渲染 ──
  const render = () => {
    if (!ctx) return;
    const c = ctx;

    c.clearRect(0, 0, canvasWidth.value, canvasHeight.value);

    c.fillStyle = '#8B4513';
    c.fillRect(0, 0, canvasWidth.value, canvasHeight.value);

    const groundImg = tankImages.get('ground');
    if (groundImg) {
      c.drawImage(groundImg, 0, canvasHeight.value - 60, canvasWidth.value, 60);
    }

    enemies.forEach((enemy) => {
      const enemyImg = tankImages.get(enemy.hp > 3 ? 'boss' : 'enemy');
      if (enemyImg) {
        c.drawImage(enemyImg, enemy.x, enemy.y, enemy.width, enemy.height);
      } else {
        c.fillStyle = '#8B0000';
        c.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
        c.fillStyle = '#A52A2A';
        c.beginPath();
        c.arc(
          enemy.x + enemy.width / 2,
          enemy.y + enemy.height / 2,
          enemy.width / 3,
          0,
          Math.PI * 2
        );
        c.fill();
      }
      if (enemy.hp > 1) {
        c.fillStyle = '#333';
        c.fillRect(enemy.x, enemy.y - 10, enemy.width, 6);
        c.fillStyle = '#FF0000';
        c.fillRect(enemy.x, enemy.y - 10, (enemy.width * enemy.hp) / levelConfig.value.bossHP, 6);
      }
    });

    const playerImg = tankImages.get('player');
    if (playerImg) {
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

    if (explosions.length > 0) {
      explosions = explosions.filter((e) => {
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

    if (muzzleFlash) {
      muzzleFlash.life--;
      if (muzzleFlash.life <= 0) {
        muzzleFlash = null;
      } else {
        const r = 6 + (5 - muzzleFlash.life) * 2;
        const flash = c.createRadialGradient(
          muzzleFlash.x,
          muzzleFlash.y,
          0,
          muzzleFlash.x,
          muzzleFlash.y,
          r
        );
        flash.addColorStop(0, 'rgba(255,241,118,0.95)');
        flash.addColorStop(1, 'rgba(255,160,0,0)');
        c.fillStyle = flash;
        c.beginPath();
        c.arc(muzzleFlash.x, muzzleFlash.y, r, 0, Math.PI * 2);
        c.fill();
      }
    }
  };

  // ── 游戏结束 ──
  const endGame = (won: boolean) => {
    if (gameEnded) return;
    gameEnded = true;
    pauseLoop();
    gameWon.value = won;
    if (won) {
      sounds.play('success');
      if (playerHP.value >= 3) stars.value = 3;
      else if (playerHP.value >= 2) stars.value = 2;
      else stars.value = 1;
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
    saveGameProgress({ level: currentLevel.value, score: currentLevel.value, stars: stars.value });
  };

  // ── 控制 ──
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

  const getCanvasX = (e: MouseEvent | TouchEvent): number => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const rect = boundCanvas?.getBoundingClientRect();
    return rect ? clientX - rect.left : clientX;
  };

  const startMove = (e: MouseEvent | TouchEvent) => {
    if (paused.value) return;
    isPressed = true;
    moveDirection = getCanvasX(e) < canvasWidth.value / 2 ? -1 : 1;
  };

  const movePlayer = (e: MouseEvent | TouchEvent) => {
    if (!isPressed) return;
    const x = getCanvasX(e);
    player.x = Math.max(0, Math.min(x - player.width / 2, canvasWidth.value - player.width));
  };

  // ── 暂停 / 恢复 ──
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

  // ── 事件监听 ──
  const handleVisibilityChange = () => {
    if (document.hidden) pauseLoop();
    else resumeLoop();
  };

  const handleRestPause = () => {
    if (!gameEnded) pauseLoop();
  };

  const handleRestResume = () => {
    if (!paused.value) resumeLoop();
  };

  const addEventListeners = () => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener(GAME_PAUSE_EVENT, handleRestPause);
    document.addEventListener(GAME_RESUME_EVENT, handleRestResume);
  };

  const removeEventListeners = () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    document.removeEventListener(GAME_PAUSE_EVENT, handleRestPause);
    document.removeEventListener(GAME_RESUME_EVENT, handleRestResume);
  };

  // ── 选关 ──
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

  const applyLevelConfig = async (level: number) => {
    const a = assist.level();
    const base = defaultLevelConfig('tank', level);
    levelConfig.value = {
      ...base,
      enemyCount: Math.max(2, base.enemyCount - a),
      enemyFireRate: base.enemyFireRate * (1 - 0.2 * a),
    };
    const override = await getLevelOverride('tank', level);
    if (override && currentLevel.value === level) {
      levelConfig.value = { ...levelConfig.value, ...override };
    }
    player.speed = levelConfig.value.playerSpeed;
  };

  const chooseLevel = async (level: number) => {
    levelSelectPaused = false;
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

  const restartGame = () => {
    initGame();
  };

  // ── 生命周期 ──
  const onMountedSetup = async (canvasEl: HTMLCanvasElement | null) => {
    sounds.init();
    gameCanvas.bind(canvasEl);
    bindCanvas(canvasEl); // 记录画布引用，触摸坐标换算需要 getBoundingClientRect 偏移
    gameCanvas.onResize(() => {
      player.y = gameCanvas.canvasHeight.value - 120;
      player.x = Math.max(0, Math.min(player.x, gameCanvas.canvasWidth.value - player.width));
    });
    addEventListeners();
    currentLevel.value = await loadStartLevel();
    await applyLevelConfig(currentLevel.value);
    initGame();
    playVoice('tank_intro', '左右移动坦克，打败坏坦克');
  };

  const onUnmountedCleanup = () => {
    removeEventListeners();
    pauseLoop();
  };

  return {
    // UI 状态
    currentLevel,
    playerHP,
    enemyCount,
    showResult,
    gameWon,
    stars,
    showLevelSelect,
    paused,
    playerHitFlash,
    imagesLoaded,
    levelConfig,
    // 方法
    initGame,
    fire,
    moveLeft,
    moveRight,
    stopMove,
    startMove,
    movePlayer,
    pauseGame,
    resumeGame,
    openLevelSelect,
    closeLevelSelect,
    chooseLevel,
    nextLevel,
    restartGame,
    // 生命周期
    onMountedSetup,
    onUnmountedCleanup,
    // 画布
    canvasWidth,
    canvasHeight,
    bindCanvas,
    // 声音
    sounds,
  };
}
