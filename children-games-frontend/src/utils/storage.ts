/**
 * 本地存储抽象层
 * 提供统一的存储接口，便于测试和未来迁移
 */

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

/**
 * 默认适配器：使用 localStorage
 */
class LocalStorageAdapter implements StorageAdapter {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error('[Storage] getItem error:', error);
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error('[Storage] setItem error:', error);
    }
  }

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('[Storage] removeItem error:', error);
    }
  }

  clear(): void {
    try {
      localStorage.clear();
    } catch (error) {
      console.error('[Storage] clear error:', error);
    }
  }
}

/**
 * 内存适配器：用于测试或 SSR 环境
 */
class MemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * 创建存储实例
 * 根据环境自动选择合适的适配器
 */
function createStorage(): StorageAdapter {
  // SSR 环境或 localStorage 不可用时使用内存存储
  if (typeof window === 'undefined' || !window.localStorage) {
    return new MemoryStorageAdapter();
  }
  return new LocalStorageAdapter();
}

/**
 * 全局存储实例
 */
export const storage = createStorage();

/**
 * 类型安全的存储辅助函数
 */
export const storageUtils = {
  /**
   * 获取 JSON 数据
   */
  getJSON<T>(key: string): T | null {
    const value = storage.getItem(key);
    if (value === null) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  },

  /**
   * 设置 JSON 数据
   */
  setJSON<T>(key: string, value: T): void {
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('[Storage] setJSON error:', error);
    }
  },

  /**
   * 获取数字
   */
  getNumber(key: string): number | null {
    const value = storage.getItem(key);
    if (value === null) return null;
    const num = Number(value);
    return Number.isNaN(num) ? null : num;
  },

  /**
   * 获取布尔值
   */
  getBoolean(key: string): boolean {
    const value = storage.getItem(key);
    return value === 'true' || value === '1';
  },
};
