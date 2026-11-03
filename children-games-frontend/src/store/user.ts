import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface UserInfo {
  id: number;
  nickname: string;
  avatar: string;
  level: number;
  totalStars: number;
  /** 好友对战积分（账号资产） */
  battleChips?: number;
}

/** accessToken 在 localStorage 中的 key（沿用旧 key，所有直读方无需改动） */
export const TOKEN_KEY = 'token';
/** refreshToken 在 localStorage 中的 key（长期凭证，仅用于换新 accessToken） */
export const REFRESH_TOKEN_KEY = 'refresh_token';

export const useUserStore = defineStore('user', () => {
  const token = ref<string>(localStorage.getItem(TOKEN_KEY) || '');
  const refreshToken = ref<string>(localStorage.getItem(REFRESH_TOKEN_KEY) || '');
  const stored = localStorage.getItem('userInfo');
  let parsed: UserInfo | null = null;
  if (stored) {
    try {
      parsed = JSON.parse(stored);
    } catch {
      // localStorage 数据损坏，清除后重置
      localStorage.removeItem('userInfo');
    }
  }
  const userInfo = ref<UserInfo | null>(parsed);

  /** 双 token 一起落库（登录响应）；refresh 为空串时清掉旧值 */
  const setTokens = (accessToken: string, refresh: string) => {
    token.value = accessToken;
    refreshToken.value = refresh;
    localStorage.setItem(TOKEN_KEY, accessToken);
    if (refresh) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
    } else {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  };

  /** 仅更新 accessToken（静默刷新后调用） */
  const setToken = (accessToken: string) => {
    token.value = accessToken;
    localStorage.setItem(TOKEN_KEY, accessToken);
  };

  const setUserInfo = (info: UserInfo) => {
    userInfo.value = info;
    localStorage.setItem('userInfo', JSON.stringify(info));
  };

  const logout = () => {
    token.value = '';
    refreshToken.value = '';
    userInfo.value = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem('userInfo');
  };

  const isLoggedIn = () => {
    return !!token.value;
  };

  return {
    token,
    refreshToken,
    userInfo,
    setToken,
    setTokens,
    setUserInfo,
    logout,
    isLoggedIn,
  };
});
