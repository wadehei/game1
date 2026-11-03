import axios from 'axios';
import { API_ORIGIN } from './apiOrigin';

export { API_ORIGIN };

const BASE_URL = `${API_ORIGIN}/api`;

const instance = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

// 请求拦截器：附加登录 token（家庭角色登录后存在 localStorage）
instance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── 401 静默刷新（single-flight：并发 401 共享同一次刷新） ────────────────────
let refreshing: Promise<string> | null = null;

const tryRefresh = (): Promise<string> => {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) throw new Error('无 refreshToken');
      // 独立 axios 调用，避免再次进入本实例的 401 拦截逻辑
      const resp = await axios.post(
        `${BASE_URL}/user/refresh`,
        { refreshToken },
        { timeout: 10000 }
      );
      const envelope = resp.data as { code?: number; data?: { accessToken?: string } };
      const newToken = envelope?.data?.accessToken;
      if (envelope?.code !== 200 || !newToken) throw new Error('刷新失败');
      localStorage.setItem('token', newToken);
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
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('userInfo');
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
