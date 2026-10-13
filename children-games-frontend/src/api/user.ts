import { api } from '../utils/request';
import { useUserStore } from '../store/user';

interface LoginResult {
  token: string;
  userInfo: {
    id: number;
    nickname: string;
    avatar: string;
    level: number;
    totalStars: number;
  };
}

// 测试登录（开发环境）
export const testLogin = async (nickname?: string): Promise<LoginResult> => {
  const result = await api.post<LoginResult>('/user/login/test', { nickname });
  const userStore = useUserStore();
  userStore.setToken(result.token);
  userStore.setUserInfo(result.userInfo);
  return result;
};

// 获取用户信息
export const getUserInfo = async () => {
  const userStore = useUserStore();
  const result = await api.get('/user/info');
  userStore.setUserInfo(result);
  return result;
};

// 更新用户信息
export const updateUserInfo = async (data: { nickname?: string; avatar?: string }) => {
  return api.put('/user/info', data);
};
