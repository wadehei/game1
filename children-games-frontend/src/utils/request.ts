import axios from 'axios';

const BASE_URL = '/api';

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

// 响应拦截器：统一解包 { code, message, data }，401 时清除失效凭证
instance.interceptors.response.use(
  (response) => {
    const data = response.data;
    if (data.code === 200) {
      return data.data;
    }
    throw new Error(data.message || '请求失败');
  },
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('userInfo');
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
