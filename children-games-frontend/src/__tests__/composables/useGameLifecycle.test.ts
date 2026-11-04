import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { useGameLifecycle, useGamePauseResume } from '../../composables/useGameLifecycle';
import {
  GAME_PAUSE_EVENT,
  GAME_RESUME_EVENT,
  emitGamePause,
  emitGameResume,
} from '../../utils/gameEvents';

describe('useGameLifecycle', () => {
  let onPause: ReturnType<typeof vi.fn>;
  let onResume: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onPause = vi.fn();
    onResume = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('useGameLifecycle', () => {
    it('should be a function', () => {
      expect(typeof useGameLifecycle).toBe('function');
    });

    it('should accept options with callbacks', () => {
      expect(() => {
        useGameLifecycle({ onPause, onResume });
      }).not.toThrow();
    });

    it('should accept enableVisibility option', () => {
      expect(() => {
        useGameLifecycle({
          onPause,
          onResume,
          enableVisibility: false,
        });
      }).not.toThrow();
    });

    it('should accept enableGameEvents option', () => {
      expect(() => {
        useGameLifecycle({
          onPause,
          onResume,
          enableGameEvents: false,
        });
      }).not.toThrow();
    });
  });

  describe('useGamePauseResume', () => {
    it('should be a function', () => {
      expect(typeof useGamePauseResume).toBe('function');
    });

    it('should accept a ref<boolean>', () => {
      const running = ref(true);

      expect(() => {
        useGamePauseResume(running);
      }).not.toThrow();
    });

    it('should accept options', () => {
      const running = ref(true);

      expect(() => {
        useGamePauseResume(running, {
          enableVisibility: false,
          enableGameEvents: true,
        });
      }).not.toThrow();
    });
  });

  describe('gameEvents', () => {
    it('should export correct event names', () => {
      expect(GAME_PAUSE_EVENT).toBe('game:pause');
      expect(GAME_RESUME_EVENT).toBe('game:resume');
    });

    it('should dispatch game pause event', () => {
      const dispatchSpy = vi.spyOn(document, 'dispatchEvent');

      emitGamePause();

      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: GAME_PAUSE_EVENT }));

      dispatchSpy.mockRestore();
    });

    it('should dispatch game resume event', () => {
      const dispatchSpy = vi.spyOn(document, 'dispatchEvent');

      emitGameResume();

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: GAME_RESUME_EVENT })
      );

      dispatchSpy.mockRestore();
    });
  });
});
