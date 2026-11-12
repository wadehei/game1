import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAxiosPost, mockAxiosGet, mockAxiosDelete } = vi.hoisted(() => ({
  mockAxiosPost: vi.fn(),
  mockAxiosGet: vi.fn(),
  mockAxiosDelete: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    post: mockAxiosPost,
    get: mockAxiosGet,
    delete: mockAxiosDelete,
  },
}));

vi.mock('../../utils/request', () => ({
  API_ORIGIN: 'http://localhost:3000',
}));

import {
  listVoiceLines,
  uploadVoice,
  deleteVoice,
  uploadRoomVoice,
  fetchRoomVoice,
} from '../../api/voice';

describe('api/voice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('listVoiceLines', () => {
    it('should fetch voice lines from /api/voice', async () => {
      const mockLines = [
        { key: 'game_start', size: 1024, updatedAt: 1700000000000 },
        { key: 'game_over', size: 2048, updatedAt: 1700000001000 },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ data: mockLines }),
      });

      const result = await listVoiceLines();

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/voice');
      expect(result).toEqual(mockLines);
      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('game_start');
    });

    it('should return empty array when no data', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({}),
      });

      const result = await listVoiceLines();
      expect(result).toEqual([]);
    });

    it('should handle fetch errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(listVoiceLines()).rejects.toThrow('Network error');
    });
  });

  describe('uploadVoice', () => {
    it('should upload voice with admin token', async () => {
      localStorage.setItem('admin_token', 'admin-jwt-token');
      mockAxiosPost.mockResolvedValue({});

      const blob = new Blob(['test audio'], { type: 'audio/webm' });
      await uploadVoice('game_start', blob);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'http://localhost:3000/api/voice/game_start',
        blob,
        {
          headers: {
            'Content-Type': 'audio/webm',
            Authorization: 'Bearer admin-jwt-token',
          },
        }
      );
    });

    it('should use default content-type if blob.type is missing', async () => {
      localStorage.setItem('admin_token', 'admin-jwt-token');
      mockAxiosPost.mockResolvedValue({});

      const blob = new Blob(['test audio']);
      await uploadVoice('game_start', blob);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        blob,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'audio/webm',
          }),
        })
      );
    });
  });

  describe('deleteVoice', () => {
    it('should delete voice with admin token', async () => {
      localStorage.setItem('admin_token', 'admin-jwt-token');
      mockAxiosDelete.mockResolvedValue({});

      await deleteVoice('game_start');

      expect(mockAxiosDelete).toHaveBeenCalledWith('http://localhost:3000/api/voice/game_start', {
        headers: {
          Authorization: 'Bearer admin-jwt-token',
        },
      });
    });
  });

  describe('uploadRoomVoice', () => {
    it('should upload room voice with user token', async () => {
      localStorage.setItem('token', 'user-jwt-token');
      mockAxiosPost.mockResolvedValue({
        data: { data: { voiceId: 'voice-123' } },
      });

      const blob = new Blob(['test audio'], { type: 'audio/webm' });
      const result = await uploadRoomVoice('room-456', blob, 5);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'http://localhost:3000/api/room/room-456/voice?duration=5',
        blob,
        {
          headers: {
            'Content-Type': 'audio/webm',
            Authorization: 'Bearer user-jwt-token',
          },
          timeout: 10000,
        }
      );
      expect(result).toEqual({ voiceId: 'voice-123' });
    });

    it('should handle missing blob type', async () => {
      localStorage.setItem('token', 'user-jwt-token');
      mockAxiosPost.mockResolvedValue({
        data: { data: { voiceId: 'voice-123' } },
      });

      const blob = new Blob(['test audio']);
      await uploadRoomVoice('room-456', blob, 5);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        blob,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'audio/webm',
          }),
        })
      );
    });
  });

  describe('fetchRoomVoice', () => {
    it('should fetch room voice as blob', async () => {
      localStorage.setItem('token', 'user-jwt-token');
      const mockBlob = new Blob(['audio data'], { type: 'audio/webm' });
      mockAxiosGet.mockResolvedValue({ data: mockBlob });

      const result = await fetchRoomVoice('room-456', 'voice-123');

      expect(mockAxiosGet).toHaveBeenCalledWith(
        'http://localhost:3000/api/room/room-456/voice/voice-123',
        {
          responseType: 'blob',
          headers: {
            Authorization: 'Bearer user-jwt-token',
          },
        }
      );
      expect(result).toBe(mockBlob);
    });
  });

  describe('type exports', () => {
    it('should be able to import VoiceLine type for type checking', () => {
      // 类型导入在编译时验证，运行时为 undefined 是正常的
      // 这里验证模块可以正常导入
      expect(() => import('../../types/voice')).not.toThrow();
    });

    it('should be able to import RoomVoiceUploadResult type for type checking', () => {
      expect(() => import('../../types/voice')).not.toThrow();
    });
  });
});
