import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useGameSounds } from '@/composables/useGameSounds';
import { useGameCanvas } from '@/composables/useGameCanvas';
import { useGameProgress } from '@/composables/useGameProgress';
import { useGameLifecycle } from '@/composables/useGameLifecycle';
import { useAdaptiveAssist } from '@/composables/useAdaptiveAssist';
import { getLevelOverride } from '@/api/game';
import { playVoice } from '@/utils/voice';
import { defaultLevelConfig } from '@/utils/levelDefaults';
import { ImageLoader } from '@/utils/imageLoader';
import balloonRedSvg from '@/static/images/games/balloon/balloon-red.svg';
import balloonTealSvg from '@/static/images/games/balloon/balloon-teal.svg';
import balloonYellowSvg from '@/static/images/games/balloon/balloon-yellow.svg';
import balloonGreenSvg from '@/static/images/games/balloon/balloon-green.svg';
import balloonPinkSvg from '@/static/images/games/balloon/balloon-pink.svg';
import balloonGoldenSvg from '@/static/images/games/balloon/balloon-golden.svg';
import balloonRainbowSvg from '@/static/images/games/balloon/balloon-rainbow.svg';
import balloonDartSvg from '@/static/images/games/balloon/balloon-dart.svg';

// Color to image key mapping
const colorToKey: Record<string, string> = {
  '#FF6B6B': 'red',
  '#4ECDC4': 'teal',
  '#FFE66D': 'yellow',
  '#95E1D3': 'green',
  '#F38181': 'pink',
};

export interface Balloon {
  x: number;
  y: number;
  radius: number;
  color: string;
  speed: number;
  type: 'normal' | 'golden' | 'rainbow';
  points: number;
}

export interface Bullet {
  x: number;
  y: number;
  speed: number;
}

export interface PopParticle {
  x: number;
  y: number;
  radius: number; // 当前尺寸
  grow: number; // 每帧尺寸增量（闪光用，纸屑为 0）
  alpha: number;
  color: string;
  speed: number; // 飞散速度
  angle: number; // 飞散方向
}

const balloonColors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#F38181'];

export function useBalloonEngine() {
  const router = useRouter();
  const sounds = useGameSounds();
  const gameCanvas = useGameCanvas();
  const canvasWidth = gameCanvas.canvasWidth;
  const canvasHeight = gameCanvas.canvasHeight;
  const { loadStartLevel, saveProgress: saveGameProgress, recordPlay } = useGameProgress('balloon');
  const assist = useAdaptiveAssist('balloon');

  const balloonImages = new ImageLoader();
  const imagesLoaded = ref(false);

  // ── 响应式状态 ──
  const currentLevel = ref(1);
  const score = ref(0);
  const bullets = ref(30);
  const targetScore = ref(100);
  const showResult = ref(false);
  const gameWon = ref(false);
  const stars = ref(0);
  const showLevelSelect = ref(false);
  const paused = ref(false);

  // ── 非响应式状态 ──
  let canvasRef: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let animationId: number | null = null;
  let balloonList: Balloon[] = [];
  let bulletList: Bullet[] = [];
  let popParticles: PopParticle[] = [];
  let spawnTimer: ReturnType<typeof setInterval> | null = null;
  let shakeOffset = { x: 0, y: 0 };
  let bgGradient: CanvasGradient | null = null;
  let floatTexts: { x: number; y: number; text: string; life: number; color: string }[] = [];
  let gameEnded = false;
  let levelSelectPaused = false;

  const levelConfig = ref<Record<string, any>>({
    spawnRate: 1200,
    moveSpeed: 1,
    targetScore: 100,
    bullets: 30,
    rainbowChance: 0.05,
    goldenChance: 0.1,
  });

  // ── Computed ──
  const headerItems = computed(() => [
    { label: '关卡', value: currentLevel.value },
    { label: '分数', value: `${score.value}/${targetScore.value}` },
    { label: '子弹', value: bullets.value },
  ]);

  // ── 图片加载 ──
  const loadImages = async () => {
    if (!imagesLoaded.value) {
      await balloonImages.loadAll({
        red: balloonRedSvg,
        teal: balloonTealSvg,
        yellow: balloonYellowSvg,
        green: balloonGreenSvg,
        pink: balloonPinkSvg,
        golden: balloonGoldenSvg,
        rainbow: balloonRainbowSvg,
        dart: balloonDartSvg,
      });
      imagesLoaded.value = true;
    }
  };

  // ── 游戏循环控制 ──
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

  const spawnBalloon = () => {
    const random = Math.random();
    let type: 'normal' | 'golden' | 'rainbow' = 'normal';
    let points = 10;
    let color = balloonColors[Math.floor(Math.random() * balloonColors.length)];

    // 特殊气球概率可由后台配置
    const rainbowChance = levelConfig.value.rainbowChance;
    const goldenChance = levelConfig.value.goldenChance;
    if (random < rainbowChance) {
      type = 'rainbow';
      points = 50;
      color = '#FF00FF';
    } else if (random < rainbowChance + goldenChance) {
      type = 'golden';
      points = 25;
      color = '#FFD700';
    }

    const balloon: Balloon = {
      x: Math.random() * (canvasWidth.value - 80) + 40,
      y: canvasHeight.value + 40,
      radius: 35,
      color,
      speed: levelConfig.value.moveSpeed + Math.random() * 0.5,
      type,
      points,
    };
    balloonList.push(balloon);
  };

  const resumeLoop = () => {
    if (gameEnded || animationId !== null) return;
    spawnTimer = setInterval(spawnBalloon, levelConfig.value.spawnRate);
    gameLoop();
  };

  const startGame = () => resumeLoop();

  // ── 游戏初始化 ──
  const initGame = async () => {
    score.value = 0;
    bullets.value = levelConfig.value.bullets;
    targetScore.value = levelConfig.value.targetScore;
    balloonList = [];
    bulletList = [];
    popParticles = [];
    floatTexts = [];
    showResult.value = false;
    gameWon.value = false;
    stars.value = 0;
    bgGradient = null;
    gameEnded = false;

    await loadImages();
    await gameCanvas.whenReady();
    ctx = gameCanvas.getCtx();
    startGame();
  };

  // ── 手动暂停 ──
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

  // ── 游戏循环 ──
  const gameLoop = () => {
    update();
    render();
    animationId = requestAnimationFrame(gameLoop);
  };

  const update = () => {
    // 更新气球位置
    balloonList = balloonList.filter((balloon) => {
      balloon.y -= balloon.speed;
      return balloon.y > -balloon.radius * 2;
    });

    // 更新子弹位置
    bulletList = bulletList.filter((bullet) => {
      bullet.y -= bullet.speed;

      // 检查碰撞
      for (let i = balloonList.length - 1; i >= 0; i--) {
        const balloon = balloonList[i];
        const dx = bullet.x - balloon.x;
        const dy = bullet.y - balloon.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < balloon.radius) {
          score.value += balloon.points;

          // 爆裂效果：白色闪光 + 彩色纸屑飞散
          popParticles.push({
            x: balloon.x,
            y: balloon.y,
            radius: 8,
            grow: 2.4,
            alpha: 0.85,
            color: '#FFFFFF',
            speed: 0,
            angle: 0,
          });
          for (let i = 0; i < 8; i++) {
            if (popParticles.length < 26) {
              popParticles.push({
                x: balloon.x,
                y: balloon.y,
                radius: 2 + Math.random() * 1.5,
                grow: 0,
                alpha: 1,
                color:
                  balloon.type === 'rainbow'
                    ? ['#FF6B6B', '#4ECDC4', '#FFE66D', '#F38181'][Math.floor(Math.random() * 4)]
                    : balloon.color,
                speed: 1.5 + Math.random() * 2,
                angle: Math.random() * Math.PI * 2,
              });
            }
          }
          floatTexts.push({
            x: balloon.x,
            y: balloon.y - 10,
            text: `+${balloon.points}`,
            life: 1,
            color: balloon.type === 'golden' ? '#FF8F00' : '#FFFFFF',
          });

          balloonList.splice(i, 1);

          // 彩虹气球特效：消除所有气球并触发屏幕震动
          if (balloon.type === 'rainbow') {
            sounds.play('explosion');
            const bonus = balloonList.length * 10;
            score.value += bonus;
            floatTexts.push({
              x: balloon.x,
              y: balloon.y - 34,
              text: `+${bonus}!`,
              life: 1.4,
              color: '#E91E63',
            });
            balloonList = [];
            shakeOffset = { x: (Math.random() - 0.5) * 10, y: (Math.random() - 0.5) * 10 };
          } else {
            sounds.play('pop');
          }

          if (score.value >= targetScore.value) {
            endGame(true);
          }
          return false;
        }
      }

      return bullet.y > 0;
    });

    // 检查是否用完子弹
    if (bullets.value <= 0 && bulletList.length === 0) {
      endGame(false);
    }
  };

  const render = () => {
    if (!ctx) return;
    const c = ctx;

    // 衰减屏幕震动
    shakeOffset.x *= 0.9;
    shakeOffset.y *= 0.9;

    c.save();
    c.translate(shakeOffset.x, shakeOffset.y);

    c.clearRect(0, 0, canvasWidth.value, canvasHeight.value);

    // 绘制背景（渐变按当前画布尺寸惰性缓存）
    if (!bgGradient) {
      bgGradient = c.createLinearGradient(0, 0, 0, canvasHeight.value);
      bgGradient.addColorStop(0, '#87CEEB');
      bgGradient.addColorStop(1, '#E0F7FA');
    }
    c.fillStyle = bgGradient;
    c.fillRect(0, 0, canvasWidth.value, canvasHeight.value);

    // 绘制气球
    balloonList.forEach((balloon) => {
      let key: string;
      if (balloon.type === 'golden') key = 'golden';
      else if (balloon.type === 'rainbow') key = 'rainbow';
      else key = colorToKey[balloon.color] || 'red';

      const img = balloonImages.get(key);
      if (img) {
        const s = balloon.radius * 2;
        c.drawImage(img, balloon.x - s / 2, balloon.y - s / 2, s, s);
      } else {
        // Fallback: draw circle
        c.beginPath();
        c.arc(balloon.x, balloon.y, balloon.radius, 0, Math.PI * 2);
        c.fillStyle = balloon.color;
        c.fill();
      }
    });

    // 绘制子弹（小飞镖，兜底圆点）
    const dart = balloonImages.get('dart');
    bulletList.forEach((bullet) => {
      if (dart) {
        c.drawImage(dart, bullet.x - 8, bullet.y - 10, 16, 20);
      } else {
        c.fillStyle = '#333';
        c.beginPath();
        c.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2);
        c.fill();
      }
    });

    // 绘制爆裂效果：闪光 + 纸屑（带重力飞散）
    if (popParticles.length > 0) {
      popParticles = popParticles.filter((p) => {
        p.x += Math.cos(p.angle) * p.speed;
        p.y += Math.sin(p.angle) * p.speed + 0.12;
        p.radius += p.grow;
        p.alpha -= p.grow > 0 ? 0.08 : 0.045;
        if (p.alpha <= 0) return false;
        c.globalAlpha = p.alpha;
        c.fillStyle = p.color;
        c.beginPath();
        c.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = 1;
        return true;
      });
    }

    // 飘分数字
    if (floatTexts.length > 0) {
      floatTexts = floatTexts.filter((t) => {
        t.y -= 1.3;
        t.life -= 0.03;
        if (t.life <= 0) return false;
        c.globalAlpha = Math.min(1, t.life * 1.4);
        c.font = 'bold 18px sans-serif';
        c.textAlign = 'center';
        c.lineWidth = 4;
        c.strokeStyle = 'rgba(44, 62, 80, 0.8)';
        c.strokeText(t.text, t.x, t.y);
        c.fillStyle = t.color;
        c.fillText(t.text, t.x, t.y);
        c.globalAlpha = 1;
        return true;
      });
    }

    c.restore();
  };

  // ── 射击 ──
  const shoot = (e: MouseEvent | TouchEvent) => {
    if (paused.value || bullets.value <= 0) return;
    sounds.play('shoot');

    // 画布内坐标 = 视口坐标 - 画布偏移
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const rect = canvasRef?.getBoundingClientRect();
    const x = rect ? clientX - rect.left : clientX;

    bulletList.push({
      x: Math.max(0, Math.min(x, canvasWidth.value)),
      y: canvasHeight.value - 50,
      speed: 10,
    });

    bullets.value--;
  };

  // ── 游戏结束 ──
  const endGame = (won: boolean) => {
    if (gameEnded) return;
    gameEnded = true;

    pauseLoop();

    gameWon.value = won;

    if (won) {
      sounds.play('success');
      const ratio = score.value / targetScore.value;
      if (ratio >= 1.5 && bullets.value > 10) {
        stars.value = 3;
      } else if (ratio >= 1.2) {
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

  const chooseLevel = async (level: number) => {
    levelSelectPaused = false;
    showLevelSelect.value = false;
    currentLevel.value = level;
    await applyLevelConfig(level);
    initGame();
  };

  const applyLevelConfig = async (level: number) => {
    const a = assist.level();
    const base = defaultLevelConfig('balloon', level);
    levelConfig.value = {
      ...base,
      targetScore: Math.round(base.targetScore * (1 - 0.15 * a)),
      bullets: base.bullets + 5 * a,
    };
    // 后台难度覆盖优先（离线/未配置时用内置公式）
    const override = await getLevelOverride('balloon', level);
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

  // ── 生命周期 ──
  const handlePause = () => {
    pauseLoop();
  };

  const handleResume = () => {
    if (!paused.value) resumeLoop();
  };

  useGameLifecycle({ onPause: handlePause, onResume: handleResume });

  const onMountedSetup = async (canvasEl: HTMLCanvasElement | null) => {
    canvasRef = canvasEl;
    sounds.init();
    gameCanvas.bind(canvasEl);
    // 画布尺寸变化后重建背景渐变
    gameCanvas.onResize(() => {
      bgGradient = null;
    });

    // 续关：从上次通关的关卡继续
    currentLevel.value = await loadStartLevel();
    await applyLevelConfig(currentLevel.value);
    initGame();
    playVoice('balloon_intro', '点一点屏幕，把气球打爆吧');
  };

  const onUnmountedCleanup = () => {
    pauseLoop();
  };

  return {
    // 状态
    currentLevel,
    score,
    bullets,
    targetScore,
    showResult,
    gameWon,
    stars,
    showLevelSelect,
    paused,

    // Computed
    headerItems,

    // 方法
    shoot,
    pauseGame,
    resumeGame,
    quitGame,
    openLevelSelect,
    closeLevelSelect,
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
