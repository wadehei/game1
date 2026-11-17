import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMathEngine } from '../../composables/useMathEngine';
import type { MathQuestion, MathLevelConfig } from '../../composables/useMathEngine';

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
  speak: vi.fn(),
  stopSpeaking: vi.fn(),
  playVoice: vi.fn(),
}));

vi.mock('@/utils/levelDefaults', () => ({
  defaultLevelConfig: (game: string, level: number) => ({
    targetCorrect: 8,
    forceMode: 0,
    countMax: level <= 3 ? 5 : 10,
    addMax: level <= 6 ? 5 : 10,
  }),
}));

describe('useMathEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('模块导出', () => {
    it('should export useMathEngine function', () => {
      expect(typeof useMathEngine).toBe('function');
    });

    it('should return engine object with expected properties', () => {
      const engine = useMathEngine();

      // 响应式状态
      expect(engine).toHaveProperty('currentLevel');
      expect(engine).toHaveProperty('correctCount');
      expect(engine).toHaveProperty('wrongCount');
      expect(engine).toHaveProperty('showResult');
      expect(engine).toHaveProperty('stars');
      expect(engine).toHaveProperty('paused');
      expect(engine).toHaveProperty('question');

      // 方法
      expect(engine).toHaveProperty('answerQuestion');
      expect(engine).toHaveProperty('pauseGame');
      expect(engine).toHaveProperty('resumeGame');
      expect(engine).toHaveProperty('chooseLevel');
      expect(engine).toHaveProperty('nextLevel');
    });
  });

  describe('MathQuestion 类型', () => {
    it('should have correct structure for count mode', () => {
      const question: MathQuestion = {
        mode: 'count',
        countA: 5,
        countB: 0,
        answer: 5,
        options: [3, 5, 7],
        icon: '🍎',
      };

      expect(question.mode).toBe('count');
      expect(question.answer).toBe(5);
      expect(question.options).toContain(5);
    });

    it('should have correct structure for add mode', () => {
      const question: MathQuestion = {
        mode: 'add',
        countA: 3,
        countB: 4,
        answer: 7,
        options: [5, 7, 9],
      };

      expect(question.mode).toBe('add');
      expect(question.countA + question.countB).toBe(question.answer);
    });
  });

  describe('MathLevelConfig 类型', () => {
    it('should have correct structure', () => {
      const config: MathLevelConfig = {
        targetCorrect: 8,
        forceMode: 0,
        countMax: 10,
        addMax: 10,
      };

      expect(config.targetCorrect).toBe(8);
      expect(config.forceMode).toBe(0);
    });

    it('should support additional properties via index signature', () => {
      const config: MathLevelConfig = {
        targetCorrect: 10,
        forceMode: 1,
        countMax: 5,
        addMax: 5,
        customProp: 'test',
      };

      expect(config.customProp).toBe('test');
    });
  });
});
