import axios, { type InternalAxiosRequestConfig } from 'axios';

const BASE_URL = '/api';

const instance = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

// 游客自动登录（防重复）
let guestLoginPromise: Promise<string> | null = null;

const ensureGuestToken = async (): Promise<string> => {
  const cached = localStorage.getItem('token');
  if (cached) return cached;

  if (!guestLoginPromise) {
    guestLoginPromise = (async () => {
      const res = await axios.post(`${BASE_URL}/user/login/test`, { nickname: '小朋友' });
      const token = res.data?.data?.token;
      if (token) {
        localStorage.setItem('token', token);
        localStorage.setItem('userInfo', JSON.stringify(res.data.data.userInfo));
        // 同步到 userStore
        try {
          const { useUserStore } = await import('@/store/user');
          const store = useUserStore();
          store.setToken(token);
          store.setUserInfo(res.data.data.userInfo);
        } catch {
          // store 可能未初始化，忽略
        }
      }
      return token;
    })();
  }

  const token = await guestLoginPromise;
  guestLoginPromise = null;
  return token;
};

// 请求拦截器 — 确保有 token 再发送
instance.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    let token = localStorage.getItem('token');
    if (!token) {
      token = await ensureGuestToken();
    }
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器 — 401 时自动刷新 token 并重试
instance.interceptors.response.use(
  (response) => {
    const data = response.data;
    if (data.code === 200) {
      return data.data;
    } else if (data.code === 401) {
      throw new Error(data.message || '未授权');
    } else {
      throw new Error(data.message || '请求失败');
    }
  },
  async (error) => {
    const status = error?.response?.status;
    const originalConfig = error?.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (status === 401 && originalConfig && !originalConfig._retry) {
      originalConfig._retry = true;

      // 清除无效 token，重新获取
      localStorage.removeItem('token');
      localStorage.removeItem('userInfo');

      const newToken = await ensureGuestToken();
      if (newToken && originalConfig.headers) {
        originalConfig.headers.Authorization = `Bearer ${newToken}`;
      }
      return instance(originalConfig);
    }

    throw error;
  }
);

export const api = {
  // 响应拦截器已解包为 res.data.data，这里将类型对齐为直接返回业务数据
  get: <T = any>(url: string, params?: any) => instance.get(url, { params }) as Promise<T>,
  post: <T = any>(url: string, data?: any) => instance.post(url, data) as Promise<T>,
  put: <T = any>(url: string, data?: any) => instance.put(url, data) as Promise<T>,
  delete: <T = any>(url: string, data?: any) => instance.delete(url, { data }) as Promise<T>,
};
