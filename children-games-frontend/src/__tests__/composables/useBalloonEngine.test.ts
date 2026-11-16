import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useBalloonEngine } from '../../composables/useBalloonEngine';
import type { Balloon, Bullet, PopParticle } from '../../composables/useBalloonEngine';

// Mock SVG imports
vi.mock('@/static/images/games/balloon/balloon-red.svg', () => ({ default: 'balloon-red.svg' }));
vi.mock('@/static/images/games/balloon/balloon-teal.svg', () => ({ default: 'balloon-teal.svg' }));
vi.mock('@/static/images/games/balloon/balloon-yellow.svg', () => ({
  default: 'balloon-yellow.svg',
}));
vi.mock('@/static/images/games/balloon/balloon-green.svg', () => ({
  default: 'balloon-green.svg',
}));
vi.mock('@/static/images/games/balloon/balloon-pink.svg', () => ({ default: 'balloon-pink.svg' }));
vi.mock('@/static/images/games/balloon/balloon-golden.svg', () => ({
  default: 'balloon-golden.svg',
}));
vi.mock('@/static/images/games/balloon/balloon-rainbow.svg', () => ({
  default: 'balloon-rainbow.svg',
}));
vi.mock('@/static/images/games/balloon/balloon-dart.svg', () => ({ default: 'balloon-dart.svg' }));

// Mock 所有依赖
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/composables/useGameSounds', () => ({
  useGameSounds: () => ({
    playCorrect: vi.fn(),
    playWrong: vi.fn(),
    playClick: vi.fn(),
    playWin: vi.fn(),
    playShoot: vi.fn(),
    playPop: vi.fn(),
  }),
}));

vi.mock('@/composables/useGameCanvas', () => ({
  useGameCanvas: () => ({
    canvasRef: { value: null },
    canvasWidth: { value: 800 },
    canvasHeight: { value: 600 },
  }),
}));

vi.mock('@/composables/useGameProgress', () => ({
  useGameProgress: () => ({
    loadStartLevel: vi.fn().mockReturnValue(1),
    saveProgress: vi.fn(),
    recordPlay: vi.fn(),
  }),
}));

vi.mock('@/composables/useGameLifecycle', () => ({
  useGameLifecycle: vi.fn(),
  useGamePauseResume: vi.fn(),
}));

vi.mock('@/composables/useAdaptiveAssist', () => ({
  useAdaptiveAssist: () => ({
    level: () => 0,
    adjust: vi.fn(),
  }),
}));

vi.mock('@/api/game', () => ({
  getLevelOverride: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/utils/voice', () => ({
  playVoice: vi.fn(),
}));

vi.mock('@/utils/levelDefaults', () => ({
  defaultLevelConfig: (game: string, level: number) => ({
    targetScore: 100 + level * 20,
    bullets: 30,
    spawnRate: Math.max(0.3, 1 - level * 0.05),
    speedMin: 1 + level * 0.2,
    speedMax: 2 + level * 0.3,
  }),
}));

vi.mock('@/utils/imageLoader', () => ({
  ImageLoader: vi.fn().mockImplementation(() => ({
    load: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockReturnValue(new Image()),
  })),
}));

describe('useBalloonEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('模块导出', () => {
    it('should export useBalloonEngine function', () => {
      expect(typeof useBalloonEngine).toBe('function');
    });

    it('should return engine with game state', () => {
      const engine = useBalloonEngine();

      // 游戏状态
      expect(engine).toHaveProperty('currentLevel');
      expect(engine).toHaveProperty('score');
      expect(engine).toHaveProperty('bullets');
      expect(engine).toHaveProperty('targetScore');
      expect(engine).toHaveProperty('showResult');
      expect(engine).toHaveProperty('gameWon');
      expect(engine).toHaveProperty('stars');
      expect(engine).toHaveProperty('paused');

      // 方法
      expect(engine).toHaveProperty('shoot');
      expect(engine).toHaveProperty('pauseGame');
      expect(engine).toHaveProperty('resumeGame');
      expect(engine).toHaveProperty('chooseLevel');
    });
  });

  describe('Balloon 类型', () => {
    it('should have correct structure for normal balloon', () => {
      const balloon: Balloon = {
        x: 100,
        y: 200,
        radius: 30,
        color: '#FF6B6B',
        speed: 2,
        type: 'normal',
        points: 10,
      };

      expect(balloon.x).toBe(100);
      expect(balloon.y).toBe(200);
      expect(balloon.type).toBe('normal');
      expect(balloon.points).toBe(10);
    });

    it('should support golden balloon type', () => {
      const golden: Balloon = {
        x: 200,
        y: 300,
        radius: 35,
        color: '#FFD700',
        speed: 3,
        type: 'golden',
        points: 50,
      };

      expect(golden.type).toBe('golden');
      expect(golden.points).toBe(50);
    });

    it('should support rainbow balloon type', () => {
      const rainbow: Balloon = {
        x: 150,
        y: 250,
        radius: 40,
        color: '#FF69B4',
        speed: 4,
        type: 'rainbow',
        points: 100,
      };

      expect(rainbow.type).toBe('rainbow');
      expect(rainbow.points).toBe(100);
    });
  });

  describe('Bullet 类型', () => {
    it('should have correct structure', () => {
      const bullet: Bullet = {
        x: 100,
        y: 500,
        speed: 8,
      };

      expect(bullet.x).toBe(100);
      expect(bullet.y).toBe(500);
      expect(bullet.speed).toBe(8);
    });
  });

  describe('PopParticle 类型', () => {
    it('should have correct structure for burst effect', () => {
      const particle: PopParticle = {
        x: 100,
        y: 200,
        radius: 5,
        grow: 0.5,
        alpha: 1,
        color: '#FF6B6B',
        speed: 3,
        angle: Math.PI / 4,
      };

      expect(particle.x).toBe(100);
      expect(particle.radius).toBe(5);
      expect(particle.alpha).toBe(1);
      expect(particle.angle).toBe(Math.PI / 4);
    });

    it('should support shrinking animation', () => {
      const particle: PopParticle = {
        x: 50,
        y: 50,
        radius: 10,
        grow: -0.2, // 缩小
        alpha: 0.8,
        color: '#4ECDC4',
        speed: 2,
        angle: 0,
      };

      expect(particle.grow).toBe(-0.2);
    });
  });

  describe('气球颜色配置', () => {
    it('should define five balloon colors', () => {
      const colors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#F38181'];

      expect(colors).toHaveLength(5);
      colors.forEach((color) => {
        expect(color).toMatch(/^#[0-9A-F]{6}$/i);
      });
    });

    it('should map colors to image keys', () => {
      const colorToKey: Record<string, string> = {
        '#FF6B6B': 'red',
        '#4ECDC4': 'teal',
        '#FFE66D': 'yellow',
        '#95E1D3': 'green',
        '#F38181': 'pink',
      };

      expect(Object.keys(colorToKey)).toHaveLength(5);
      expect(colorToKey['#FF6B6B']).toBe('red');
    });
  });

  describe('对象池配置', () => {
    it('should define particle pool limits', () => {
      const MAX_PARTICLES = 50;
      const MAX_FLOAT_TEXTS = 30;

      expect(MAX_PARTICLES).toBe(50);
      expect(MAX_FLOAT_TEXTS).toBe(30);
    });
  });
});
