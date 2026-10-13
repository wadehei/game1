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

// 家庭角色登录：uid 登录已有成员（设了口令需带 pin）；nickname+avatar 创建新成员
export const familyLogin = async (data: { uid?: number; pin?: string; nickname?: string; avatar?: string }): Promise<LoginResult> => {
  const result = await api.post<LoginResult>('/user/login/family', data);
  const userStore = useUserStore();
  userStore.setToken(result.token);
  userStore.setUserInfo(result.userInfo);
  return result;
};

export interface FamilyProfile {
  id: number;
  nickname: string;
  avatar: string;
  level: number;
  totalStars: number;
  hasPin?: boolean;
}

// 设置/修改/清除当前角色口令（newPin 空串=清除）
export const updateMyPin = async (data: { oldPin?: string; newPin?: string }): Promise<{ hasPin: boolean }> => {
  return api.put<{ hasPin: boolean }>('/user/pin', data);
};

// 家庭成员列表（按总星星排序）
export const getProfiles = async (): Promise<FamilyProfile[]> => {
  return api.get<FamilyProfile[]>('/user/profiles');
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
