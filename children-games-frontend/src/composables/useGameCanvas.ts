import { ref, onUnmounted } from 'vue';

/**
 * Canvas 游戏画布管理
 * - 按 devicePixelRatio 放大画布分辨率（高分屏不模糊）
 * - ResizeObserver 跟随布局尺寸变化（横竖屏、地址栏伸缩）
 * - 游戏逻辑统一使用 CSS 像素坐标
 */
export function useGameCanvas(maxDpr = 2) {
  const canvasWidth = ref(375);
  const canvasHeight = ref(600);
  const canvasReady = ref(false);

  let ctx: CanvasRenderingContext2D | null = null;
  let canvasEl: HTMLCanvasElement | null = null;
  let observer: ResizeObserver | null = null;
  let resolveFirstFit: (() => void) | null = null;
  const firstFit = new Promise<void>((resolve) => { resolveFirstFit = resolve; });
  const resizeHandlers: Array<(w: number, h: number, ctx: CanvasRenderingContext2D) => void> = [];

  const applyFit = () => {
    if (!canvasEl) return;
    const cssW = canvasEl.offsetWidth;
    const cssH = canvasEl.offsetHeight;
    if (!cssW || !cssH) return;

    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    canvasEl.width = Math.round(cssW * dpr);
    canvasEl.height = Math.round(cssH * dpr);
    const context = canvasEl.getContext('2d');
    if (!context) return;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx = context;
    canvasWidth.value = cssW;
    canvasHeight.value = cssH;
    canvasReady.value = true;
    resolveFirstFit?.();
    resolveFirstFit = null;
    resizeHandlers.forEach((cb) => cb(cssW, cssH, context));
  };

  /** 绑定画布元素，立即测量一次并监听后续尺寸变化 */
  const bind = (el: HTMLCanvasElement | null) => {
    canvasEl = el;
    if (!el) return;
    applyFit();
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(applyFit);
      observer.observe(el);
    }
  };

  /** 等待首次尺寸测量完成（initGame 开始前调用） */
  const whenReady = () => (canvasReady.value ? Promise.resolve() : firstFit);

  /** 尺寸变化回调，用于重建随尺寸缓存的资源（如背景渐变） */
  const onResize = (cb: (w: number, h: number, ctx: CanvasRenderingContext2D) => void) => {
    resizeHandlers.push(cb);
  };

  onUnmounted(() => {
    observer?.disconnect();
    resizeHandlers.length = 0;
  });

  return {
    canvasWidth,
    canvasHeight,
    canvasReady,
    bind,
    whenReady,
    onResize,
    getCtx: () => ctx,
  };
}
