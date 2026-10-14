import { api } from '../utils/request';
import { useUserStore } from '../store/user';

interface LoginResult {
  token: string;
  userInfo: {
    id: number;
    nickname: string;
    avatar: string;
    avatarHistory?: string[];
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
  // 记住"上次是谁"：token 失效后选角色页能标记/自动重登
  try {
    localStorage.setItem('last_profile_id', String(result.userInfo.id));
  } catch {
    // ignore
  }
  return result;
};

/** 上次使用的角色 id（登录时记录，登出不删除——重新打开应用可无感恢复） */
export const getLastProfileId = (): number | null => {
  try {
    const v = parseInt(localStorage.getItem('last_profile_id') || '', 10);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
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

// ─── 我的生涯 ────────────────────────────────

export interface CareerGame {
  gameId: string;
  currentLevel: number;
  stars: number;
  highScore: number;
  playCount: number;
  winCount: number;
  lastPlayedAt: string | null;
}

export interface MyCareer {
  user: {
    id: number;
    nickname: string;
    avatar: string;
    level: number;
    totalStars: number;
    joinedAt: string;
  };
  totals: {
    playSeconds: number;
    playDays: number;
    playCount: number;
    winCount: number;
    achievementCount: number;
    rewardStars: number;
  };
  last7?: { date: string; label: string; seconds: number }[];
  games: CareerGame[];
}

export const getMyCareer = async (): Promise<MyCareer> => {
  return api.get<MyCareer>('/user/career');
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
