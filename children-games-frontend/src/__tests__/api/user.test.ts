import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// Mock request module
vi.mock('../../utils/request', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { api } from '../../utils/request';
import {
  testLogin,
  familyLogin,
  getLastProfileId,
  updateMyPin,
  getMyCareer,
  getProfiles,
  getUserInfo,
  updateUserInfo,
} from '../../api/user';

const mockedApi = vi.mocked(api);

describe('api/user', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('testLogin', () => {
    it('should call api.post with correct params and update store', async () => {
      const mockResult = {
        accessToken: 'test-token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
        userInfo: {
          id: 1,
          nickname: 'Test User',
          avatar: 'avatar.png',
          level: 1,
          totalStars: 0,
        },
      };
      mockedApi.post.mockResolvedValue(mockResult);

      const result = await testLogin('Test User');

      expect(mockedApi.post).toHaveBeenCalledWith('/user/login/test', {
        nickname: 'Test User',
      });
      expect(result).toEqual(mockResult);
      expect(localStorage.getItem('token')).toBe('test-token');
      expect(localStorage.getItem('refresh_token')).toBe('refresh-token');
      expect(localStorage.getItem('userInfo')).toBeTruthy();
    });

    it('should work without nickname parameter', async () => {
      const mockResult = {
        accessToken: 'test-token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
        userInfo: {
          id: 1,
          nickname: 'Guest',
          avatar: 'avatar.png',
          level: 1,
          totalStars: 0,
        },
      };
      mockedApi.post.mockResolvedValue(mockResult);

      await testLogin();

      expect(mockedApi.post).toHaveBeenCalledWith('/user/login/test', {
        nickname: undefined,
      });
    });
  });

  describe('familyLogin', () => {
    it('should call api.post and save last_profile_id', async () => {
      const mockResult = {
        accessToken: 'family-token',
        refreshToken: 'family-refresh',
        expiresIn: 900,
        userInfo: {
          id: 42,
          nickname: 'Child',
          avatar: 'child.png',
          level: 2,
          totalStars: 10,
        },
      };
      mockedApi.post.mockResolvedValue(mockResult);

      const result = await familyLogin({ uid: 42, pin: '1234' });

      expect(mockedApi.post).toHaveBeenCalledWith('/user/login/family', {
        uid: 42,
        pin: '1234',
      });
      expect(result).toEqual(mockResult);
      expect(localStorage.getItem('last_profile_id')).toBe('42');
      expect(localStorage.getItem('token')).toBe('family-token');
      expect(localStorage.getItem('refresh_token')).toBe('family-refresh');
    });

    it('should create new member with nickname and avatar', async () => {
      const mockResult = {
        accessToken: 'new-token',
        refreshToken: 'new-refresh',
        expiresIn: 900,
        userInfo: {
          id: 43,
          nickname: 'New Child',
          avatar: 'new.png',
          level: 1,
          totalStars: 0,
        },
      };
      mockedApi.post.mockResolvedValue(mockResult);

      await familyLogin({ nickname: 'New Child', avatar: 'new.png' });

      expect(mockedApi.post).toHaveBeenCalledWith('/user/login/family', {
        nickname: 'New Child',
        avatar: 'new.png',
      });
      expect(localStorage.getItem('last_profile_id')).toBe('43');
    });
  });

  describe('getLastProfileId', () => {
    it('should return null when no last_profile_id', () => {
      expect(getLastProfileId()).toBeNull();
    });

    it('should return parsed id when valid', () => {
      localStorage.setItem('last_profile_id', '42');
      expect(getLastProfileId()).toBe(42);
    });

    it('should return null for invalid id', () => {
      localStorage.setItem('last_profile_id', 'invalid');
      expect(getLastProfileId()).toBeNull();
    });

    it('should return null for zero or negative', () => {
      localStorage.setItem('last_profile_id', '0');
      expect(getLastProfileId()).toBeNull();

      localStorage.setItem('last_profile_id', '-1');
      expect(getLastProfileId()).toBeNull();
    });
  });

  describe('updateMyPin', () => {
    it('should call api.put with pin data', async () => {
      mockedApi.put.mockResolvedValue({ hasPin: true });

      const result = await updateMyPin({ oldPin: '1234', newPin: '5678' });

      expect(mockedApi.put).toHaveBeenCalledWith('/user/pin', {
        oldPin: '1234',
        newPin: '5678',
      });
      expect(result).toEqual({ hasPin: true });
    });

    it('should clear pin when newPin is empty', async () => {
      mockedApi.put.mockResolvedValue({ hasPin: false });

      const result = await updateMyPin({ oldPin: '1234', newPin: '' });

      expect(mockedApi.put).toHaveBeenCalledWith('/user/pin', {
        oldPin: '1234',
        newPin: '',
      });
      expect(result.hasPin).toBe(false);
    });
  });

  describe('getMyCareer', () => {
    it('should call api.get and return career data', async () => {
      const mockCareer = {
        user: {
          id: 1,
          nickname: 'Test',
          avatar: 'test.png',
          level: 5,
          totalStars: 100,
          joinedAt: '2024-01-01',
        },
        totals: {
          playSeconds: 3600,
          playDays: 10,
          playCount: 50,
          winCount: 25,
          achievementCount: 5,
          rewardStars: 50,
        },
        games: [],
      };
      mockedApi.get.mockResolvedValue(mockCareer);

      const result = await getMyCareer();

      expect(mockedApi.get).toHaveBeenCalledWith('/user/career');
      expect(result).toEqual(mockCareer);
    });
  });

  describe('getProfiles', () => {
    it('should return family profiles', async () => {
      const mockProfiles = [
        {
          id: 1,
          nickname: 'Child 1',
          avatar: 'c1.png',
          level: 3,
          totalStars: 30,
        },
        {
          id: 2,
          nickname: 'Child 2',
          avatar: 'c2.png',
          level: 2,
          totalStars: 20,
        },
      ];
      mockedApi.get.mockResolvedValue(mockProfiles);

      const result = await getProfiles();

      expect(mockedApi.get).toHaveBeenCalledWith('/user/profiles');
      expect(result).toEqual(mockProfiles);
      expect(result).toHaveLength(2);
    });
  });

  describe('getUserInfo', () => {
    it('should fetch and update store with user info', async () => {
      const mockInfo = {
        id: 1,
        nickname: 'Updated Name',
        avatar: 'updated.png',
        level: 3,
        totalStars: 50,
      };
      mockedApi.get.mockResolvedValue(mockInfo);

      const result = await getUserInfo();

      expect(mockedApi.get).toHaveBeenCalledWith('/user/info');
      expect(result).toEqual(mockInfo);
      expect(localStorage.getItem('userInfo')).toBeTruthy();
    });
  });

  describe('updateUserInfo', () => {
    it('should call api.put with update data', async () => {
      mockedApi.put.mockResolvedValue({ success: true });

      const result = await updateUserInfo({
        nickname: 'New Name',
        avatar: 'new.png',
      });

      expect(mockedApi.put).toHaveBeenCalledWith('/user/info', {
        nickname: 'New Name',
        avatar: 'new.png',
      });
      expect(result).toEqual({ success: true });
    });

    it('should support partial updates', async () => {
      mockedApi.put.mockResolvedValue({ success: true });

      await updateUserInfo({ nickname: 'Only Name' });

      expect(mockedApi.put).toHaveBeenCalledWith('/user/info', {
        nickname: 'Only Name',
      });
    });
  });
});
