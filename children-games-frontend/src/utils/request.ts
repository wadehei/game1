import axios from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { API_ORIGIN } from './apiOrigin';
import { storage } from '@/utils/storage';
import { showToast } from '@/utils/toastBus';

export { API_ORIGIN };

const BASE_URL = `${API_ORIGIN}/api`;

const instance = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

// 请求拦截器：附加登录 token（家庭角色登录后存在 localStorage）
instance.interceptors.request.use((config) => {
  const token = storage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── 401 静默刷新（single-flight：并发 401 共享同一次刷新） ────────────────────
let refreshing: Promise<string> | null = null;
let authExpiredHandled = false;

const tryRefresh = async (): Promise<string> => {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = storage.getItem('refresh_token');
      if (!refreshToken) throw new Error('无 refreshToken');
      // 独立 axios 调用，避免再次进入本实例的 401 拦截逻辑
      const resp = await axios.post(
        `${BASE_URL}/user/refresh`,
        { refreshToken },
        { timeout: 10000 }
      );
      const envelope = resp.data as {
        code?: number;
        data?: { accessToken?: string; refreshToken?: string };
      };
      const newToken = envelope?.data?.accessToken;
      if (envelope?.code !== 200 || !newToken) throw new Error('刷新失败');

      // 通过 store 更新 token，保持响应式状态同步
      const { useUserStore } = await import('@/store/user');
      const userStore = useUserStore();
      userStore.setTokens(newToken, envelope.data?.refreshToken || refreshToken);
      authExpiredHandled = false;

      return newToken;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
};

// 响应拦截器：统一解包 { code, message, data }；401 时先静默刷新重试一次，失败才清除凭证
instance.interceptors.response.use(
  (response) => {
    const data = response.data;
    if (data.code === 200) {
      return data.data;
    }
    throw new Error(data.message || '请求失败');
  },
  async (error) => {
    const status = error?.response?.status;
    const original = error?.config ?? {};
    const isRefreshCall = String(original?.url || '').includes('/user/refresh');

    if (status === 401 && !original._retried && !isRefreshCall) {
      try {
        const newToken = await tryRefresh();
        original._retried = true;
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return instance.request(original);
      } catch {
        // 刷新失败 → 走下方清理逻辑
      }
    }

    if (status === 401) {
      // 通过 store 清除凭证，保持响应式状态同步
      const { useUserStore } = await import('@/store/user');
      const userStore = useUserStore();
      userStore.logout();
      // 登录过期提示 + 跳转角色选择页（防循环 + 防重复触发）
      if (!authExpiredHandled && location.hash !== '#/profiles') {
        authExpiredHandled = true;
        showToast('登录已过期，请重新选择角色', 'error');
        const currentHash = location.hash.replace(/^#\/?/, '');
        const redirect = currentHash ? `?redirect=${encodeURIComponent(currentHash)}` : '';
        location.hash = `#/profiles${redirect}`;
      }
    }
    throw error;
  }
);

export const api = {
  // 响应拦截器已解包为 res.data.data，这里将类型对齐为直接返回业务数据
  get: <T = unknown>(url: string, params?: Record<string, unknown>) =>
    instance.get(url, { params }) as Promise<T>,
  post: <T = unknown>(url: string, data?: unknown) => instance.post(url, data) as Promise<T>,
  put: <T = unknown>(url: string, data?: unknown) => instance.put(url, data) as Promise<T>,
  delete: <T = unknown>(url: string, data?: unknown) =>
    instance.delete(url, { data }) as Promise<T>,
};

// ─── 创建自定义 API 客户端（供 admin 等独立模块使用）────────────────────
export interface CreateApiClientOptions {
  baseURL: string;
  tokenKey: string;
  timeout?: number;
  onUnauthorized?: () => void;
}

export interface ApiClient {
  get: <T = unknown>(url: string, params?: Record<string, unknown>) => Promise<T>;
  post: <T = unknown>(url: string, data?: unknown) => Promise<T>;
  put: <T = unknown>(url: string, data?: unknown) => Promise<T>;
  delete: <T = unknown>(url: string) => Promise<T>;
  /** 同 baseURL/token 但不做 {code,data} 解包的实例——blob 上传/下载等拿原始 AxiosResponse */
  raw: AxiosInstance;
}

/**
 * 创建带统一拦截器的 API 客户端
 * - 自动附加 token
 * - 自动解包 { code, data, message } 响应
 * - 401 时触发 onUnauthorized 回调
 */
export function createApiClient(options: CreateApiClientOptions): ApiClient {
  const { baseURL, tokenKey, timeout = 15000, onUnauthorized } = options;

  const client = axios.create({ baseURL, timeout });
  // raw 实例：带 baseURL + token，但不挂响应解包拦截器（blob 响应会被 unwrap 炸掉）。
  // 注意不能写成 `raw: axios`（全局实例无 baseURL，生产同源部署下丢 /api 前缀 404）
  const rawClient = axios.create({ baseURL, timeout });

  const withToken = (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    const token = storage.getItem(tokenKey);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  };
  client.interceptors.request.use(withToken);
  rawClient.interceptors.request.use(withToken);

  const unwrap = <T>(response: { data: { code: number; data: T; message?: string } }): T => {
    const { data } = response;
    if (data.code === 200) {
      return data.data;
    }
    throw new Error(data.message || `API error: code ${data.code}`);
  };

  client.interceptors.response.use(
    (response) => unwrap(response),
    (error) => {
      if (error?.response?.status === 401) {
        storage.removeItem(tokenKey);
        onUnauthorized?.();
      }
      throw error;
    }
  );

  return {
    get: <T = unknown>(url: string, params?: Record<string, unknown>) =>
      client.get(url, { params }).then((r) => r as unknown as T),
    post: <T = unknown>(url: string, data?: unknown) =>
      client.post(url, data).then((r) => r as unknown as T),
    put: <T = unknown>(url: string, data?: unknown) =>
      client.put(url, data).then((r) => r as unknown as T),
    delete: <T = unknown>(url: string) => client.delete(url).then((r) => r as unknown as T),
    raw: rawClient,
  };
}
