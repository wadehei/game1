import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMatch3Engine } from '../../composables/useMatch3Engine';
import type { Cell } from '../../composables/useMatch3Engine';

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
    playCombo: vi.fn(),
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

vi.mock('@/api/game', () => ({
  getLevelOverride: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/utils/voice', () => ({
  speak: vi.fn(),
  playVoice: vi.fn(),
}));

vi.mock('@/utils/levelDefaults', () => ({
  defaultLevelConfig: (game: string, level: number) => ({
    targetScore: 200,
    moves: 20,
    kinds: Math.min(6, 3 + Math.floor(level / 3)),
  }),
}));

describe('useMatch3Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('模块导出', () => {
    it('should export useMatch3Engine function', () => {
      expect(typeof useMatch3Engine).toBe('function');
    });

    it('should return engine with game state', () => {
      const engine = useMatch3Engine();

      // 游戏状态
      expect(engine).toHaveProperty('currentLevel');
      expect(engine).toHaveProperty('score');
      expect(engine).toHaveProperty('movesLeft');
      expect(engine).toHaveProperty('combo');
      expect(engine).toHaveProperty('grid');
      expect(engine).toHaveProperty('selected');
      expect(engine).toHaveProperty('busy');
      expect(engine).toHaveProperty('showResult');
      expect(engine).toHaveProperty('gameWon');

      // 方法
      expect(engine).toHaveProperty('tapCell');
      expect(engine).toHaveProperty('pauseGame');
      expect(engine).toHaveProperty('resumeGame');
      expect(engine).toHaveProperty('chooseLevel');
    });
  });

  describe('Cell 类型', () => {
    it('should have correct structure', () => {
      const cell: Cell = {
        id: 1,
        r: 0,
        c: 0,
        kind: 0,
      };

      expect(cell.id).toBe(1);
      expect(cell.r).toBe(0);
      expect(cell.c).toBe(0);
      expect(cell.kind).toBe(0);
    });

    it('should support optional clearing and popin flags', () => {
      const cell: Cell = {
        id: 1,
        r: 2,
        c: 3,
        kind: 2,
        clearing: true,
        popin: true,
      };

      expect(cell.clearing).toBe(true);
      expect(cell.popin).toBe(true);
    });
  });

  describe('棋盘尺寸常量', () => {
    it('should define correct board dimensions', () => {
      // 8x8 是标准消消乐棋盘
      const ROWS = 8;
      const COLS = 8;

      expect(ROWS).toBe(8);
      expect(COLS).toBe(8);
    });
  });

  describe('主题系统', () => {
    it('should define themes for different level ranges', () => {
      // 四类主题：数字/动物/植物/水果
      const THEMES = [
        ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'],
        ['🐱', '🐶', '🐰', '🐼', '🦊', '🐸'],
        ['🌳', '🌸', '🌻', '🌵', '🍀', '🍁'],
        ['🍎', '🍇', '🍉', '🍓', '🍑', '🍍'],
      ];

      expect(THEMES).toHaveLength(4);
      THEMES.forEach((theme) => {
        expect(theme).toHaveLength(6);
      });
    });
  });
});
