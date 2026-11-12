import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Vue lifecycle
let unmountCallbacks: (() => void)[] = [];
vi.mock('vue', async () => {
  const actual = await vi.importActual('vue');
  return {
    ...actual,
    onUnmounted: (fn: () => void) => {
      unmountCallbacks.push(fn);
    },
  };
});

// Mock gameEvents and request - use vi.hoisted to define mocks before vi.mock
const { mockEmitGamePause, mockEmitGameResume, mockApiGet, mockApiPost } = vi.hoisted(() => ({
  mockEmitGamePause: vi.fn(),
  mockEmitGameResume: vi.fn(),
  mockApiGet: vi.fn().mockResolvedValue({ restIntervalMinutes: 20 }),
  mockApiPost: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../utils/gameEvents', () => ({
  emitGamePause: mockEmitGamePause,
  emitGameResume: mockEmitGameResume,
}));

vi.mock('../../utils/request', () => ({
  api: {
    get: mockApiGet,
    post: mockApiPost,
  },
}));

import {
  usePlayTimeGuard,
  getRestIntervalMinutes,
  getTodayPlaySeconds,
  resetTodayPlayTime,
} from '../../composables/usePlayTimeGuard';

describe('composables/usePlayTimeGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    unmountCallbacks = [];
    localStorage.clear();
    mockEmitGamePause.mockClear();
    mockEmitGameResume.mockClear();
    mockApiGet.mockClear();
    mockApiPost.mockClear();

    // Mock document.hidden
    Object.defineProperty(document, 'hidden', { value: false, writable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getRestIntervalMinutes', () => {
    it('should return default 20 when no setting', () => {
      expect(getRestIntervalMinutes()).toBe(20);
    });

    it('should return parent setting from localStorage', () => {
      localStorage.setItem('parent_rest_interval', '30');
      expect(getRestIntervalMinutes()).toBe(30);
    });

    it('should return 0 when disabled', () => {
      localStorage.setItem('parent_rest_interval', '0');
      expect(getRestIntervalMinutes()).toBe(0);
    });

    it('should return default for invalid value', () => {
      localStorage.setItem('parent_rest_interval', 'invalid');
      expect(getRestIntervalMinutes()).toBe(20);
    });

    it('should return default for negative value', () => {
      localStorage.setItem('parent_rest_interval', '-5');
      expect(getRestIntervalMinutes()).toBe(20);
    });
  });

  describe('getTodayPlaySeconds', () => {
    it('should return 0 when no record', () => {
      expect(getTodayPlaySeconds()).toBe(0);
    });

    it('should return saved play seconds', () => {
      const today = new Date();
      const key = `playtime_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
      localStorage.setItem(key, '3600');
      expect(getTodayPlaySeconds()).toBe(3600);
    });

    it('should return 0 for invalid value', () => {
      const today = new Date();
      const key = `playtime_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
      localStorage.setItem(key, 'invalid');
      expect(getTodayPlaySeconds()).toBe(0);
    });
  });

  describe('resetTodayPlayTime', () => {
    it('should reset play time to 0', () => {
      const today = new Date();
      const key = `playtime_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
      localStorage.setItem(key, '3600');
      resetTodayPlayTime();
      expect(localStorage.getItem(key)).toBe('0');
    });
  });

  describe('usePlayTimeGuard', () => {
    it('should initialize with correct values', () => {
      const routePath = () => '/memory';
      const { restShow, restCountdown, todayMinutes } = usePlayTimeGuard(routePath);

      expect(restShow.value).toBe(false);
      expect(restCountdown.value).toBe(20);
      expect(todayMinutes.value).toBe(0);
    });

    it('should increment play time every second on game route', () => {
      const routePath = () => '/memory';
      const { todayMinutes } = usePlayTimeGuard(routePath);

      vi.advanceTimersByTime(60000); // 1 minute
      expect(todayMinutes.value).toBe(1);

      vi.advanceTimersByTime(60000); // 2 minutes
      expect(todayMinutes.value).toBe(2);
    });

    it('should not increment when not on game route', () => {
      const routePath = () => '/home';
      const { todayMinutes } = usePlayTimeGuard(routePath);

      vi.advanceTimersByTime(120000); // 2 minutes
      expect(todayMinutes.value).toBe(0);
    });

    it('should not increment when page is hidden', () => {
      Object.defineProperty(document, 'hidden', { value: true, writable: true });
      const routePath = () => '/memory';
      const { todayMinutes } = usePlayTimeGuard(routePath);

      vi.advanceTimersByTime(120000);
      expect(todayMinutes.value).toBe(0);
    });

    it('should trigger rest when reaching interval', () => {
      localStorage.setItem('parent_rest_interval', '1'); // 1 minute
      const routePath = () => '/fruit';
      const { restShow } = usePlayTimeGuard(routePath);

      vi.advanceTimersByTime(60000); // 1 minute
      expect(restShow.value).toBe(true);
      expect(mockEmitGamePause).toHaveBeenCalled();
    });

    it('should not trigger rest when disabled', () => {
      localStorage.setItem('parent_rest_interval', '0');
      const routePath = () => '/puzzle';
      const { restShow } = usePlayTimeGuard(routePath);

      vi.advanceTimersByTime(300000); // 5 minutes
      expect(restShow.value).toBe(false);
    });

    it('should countdown during rest', () => {
      localStorage.setItem('parent_rest_interval', '1');
      const routePath = () => '/balloon';
      const { restShow, restCountdown } = usePlayTimeGuard(routePath);

      vi.advanceTimersByTime(60000); // trigger rest
      expect(restShow.value).toBe(true);
      expect(restCountdown.value).toBe(20);

      vi.advanceTimersByTime(10000); // 10 seconds
      expect(restCountdown.value).toBe(10);

      vi.advanceTimersByTime(10000); // 20 seconds total
      expect(restShow.value).toBe(false);
      expect(mockEmitGameResume).toHaveBeenCalled();
    });

    it('should allow skipping rest', () => {
      localStorage.setItem('parent_rest_interval', '1');
      const routePath = () => '/tank';
      const { restShow, skipRest } = usePlayTimeGuard(routePath);

      vi.advanceTimersByTime(60000); // trigger rest
      expect(restShow.value).toBe(true);

      skipRest();
      expect(restShow.value).toBe(false);
      expect(mockEmitGameResume).toHaveBeenCalled();
    });

    it('should persist play time to localStorage', () => {
      const routePath = () => '/mole';
      usePlayTimeGuard(routePath);

      vi.advanceTimersByTime(15000); // 15 seconds - triggers persist

      const today = new Date();
      const key = `playtime_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
      const saved = localStorage.getItem(key);
      expect(saved).toBeTruthy();
      expect(parseInt(saved!, 10)).toBeGreaterThanOrEqual(15);
    });

    it('should report playtime to server periodically', () => {
      const routePath = () => '/simon';
      usePlayTimeGuard(routePath);

      vi.advanceTimersByTime(15000); // 15 seconds

      expect(mockApiPost).toHaveBeenCalledWith('/user/playtime', {
        seconds: expect.any(Number),
      });
    });

    it('should fetch server interval on mount', () => {
      const routePath = () => '/math';
      usePlayTimeGuard(routePath);

      expect(mockApiGet).toHaveBeenCalledWith('/settings/public');
    });

    it('should cleanup on unmount', () => {
      const routePath = () => '/memory';
      usePlayTimeGuard(routePath);

      // Trigger unmount
      unmountCallbacks.forEach((fn) => fn());

      // Should persist on unmount
      const today = new Date();
      const key = `playtime_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
      expect(localStorage.getItem(key)).toBeTruthy();
    });

    it('should not count during rest', () => {
      localStorage.setItem('parent_rest_interval', '1');
      const routePath = () => '/memory';
      const { todayMinutes } = usePlayTimeGuard(routePath);

      vi.advanceTimersByTime(60000); // trigger rest (1 min counted)
      const minutesBeforeRest = todayMinutes.value;

      vi.advanceTimersByTime(20000); // 20 seconds of rest
      // todayMinutes should not increase during rest
      expect(todayMinutes.value).toBe(minutesBeforeRest);
    });
  });
});
