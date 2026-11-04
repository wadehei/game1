import { onMounted, onUnmounted, type Ref } from 'vue';
import { GAME_PAUSE_EVENT, GAME_RESUME_EVENT } from '@/utils/gameEvents';

/**
 * 游戏生命周期 composable 选项
 */
export interface UseGameLifecycleOptions {
  /** 暂停游戏回调 */
  onPause: () => void;
  /** 恢复游戏回调 */
  onResume: () => void;
  /** 是否启用页面可见性监听（默认 true） */
  enableVisibility?: boolean;
  /** 是否启用游戏暂停/恢复事件监听（默认 true） */
  enableGameEvents?: boolean;
}

/**
 * 游戏生命周期 composable
 *
 * 统一封装游戏页面的通用生命周期逻辑：
 * - 页面可见性变化（visibilitychange）：切换标签页时自动暂停/恢复
 * - 全局游戏暂停/恢复事件（GAME_PAUSE_EVENT/GAME_RESUME_EVENT）：护眼休息等全局控制
 *
 * @example
 * ```ts
 * useGameLifecycle({
 *   onPause: () => { gameRunning.value = false; },
 *   onResume: () => { gameRunning.value = true; },
 * });
 * ```
 *
 * @param options 配置选项
 */
export function useGameLifecycle(options: UseGameLifecycleOptions): void {
  const { onPause, onResume, enableVisibility = true, enableGameEvents = true } = options;

  // ── 页面可见性变化处理 ──
  const handleVisibilityChange = (): void => {
    if (document.hidden) {
      onPause();
    } else {
      onResume();
    }
  };

  // ── 注册事件监听 ──
  onMounted(() => {
    if (enableVisibility) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    if (enableGameEvents) {
      document.addEventListener(GAME_PAUSE_EVENT, onPause);
      document.addEventListener(GAME_RESUME_EVENT, onResume);
    }
  });

  // ── 清理事件监听 ──
  onUnmounted(() => {
    if (enableVisibility) {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    if (enableGameEvents) {
      document.removeEventListener(GAME_PAUSE_EVENT, onPause);
      document.removeEventListener(GAME_RESUME_EVENT, onResume);
    }
  });
}

/**
 * 简化的游戏暂停/恢复 composable
 *
 * 接受一个 ref<boolean> 来控制游戏运行状态，自动处理暂停/恢复逻辑。
 *
 * @example
 * ```ts
 * const gameRunning = ref(true);
 * useGamePauseResume(gameRunning);
 * ```
 *
 * @param running 游戏运行状态 ref
 * @param options 可选配置
 */
export function useGamePauseResume(
  running: Ref<boolean>,
  options?: Pick<UseGameLifecycleOptions, 'enableVisibility' | 'enableGameEvents'>
): void {
  useGameLifecycle({
    onPause: () => {
      running.value = false;
    },
    onResume: () => {
      running.value = true;
    },
    ...options,
  });
}
