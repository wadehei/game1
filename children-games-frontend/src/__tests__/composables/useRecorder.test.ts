import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock MediaRecorder ─────────────────────────────────

const mockStart = vi.fn();
const mockStop = vi.fn();
let mockOnDataAvailable: ((e: { data: Blob }) => void) | null = null;
let mockOnStop: (() => void) | null = null;

const MockMediaRecorder = Object.assign(
  vi.fn().mockImplementation(() => {
    const instance = {
      start: mockStart,
      stop: mockStop,
      state: 'recording',
      set ondataavailable(fn: (e: { data: Blob }) => void) {
        mockOnDataAvailable = fn;
      },
      set onstop(fn: () => void) {
        mockOnStop = fn;
      },
    };
    return instance;
  }),
  { isTypeSupported: vi.fn().mockReturnValue(true) }
);

vi.stubGlobal('MediaRecorder', MockMediaRecorder);

// ─── Mock navigator.mediaDevices ────────────────────────

const mockGetUserMedia = vi.fn();
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: mockGetUserMedia,
  },
  writable: true,
});

// ─── Mock window.isSecureContext ────────────────────────

Object.defineProperty(window, 'isSecureContext', {
  value: true,
  writable: true,
});

// ─── Mock stream ────────────────────────────────────────

const mockGetTracks = vi.fn().mockReturnValue([{ stop: vi.fn() }]);
const mockStream = {
  getTracks: mockGetTracks,
};

import { useRecorder } from '@/composables/useRecorder';

describe('composables/useRecorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockGetUserMedia.mockResolvedValue(mockStream);
    mockOnDataAvailable = null;
    mockOnStop = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('初始状态', () => {
    it('recording 默认 false', () => {
      const { recording } = useRecorder();
      expect(recording.value).toBe(false);
    });

    it('seconds 默认 0', () => {
      const { seconds } = useRecorder();
      expect(seconds.value).toBe(0);
    });

    it('error 默认空', () => {
      const { error } = useRecorder();
      expect(error.value).toBe('');
    });
  });

  describe('start()', () => {
    it('成功返回 true', async () => {
      const { start } = useRecorder();
      const result = await start();

      expect(result).toBe(true);
    });

    it('设置 recording = true', async () => {
      const { start, recording } = useRecorder();
      await start();

      expect(recording.value).toBe(true);
    });

    it('调用 getUserMedia', async () => {
      const { start } = useRecorder();
      await start();

      expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
    });

    it('HTTP 非安全上下文返回 false', async () => {
      Object.defineProperty(window, 'isSecureContext', {
        value: false,
        writable: true,
      });

      const { start, error } = useRecorder();
      const result = await start();

      expect(result).toBe(false);
      expect(error.value).toContain('HTTP');

      Object.defineProperty(window, 'isSecureContext', {
        value: true,
        writable: true,
      });
    });

    it('权限拒绝返回错误信息', async () => {
      const err = new DOMException('Permission denied', 'NotAllowedError');
      mockGetUserMedia.mockRejectedValue(err);

      const { start, error } = useRecorder();
      const result = await start();

      expect(result).toBe(false);
      expect(error.value).toContain('权限被拒绝');
    });

    it('无设备返回错误信息', async () => {
      const err = new DOMException('No device', 'NotFoundError');
      mockGetUserMedia.mockRejectedValue(err);

      const { start, error } = useRecorder();
      const result = await start();

      expect(result).toBe(false);
      expect(error.value).toContain('麦克风设备');
    });

    it('其他错误返回通用错误信息', async () => {
      const err = new DOMException('Unknown error', 'UnknownError');
      mockGetUserMedia.mockRejectedValue(err);

      const { start, error } = useRecorder();
      const result = await start();

      expect(result).toBe(false);
      expect(error.value).toContain('无法访问麦克风');
    });
  });

  describe('stop()', () => {
    it('正常停止返回 blob', async () => {
      const { start, stop } = useRecorder();
      await start();

      const stopPromise = stop();

      // 模拟数据
      if (mockOnDataAvailable) {
        mockOnDataAvailable({ data: new Blob(['test'], { type: 'audio/webm' }) });
      }

      // 触发 stop
      if (mockOnStop) {
        mockOnStop();
      }

      const result = await stopPromise;
      expect(result).not.toBeNull();
      expect(result?.blob).toBeInstanceOf(Blob);
    });

    it('未录音时返回 null', async () => {
      const { stop } = useRecorder();
      const result = await stop();

      expect(result).toBeNull();
    });

    it('取消返回 null', async () => {
      const { start, stop } = useRecorder();
      await start();

      const stopPromise = stop(true);

      // 触发 stop
      if (mockOnStop) {
        mockOnStop();
      }

      const result = await stopPromise;
      expect(result).toBeNull();
    });
  });

  describe('超时自动停止', () => {
    it('60 秒后自动停止', async () => {
      const { start, stop, seconds } = useRecorder();
      await start();

      // 模拟 60 秒
      for (let i = 0; i < 60; i++) {
        vi.advanceTimersByTime(1000);
      }

      expect(seconds.value).toBe(60);
      // 应该自动调用 stop
      expect(mockStop).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('停止 stream tracks', async () => {
      const { start, stop } = useRecorder();
      await start();

      const stopPromise = stop();
      if (mockOnStop) {
        mockOnStop();
      }
      await stopPromise;

      expect(mockGetTracks).toHaveBeenCalled();
    });
  });
});
