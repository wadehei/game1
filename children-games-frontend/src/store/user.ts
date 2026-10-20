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

export const useUserStore = defineStore('user', () => {
  const token = ref<string>(localStorage.getItem('token') || '');
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

  const setToken = (newToken: string) => {
    token.value = newToken;
    localStorage.setItem('token', newToken);
  };

  const setUserInfo = (info: UserInfo) => {
    userInfo.value = info;
    localStorage.setItem('userInfo', JSON.stringify(info));
  };

  const logout = () => {
    token.value = '';
    userInfo.value = null;
    localStorage.removeItem('token');
    localStorage.removeItem('userInfo');
  };

  const isLoggedIn = () => {
    return !!token.value;
  };

  return {
    token,
    userInfo,
    setToken,
    setUserInfo,
    logout,
    isLoggedIn,
  };
});
