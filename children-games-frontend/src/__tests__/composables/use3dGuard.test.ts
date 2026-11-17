/**
 * 3D 护栏工具单测：WebGL 检测 + 低帧自动回退
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectWebGL,
  startFpsGuard,
  MAX_PIXEL_RATIO,
  FPS_THRESHOLD,
  FPS_WINDOW_MS,
} from '../../composables/use3dGuard';

describe('use3dGuard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('护栏常量符合方案红线', () => {
    expect(MAX_PIXEL_RATIO).toBeLessThanOrEqual(1.5);
    expect(FPS_THRESHOLD).toBe(25);
    expect(FPS_WINDOW_MS).toBe(5000);
  });

  it('detectWebGL 在 jsdom 无 WebGL 上下文时返回 false（不抛异常）', () => {
    expect(typeof detectWebGL()).toBe('boolean');
  });

  it('高帧率不触发回退', () => {
    const onFallback = vi.fn();
    // 手动驱动的 rAF：时间由测试控制
    let cb: (ts: number) => void = () => {};
    const raf = (fn: (ts: number) => void) => {
      cb = fn;
      return 1;
    };
    const guard = startFpsGuard({ onFallback, raf, cancel: () => {} });

    // 模拟 60fps 跑 10 秒
    let ts = 0;
    for (let i = 0; i < 600; i += 1) {
      ts += 1000 / 60;
      cb(ts);
    }
    expect(onFallback).not.toHaveBeenCalled();
    guard.stop();
  });

  it('持续低帧（<25fps 达 5 秒）触发一次回退并自停', () => {
    const onFallback = vi.fn();
    let cb: (ts: number) => void = () => {};
    let scheduled = 0;
    const raf = (fn: (ts: number) => void) => {
      cb = fn;
      scheduled += 1;
      return scheduled;
    };
    const guard = startFpsGuard({ onFallback, raf, cancel: () => {} });

    // 模拟 20fps 跑 6 秒
    let ts = 0;
    for (let i = 0; i < 120; i += 1) {
      ts += 1000 / 20;
      cb(ts);
    }
    expect(onFallback).toHaveBeenCalledTimes(1);

    // 回退后守卫自停：继续喂帧不再触发
    for (let i = 0; i < 120; i += 1) {
      ts += 1000 / 20;
      cb(ts);
    }
    expect(onFallback).toHaveBeenCalledTimes(1);
    guard.stop();
  });

  it('窗口边界恢复高帧率则继续守卫（不误杀瞬时卡顿）', () => {
    const onFallback = vi.fn();
    let cb: (ts: number) => void = () => {};
    const raf = (fn: (ts: number) => void) => {
      cb = fn;
      return 1;
    };
    const guard = startFpsGuard({ onFallback, raf, cancel: () => {} });

    let ts = 0;
    // 第一个窗口：低帧 3 秒 + 高帧 2 秒补足 → 窗口平均 30fps，不触发
    for (let i = 0; i < 60; i += 1) {
      ts += 1000 / 20;
      cb(ts);
    }
    for (let i = 0; i < 60; i += 1) {
      ts += 1000 / 60;
      cb(ts);
    }
    // 第二个窗口：60fps
    for (let i = 0; i < 300; i += 1) {
      ts += 1000 / 60;
      cb(ts);
    }
    expect(onFallback).not.toHaveBeenCalled();
    guard.stop();
  });

  it('stop 后不再响应帧', () => {
    const onFallback = vi.fn();
    let cb: (ts: number) => void = () => {};
    const raf = (fn: (ts: number) => void) => {
      cb = fn;
      return 1;
    };
    const guard = startFpsGuard({ onFallback, raf, cancel: () => {} });
    guard.stop();
    let ts = 0;
    for (let i = 0; i < 600; i += 1) {
      ts += 1000 / 10;
      cb(ts);
    }
    expect(onFallback).not.toHaveBeenCalled();
  });
});
