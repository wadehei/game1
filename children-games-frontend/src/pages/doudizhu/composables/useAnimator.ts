/**
 * 斗地主动画系统
 * 帧率自适应，提供流畅的出牌动画效果
 */

import { ref, onUnmounted } from 'vue';
import { Card } from '../utils/types';

export interface AnimationState {
  isAnimating: boolean;
  progress: number;
}

/**
 * 动画控制器 composable
 */
export function useAnimator() {
  const isAnimating = ref(false);
  const animationProgress = ref(0);

  let animationFrameId: number | null = null;
  let startTime = 0;
  let duration = 0;
  let onUpdate: ((progress: number) => void) | null = null;
  let onComplete: (() => void) | null = null;

  /**
   * 开始动画
   */
  const animate = (
    durationMs: number,
    updateFn: (progress: number) => void,
    completeFn?: () => void
  ) => {
    if (isAnimating.value) {
      cancel();
    }

    duration = durationMs;
    startTime = performance.now();
    onUpdate = updateFn;
    onComplete = completeFn || null;
    isAnimating.value = true;
    animationProgress.value = 0;

    const loop = (time: number) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // 缓动函数：ease-out
      const eased = 1 - Math.pow(1 - progress, 3);

      animationProgress.value = eased;
      onUpdate?.(eased);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(loop);
      } else {
        finish();
      }
    };

    animationFrameId = requestAnimationFrame(loop);
  };

  /**
   * 取消动画
   */
  const cancel = () => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    isAnimating.value = false;
    animationProgress.value = 0;
  };

  /**
   * 完成动画
   */
  const finish = () => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    isAnimating.value = false;
    animationProgress.value = 1;
    onComplete?.();
  };

  onUnmounted(() => {
    cancel();
  });

  return {
    isAnimating,
    animationProgress,
    animate,
    cancel,
    finish,
  };
}

/**
 * 出牌动画配置
 */
export interface PlayAnimationConfig {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  duration: number;
  card: Card;
}

/**
 * 计算出牌动画的轨迹
 */
export function calculatePlayTrajectory(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  progress: number
): { x: number; y: number; scale: number; opacity: number } {
  // 贝塞尔曲线轨迹
  const controlX = (fromX + toX) / 2;
  const controlY = Math.min(fromY, toY) - 50;

  // 二次贝塞尔曲线
  const t = progress;
  const x = Math.pow(1 - t, 2) * fromX + 2 * (1 - t) * t * controlX + Math.pow(t, 2) * toX;
  const y = Math.pow(1 - t, 2) * fromY + 2 * (1 - t) * t * controlY + Math.pow(t, 2) * toY;

  // 缩放：先放大后恢复
  const scale = 1 + 0.2 * Math.sin(progress * Math.PI);

  // 透明度
  const opacity = progress < 0.1 ? progress * 10 : 1;

  return { x, y, scale, opacity };
}

/**
 * 选牌动画（牌向上移动）
 */
export function getCardSelectTransform(selected: boolean): string {
  return selected ? 'translateY(-16px)' : 'translateY(0)';
}

/**
 * 发牌动画延迟计算
 */
export function getDealDelay(cardIndex: number, totalCards: number): number {
  // 每张牌间隔50ms
  return cardIndex * 50;
}

/**
 * 炸弹特效动画
 */
export interface BombEffect {
  x: number;
  y: number;
  startTime: number;
  duration: number;
}

/**
 * 创建炸弹特效
 */
export function createBombEffect(x: number, y: number): BombEffect {
  return {
    x,
    y,
    startTime: performance.now(),
    duration: 800,
  };
}

/**
 * 计算炸弹特效进度
 */
export function getBombEffectProgress(effect: BombEffect, currentTime: number): number {
  const elapsed = currentTime - effect.startTime;
  return Math.min(elapsed / effect.duration, 1);
}

/**
 * 帧率自适应渲染器
 */
export function useFrameRateAdapter() {
  const targetFPS = ref(60);
  const actualFPS = ref(60);
  let lastFrameTime = 0;
  let frameCount = 0;
  let fpsUpdateTime = 0;

  const shouldRender = (currentTime: number): boolean => {
    const frameInterval = 1000 / targetFPS.value;
    const elapsed = currentTime - lastFrameTime;

    if (elapsed >= frameInterval) {
      lastFrameTime = currentTime - (elapsed % frameInterval);
      frameCount++;

      // 每秒更新一次实际FPS
      if (currentTime - fpsUpdateTime >= 1000) {
        actualFPS.value = frameCount;
        frameCount = 0;
        fpsUpdateTime = currentTime;
      }

      return true;
    }

    return false;
  };

  const setTargetFPS = (fps: number) => {
    targetFPS.value = Math.max(30, Math.min(60, fps));
  };

  return {
    targetFPS,
    actualFPS,
    shouldRender,
    setTargetFPS,
  };
}

/**
 * CSS 过渡类名生成
 */
export function getTransitionClass(type: 'select' | 'play' | 'deal'): string {
  return `card-transition card-transition-${type}`;
}
