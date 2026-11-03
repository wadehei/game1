import { api } from '../utils/request';
import { useUserStore, type UserInfo } from '../store/user';

interface LoginResult {
  /** 短期访问凭证（15 分钟），所有请求的 Bearer token */
  accessToken: string;
  /** 长期刷新凭证（30 天），仅用于换取新 accessToken */
  refreshToken: string;
  /** accessToken 有效期（秒） */
  expiresIn: number;
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
  userStore.setTokens(result.accessToken, result.refreshToken);
  userStore.setUserInfo(result.userInfo);
  return result;
};

// 家庭角色登录：uid 登录已有成员（设了口令需带 pin）；nickname+avatar 创建新成员
export const familyLogin = async (data: {
  uid?: number;
  pin?: string;
  nickname?: string;
  avatar?: string;
}): Promise<LoginResult> => {
  const result = await api.post<LoginResult>('/user/login/family', data);
  const userStore = useUserStore();
  userStore.setTokens(result.accessToken, result.refreshToken);
  userStore.setUserInfo(result.userInfo);
  // 记住"上次是谁"：token 失效后选角色页能标记/自动重登
  try {
    localStorage.setItem('last_profile_id', String(result.userInfo.id));
  } catch {
    // ignore
  }
  return result;
};

/**
 * 通知后端登出（撤销 refresh token + 黑名单当前 access token）
 * 失败静默：本地凭证清理不受影响
 */
export const logoutNotify = async (): Promise<void> => {
  try {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) return;
    await api.post('/user/logout', { refreshToken });
  } catch {
    // ignore：后端不可达/凭证已失效时无需处理
  }
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
export const updateMyPin = async (data: {
  oldPin?: string;
  newPin?: string;
}): Promise<{ hasPin: boolean }> => {
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
  const result = await api.get<UserInfo>('/user/info');
  userStore.setUserInfo(result);
  return result;
};

// 更新用户信息
export const updateUserInfo = async (data: { nickname?: string; avatar?: string }) => {
  return api.put('/user/info', data);
};
