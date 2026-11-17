import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTankEngine } from '../../composables/useTankEngine';
import type { Tank, Bullet, Explosion, TankLevelConfig } from '../../composables/useTankEngine';

// Mock SVG imports
vi.mock('@/static/images/games/tank/tank-player.svg', () => ({ default: 'tank-player.svg' }));
vi.mock('@/static/images/games/tank/tank-enemy.svg', () => ({ default: 'tank-enemy.svg' }));
vi.mock('@/static/images/games/tank/tank-boss.svg', () => ({ default: 'tank-boss.svg' }));
vi.mock('@/static/images/games/tank/bullet-player.svg', () => ({ default: 'bullet-player.svg' }));
vi.mock('@/static/images/games/tank/bullet-enemy.svg', () => ({ default: 'bullet-enemy.svg' }));
vi.mock('@/static/images/games/tank/ground.svg', () => ({ default: 'ground.svg' }));

// Mock 所有依赖
vi.mock('@/composables/useGameSounds', () => ({
  useGameSounds: () => ({
    playCorrect: vi.fn(),
    playWrong: vi.fn(),
    playClick: vi.fn(),
    playWin: vi.fn(),
    playShoot: vi.fn(),
    playExplosion: vi.fn(),
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

vi.mock('@/composables/useAdaptiveAssist', () => ({
  useAdaptiveAssist: () => ({
    level: () => 0,
    adjust: vi.fn(),
  }),
}));

vi.mock('@/utils/gameEvents', () => ({
  GAME_PAUSE_EVENT: 'game:pause',
  GAME_RESUME_EVENT: 'game:resume',
}));

vi.mock('@/api/game', () => ({
  getLevelOverride: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/utils/voice', () => ({
  playVoice: vi.fn(),
}));

vi.mock('@/utils/levelDefaults', () => ({
  defaultLevelConfig: (game: string, level: number): TankLevelConfig => ({
    enemyCount: 3 + level,
    enemySpeed: 1 + level * 0.2,
    enemyFireRate: 0.02,
    bossLevel: level % 5 === 0,
    bossHP: 10 + level * 2,
    playerSpeed: 3,
    autoFireInterval: 300,
    enemyBulletSpeed: 4,
    playerBulletSpeed: 6,
  }),
}));

vi.mock('@/utils/imageLoader', () => ({
  ImageLoader: vi.fn().mockImplementation(() => ({
    load: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockReturnValue(new Image()),
  })),
}));

describe('useTankEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('模块导出', () => {
    it('should export useTankEngine function', () => {
      expect(typeof useTankEngine).toBe('function');
    });

    it('should return engine with game state', () => {
      const engine = useTankEngine();

      // 游戏状态
      expect(engine).toHaveProperty('currentLevel');
      expect(engine).toHaveProperty('playerHP');
      expect(engine).toHaveProperty('enemyCount');
      expect(engine).toHaveProperty('showResult');
      expect(engine).toHaveProperty('gameWon');
      expect(engine).toHaveProperty('stars');
      expect(engine).toHaveProperty('paused');
      expect(engine).toHaveProperty('playerHitFlash');
      expect(engine).toHaveProperty('imagesLoaded');

      // 方法
      expect(engine).toHaveProperty('initGame');
      expect(engine).toHaveProperty('fire');
      expect(engine).toHaveProperty('moveLeft');
      expect(engine).toHaveProperty('moveRight');
      expect(engine).toHaveProperty('pauseGame');
      expect(engine).toHaveProperty('resumeGame');
    });
  });

  describe('Tank 类型', () => {
    it('should have correct structure', () => {
      const tank: Tank = {
        x: 100,
        y: 100,
        width: 40,
        height: 40,
        hp: 3,
        speed: 3,
        direction: 0,
        lastFire: 0,
      };

      expect(tank.x).toBe(100);
      expect(tank.hp).toBe(3);
      expect(tank.direction).toBe(0);
    });
  });

  describe('Bullet 类型', () => {
    it('should have correct structure', () => {
      const bullet: Bullet = {
        x: 50,
        y: 50,
        speed: 6,
        isPlayer: true,
        active: true,
      };

      expect(bullet.x).toBe(50);
      expect(bullet.isPlayer).toBe(true);
      expect(bullet.active).toBe(true);
    });

    it('should support object pool marker', () => {
      const bullet: Bullet = {
        x: 0,
        y: 0,
        speed: 4,
        isPlayer: false,
        active: false, // inactive = 在对象池中
      };

      expect(bullet.active).toBe(false);
    });
  });

  describe('Explosion 类型', () => {
    it('should have correct structure', () => {
      const explosion: Explosion = {
        x: 100,
        y: 100,
        radius: 20,
        alpha: 1,
        color: '#ff6600',
        active: true,
      };

      expect(explosion.x).toBe(100);
      expect(explosion.radius).toBe(20);
      expect(explosion.alpha).toBe(1);
    });
  });

  describe('TankLevelConfig 类型', () => {
    it('should have all required properties', () => {
      const config: TankLevelConfig = {
        enemyCount: 5,
        enemySpeed: 2,
        enemyFireRate: 0.02,
        bossLevel: false,
        bossHP: 10,
        playerSpeed: 3,
        autoFireInterval: 300,
        enemyBulletSpeed: 4,
        playerBulletSpeed: 6,
      };

      expect(config.enemyCount).toBe(5);
      expect(config.bossLevel).toBe(false);
    });

    it('should support boss level configuration', () => {
      const bossConfig: TankLevelConfig = {
        enemyCount: 3,
        enemySpeed: 1.5,
        enemyFireRate: 0.03,
        bossLevel: true,
        bossHP: 50,
        playerSpeed: 3,
        autoFireInterval: 250,
        enemyBulletSpeed: 5,
        playerBulletSpeed: 7,
      };

      expect(bossConfig.bossLevel).toBe(true);
      expect(bossConfig.bossHP).toBe(50);
    });
  });
});
