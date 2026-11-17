import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GAME_PAUSE_EVENT,
  GAME_RESUME_EVENT,
  emitGamePause,
  emitGameResume,
} from '../../utils/gameEvents';

describe('gameEvents', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dispatchSpy: any;

  beforeEach(() => {
    dispatchSpy = vi.spyOn(document, 'dispatchEvent');
  });

  afterEach(() => {
    dispatchSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('事件名称常量', () => {
    it('should export GAME_PAUSE_EVENT', () => {
      expect(GAME_PAUSE_EVENT).toBe('game:pause');
    });

    it('should export GAME_RESUME_EVENT', () => {
      expect(GAME_RESUME_EVENT).toBe('game:resume');
    });

    it('should have different event names', () => {
      expect(GAME_PAUSE_EVENT).not.toBe(GAME_RESUME_EVENT);
    });
  });

  describe('emitGamePause', () => {
    it('should dispatch CustomEvent with correct type', () => {
      emitGamePause();

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: GAME_PAUSE_EVENT,
        })
      );
    });

    it('should dispatch a CustomEvent instance', () => {
      emitGamePause();

      const event = dispatchSpy.mock.calls[0][0];
      expect(event).toBeInstanceOf(CustomEvent);
    });
  });

  describe('emitGameResume', () => {
    it('should dispatch CustomEvent with correct type', () => {
      emitGameResume();

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: GAME_RESUME_EVENT,
        })
      );
    });

    it('should dispatch a CustomEvent instance', () => {
      emitGameResume();

      const event = dispatchSpy.mock.calls[0][0];
      expect(event).toBeInstanceOf(CustomEvent);
    });
  });

  describe('事件监听集成', () => {
    it('should allow listening to pause events', () => {
      const handler = vi.fn();
      document.addEventListener(GAME_PAUSE_EVENT, handler);

      emitGamePause();

      expect(handler).toHaveBeenCalledTimes(1);

      document.removeEventListener(GAME_PAUSE_EVENT, handler);
    });

    it('should allow listening to resume events', () => {
      const handler = vi.fn();
      document.addEventListener(GAME_RESUME_EVENT, handler);

      emitGameResume();

      expect(handler).toHaveBeenCalledTimes(1);

      document.removeEventListener(GAME_RESUME_EVENT, handler);
    });

    it('should not trigger pause handler on resume', () => {
      const pauseHandler = vi.fn();
      const resumeHandler = vi.fn();

      document.addEventListener(GAME_PAUSE_EVENT, pauseHandler);
      document.addEventListener(GAME_RESUME_EVENT, resumeHandler);

      emitGameResume();

      expect(pauseHandler).not.toHaveBeenCalled();
      expect(resumeHandler).toHaveBeenCalledTimes(1);

      document.removeEventListener(GAME_PAUSE_EVENT, pauseHandler);
      document.removeEventListener(GAME_RESUME_EVENT, resumeHandler);
    });
  });
});
