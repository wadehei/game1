import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useUserStore } from '../../store/user';

describe('store/user', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  describe('initial state', () => {
    it('should initialize with empty token and null userInfo', () => {
      const store = useUserStore();
      expect(store.token).toBe('');
      expect(store.userInfo).toBeNull();
    });

    it('should restore token from localStorage', () => {
      localStorage.setItem('token', 'saved-token');
      const store = useUserStore();
      expect(store.token).toBe('saved-token');
    });

    it('should restore userInfo from localStorage', () => {
      const info = {
        id: 1,
        nickname: 'Test',
        avatar: 'test.png',
        level: 3,
        totalStars: 50,
      };
      localStorage.setItem('userInfo', JSON.stringify(info));
      const store = useUserStore();
      expect(store.userInfo).toEqual(info);
    });

    it('should handle corrupted localStorage data', () => {
      localStorage.setItem('userInfo', 'invalid json');
      const store = useUserStore();
      expect(store.userInfo).toBeNull();
      expect(localStorage.getItem('userInfo')).toBeNull();
    });
  });

  describe('setToken', () => {
    it('should update token value', () => {
      const store = useUserStore();
      store.setToken('new-token');
      expect(store.token).toBe('new-token');
      expect(localStorage.getItem('token')).toBe('new-token');
    });

    it('should overwrite existing token', () => {
      const store = useUserStore();
      store.setToken('first-token');
      store.setToken('second-token');
      expect(store.token).toBe('second-token');
      expect(localStorage.getItem('token')).toBe('second-token');
    });
  });

  describe('setUserInfo', () => {
    it('should update userInfo and persist to localStorage', () => {
      const store = useUserStore();
      const info = {
        id: 42,
        nickname: 'Child',
        avatar: 'child.png',
        level: 2,
        totalStars: 30,
      };
      store.setUserInfo(info);
      expect(store.userInfo).toEqual(info);
      expect(localStorage.getItem('userInfo')).toBeTruthy();
      const parsed = JSON.parse(localStorage.getItem('userInfo')!);
      expect(parsed).toEqual(info);
    });

    it('should overwrite existing userInfo', () => {
      const store = useUserStore();
      const info1 = {
        id: 1,
        nickname: 'First',
        avatar: 'first.png',
        level: 1,
        totalStars: 10,
      };
      const info2 = {
        id: 2,
        nickname: 'Second',
        avatar: 'second.png',
        level: 2,
        totalStars: 20,
      };
      store.setUserInfo(info1);
      store.setUserInfo(info2);
      expect(store.userInfo).toEqual(info2);
    });

    it('should support optional battleChips field', () => {
      const store = useUserStore();
      const info = {
        id: 1,
        nickname: 'Player',
        avatar: 'player.png',
        level: 5,
        totalStars: 100,
        battleChips: 500,
      };
      store.setUserInfo(info);
      expect(store.userInfo?.battleChips).toBe(500);
    });
  });

  describe('logout', () => {
    it('should clear token and userInfo', () => {
      const store = useUserStore();
      store.setToken('test-token');
      store.setUserInfo({
        id: 1,
        nickname: 'Test',
        avatar: 'test.png',
        level: 1,
        totalStars: 0,
      });

      store.logout();

      expect(store.token).toBe('');
      expect(store.userInfo).toBeNull();
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('userInfo')).toBeNull();
    });

    it('should work when already logged out', () => {
      const store = useUserStore();
      store.logout();
      expect(store.token).toBe('');
      expect(store.userInfo).toBeNull();
    });
  });

  describe('isLoggedIn', () => {
    it('should return false when no token', () => {
      const store = useUserStore();
      expect(store.isLoggedIn()).toBe(false);
    });

    it('should return true when token exists', () => {
      const store = useUserStore();
      store.setToken('valid-token');
      expect(store.isLoggedIn()).toBe(true);
    });

    it('should return false after logout', () => {
      const store = useUserStore();
      store.setToken('token');
      store.logout();
      expect(store.isLoggedIn()).toBe(false);
    });

    it('should return true if token restored from localStorage', () => {
      localStorage.setItem('token', 'saved-token');
      const store = useUserStore();
      expect(store.isLoggedIn()).toBe(true);
    });
  });

  describe('reactivity', () => {
    it('should update token state reactively', () => {
      const store = useUserStore();

      store.setToken('token-1');
      expect(store.token).toBe('token-1');

      store.setToken('token-2');
      expect(store.token).toBe('token-2');
    });

    it('should update userInfo state reactively', () => {
      const store = useUserStore();

      store.setUserInfo({
        id: 1,
        nickname: 'Test',
        avatar: 'test.png',
        level: 1,
        totalStars: 0,
      });
      expect(store.userInfo?.nickname).toBe('Test');

      store.setUserInfo({
        id: 1,
        nickname: 'Updated',
        avatar: 'test.png',
        level: 2,
        totalStars: 10,
      });
      expect(store.userInfo?.nickname).toBe('Updated');
    });
  });
});
