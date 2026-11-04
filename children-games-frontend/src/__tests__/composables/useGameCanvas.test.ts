import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock ResizeObserver ────────────────────────────────

let mockObserveInstance: ReturnType<typeof vi.fn>;
let mockDisconnectInstance: ReturnType<typeof vi.fn>;

function setupResizeObserverMock() {
  mockObserveInstance = vi.fn();
  mockDisconnectInstance = vi.fn();

  vi.stubGlobal(
    'ResizeObserver',
    vi.fn().mockImplementation(() => ({
      observe: mockObserveInstance,
      disconnect: mockDisconnectInstance,
      unobserve: vi.fn(),
    }))
  );
}

// 在模块加载前设置
setupResizeObserverMock();

// ─── Mock Canvas ────────────────────────────────────────

let mockSetTransform: ReturnType<typeof vi.fn>;
let mockGetContext: ReturnType<typeof vi.fn>;

function setupCanvasMock() {
  mockSetTransform = vi.fn();
  mockGetContext = vi.fn().mockReturnValue({
    setTransform: mockSetTransform,
  });
}

function createMockCanvas(width = 375, height = 600): HTMLCanvasElement {
  return {
    offsetWidth: width,
    offsetHeight: height,
    width: 0,
    height: 0,
    getContext: mockGetContext,
  } as unknown as HTMLCanvasElement;
}

// ─── Mock devicePixelRatio ──────────────────────────────

Object.defineProperty(window, 'devicePixelRatio', {
  value: 2,
  writable: true,
});

import { useGameCanvas } from '@/composables/useGameCanvas';

describe('composables/useGameCanvas', () => {
  beforeEach(() => {
    setupResizeObserverMock();
    setupCanvasMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('初始状态', () => {
    it('canvasWidth 默认 375', () => {
      const { canvasWidth } = useGameCanvas();
      expect(canvasWidth.value).toBe(375);
    });

    it('canvasHeight 默认 600', () => {
      const { canvasHeight } = useGameCanvas();
      expect(canvasHeight.value).toBe(600);
    });

    it('canvasReady 默认 false', () => {
      const { canvasReady } = useGameCanvas();
      expect(canvasReady.value).toBe(false);
    });
  });

  describe('bind', () => {
    it('bind(null) 不抛错', () => {
      const { bind } = useGameCanvas();
      expect(() => bind(null)).not.toThrow();
    });

    it('bind(canvas) 获取 context', () => {
      const canvas = createMockCanvas();
      const { bind } = useGameCanvas();
      bind(canvas);

      expect(mockGetContext).toHaveBeenCalledWith('2d');
    });

    it('bind(canvas) 设置 canvas.width/height', () => {
      const canvas = createMockCanvas(100, 200);
      const { bind } = useGameCanvas();
      bind(canvas);

      // dpr = 2, 所以 width = 100 * 2 = 200, height = 200 * 2 = 400
      expect(canvas.width).toBe(200);
      expect(canvas.height).toBe(400);
    });

    it('bind(canvas) 调用 setTransform', () => {
      const canvas = createMockCanvas(100, 200);
      const { bind } = useGameCanvas();
      bind(canvas);

      expect(mockSetTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    });

    it('bind(canvas) 更新 canvasWidth/canvasHeight', () => {
      const canvas = createMockCanvas(100, 200);
      const { bind, canvasWidth, canvasHeight } = useGameCanvas();
      bind(canvas);

      expect(canvasWidth.value).toBe(100);
      expect(canvasHeight.value).toBe(200);
    });

    it('bind(canvas) 设置 canvasReady = true', () => {
      const canvas = createMockCanvas();
      const { bind, canvasReady } = useGameCanvas();
      bind(canvas);

      expect(canvasReady.value).toBe(true);
    });

    it('bind(canvas) 注册 ResizeObserver', () => {
      const canvas = createMockCanvas();
      const { bind } = useGameCanvas();
      bind(canvas);

      expect(mockObserveInstance).toHaveBeenCalledWith(canvas);
    });
  });

  describe('whenReady', () => {
    it('已 ready 时立即 resolve', async () => {
      const canvas = createMockCanvas();
      const { bind, whenReady, canvasReady } = useGameCanvas();
      bind(canvas);

      expect(canvasReady.value).toBe(true);
      await expect(whenReady()).resolves.toBeUndefined();
    });

    it('未 ready 时等待', async () => {
      const { whenReady, canvasReady } = useGameCanvas();
      expect(canvasReady.value).toBe(false);

      // 不绑定 canvas，whenReady 应该等待
      // 使用 Promise.race 避免测试挂起
      const result = await Promise.race([
        whenReady(),
        new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 10)),
      ]);

      expect(result).toBe('timeout');
    });
  });

  describe('onResize', () => {
    it('注册回调', () => {
      const { onResize, bind } = useGameCanvas();
      const callback = vi.fn();
      onResize(callback);

      const canvas = createMockCanvas();
      bind(canvas);

      // 回调应该被存储（通过 bind 触发）
      expect(callback).toHaveBeenCalled();
    });

    it('触发回调时传入正确参数', () => {
      const { onResize, bind } = useGameCanvas();
      const callback = vi.fn();

      const canvas = createMockCanvas(100, 200);
      onResize(callback);
      bind(canvas);

      expect(callback).toHaveBeenCalledWith(100, 200, expect.any(Object));
    });
  });

  describe('getCtx', () => {
    it('未绑定时返回 null', () => {
      const { getCtx } = useGameCanvas();
      expect(getCtx()).toBeNull();
    });

    it('绑定后返回 context', () => {
      const canvas = createMockCanvas();
      const { bind, getCtx } = useGameCanvas();
      bind(canvas);

      expect(getCtx()).not.toBeNull();
    });
  });

  describe('ResizeObserver 不存在', () => {
    it('不抛错', () => {
      const originalResizeObserver = globalThis.ResizeObserver;
      // @ts-expect-error 删除必选全局属性以模拟缺失环境
      delete globalThis.ResizeObserver;

      const canvas = createMockCanvas();
      const { bind } = useGameCanvas();

      expect(() => bind(canvas)).not.toThrow();

      globalThis.ResizeObserver = originalResizeObserver;
    });
  });
});
