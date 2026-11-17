/**
 * 3D 模式统一护栏（所有 Three.js 3D 页面强制使用）
 * - detectWebGL：进入 3D 前探测 WebGL 可用性，失败立即回退 2D
 * - startFpsGuard：持续低帧（<25fps 达 5 秒）触发一次性回退回调
 * - MAX_PIXEL_RATIO：渲染器 pixelRatio 上限（性能红线）
 *
 * raf/now 可注入以便单测（默认走浏览器 rAF/performance.now）
 */

export const MAX_PIXEL_RATIO = 1.5;
export const FPS_THRESHOLD = 25;
export const FPS_WINDOW_MS = 5000;

export function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

export interface FpsGuardOptions {
  /** 低帧触发（只触发一次，触发后守卫自停） */
  onFallback: () => void;
  /** 采样窗口（默认 5 秒） */
  windowMs?: number;
  /** 帧率阈值（默认 25） */
  threshold?: number;
  /** 注入 rAF（单测用） */
  raf?: (cb: (ts: number) => void) => number;
  /** 注入取消 rAF（单测用） */
  cancel?: (id: number) => void;
}

export interface FpsGuard {
  /** 手动停止（页面卸载时调用） */
  stop: () => void;
}

export function startFpsGuard(options: FpsGuardOptions): FpsGuard {
  const windowMs = options.windowMs ?? FPS_WINDOW_MS;
  const threshold = options.threshold ?? FPS_THRESHOLD;
  const raf = options.raf ?? ((cb: (ts: number) => void) => requestAnimationFrame(cb));
  const cancelRaf = options.cancel ?? ((id: number) => cancelAnimationFrame(id));

  let stopped = false;
  let rafId = 0;
  let windowStart: number | null = null;
  let frames = 0;

  const tick = (ts: number): void => {
    if (stopped) return;
    if (windowStart === null) {
      windowStart = ts;
      frames = 0;
    }
    frames += 1;
    if (ts - windowStart >= windowMs) {
      const fps = (frames * 1000) / (ts - windowStart);
      if (fps < threshold) {
        stopped = true;
        options.onFallback();
        return;
      }
      windowStart = ts;
      frames = 0;
    }
    rafId = raf(tick);
  };

  rafId = raf(tick);

  return {
    stop: () => {
      stopped = true;
      cancelRaf(rafId);
    },
  };
}
