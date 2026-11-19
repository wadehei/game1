import { ref, readonly, type Ref } from 'vue';

/**
 * 通用异步请求三态封装（loading / success / error）
 * 用于页面级加载状态展示（skeleton loading）
 */
export interface UseLoadingReturn<T> {
  /** 响应式数据 */
  data: Ref<T | null>;
  /** 是否正在加载 */
  loading: Ref<boolean>;
  /** 错误信息 */
  error: Ref<string | null>;
  /** 执行异步操作 */
  execute: (...args: unknown[]) => Promise<T | null>;
  /** 重置状态 */
  reset: () => void;
}

export interface UseLoadingOptions<T> {
  /** 初始数据 */
  initialValue?: T | null;
  /** 是否立即执行 */
  immediate?: boolean;
  /** 立即执行时的参数 */
  immediateArgs?: unknown[];
  /** 成功回调 */
  onSuccess?: (data: T) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
}

export function useLoading<T>(
  asyncFn: (...args: unknown[]) => Promise<T>,
  options: UseLoadingOptions<T> = {}
): UseLoadingReturn<T> {
  const data = ref<T | null>(options.initialValue ?? null) as Ref<T | null>;
  const loading = ref(false);
  const error = ref<string | null>(null);

  const execute = async (...args: unknown[]): Promise<T | null> => {
    loading.value = true;
    error.value = null;
    try {
      const result = await asyncFn(...args);
      data.value = result;
      options.onSuccess?.(result);
      return result;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      error.value = errMsg;
      options.onError?.(e instanceof Error ? e : new Error(errMsg));
      return null;
    } finally {
      loading.value = false;
    }
  };

  const reset = () => {
    data.value = options.initialValue ?? null;
    loading.value = false;
    error.value = null;
  };

  // 立即执行
  if (options.immediate) {
    void execute(...(options.immediateArgs || []));
  }

  return {
    data: readonly(data) as Ref<T | null>,
    loading: readonly(loading),
    error: readonly(error),
    execute,
    reset,
  };
}

/**
 * 离线状态检测 composable
 * 监听 online/offline 事件，提供实时网络状态
 */
export interface UseNetworkReturn {
  /** 是否在线 */
  isOnline: Ref<boolean>;
}

export function useNetwork(): UseNetworkReturn {
  const isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true);

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      isOnline.value = true;
    });

    window.addEventListener('offline', () => {
      isOnline.value = false;
    });
  }

  return {
    isOnline: readonly(isOnline),
  };
}
