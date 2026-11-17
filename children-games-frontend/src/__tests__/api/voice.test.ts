import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockClientGet, mockClientPost, mockClientDelete, mockRawGet, mockRawPost } = vi.hoisted(
  () => ({
    mockClientGet: vi.fn(),
    mockClientPost: vi.fn(),
    mockClientDelete: vi.fn(),
    mockRawGet: vi.fn(),
    mockRawPost: vi.fn(),
  })
);

vi.mock('axios', () => ({
  default: {
    create: () => ({
      get: mockClientGet,
      post: mockClientPost,
      delete: mockClientDelete,
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    }),
  },
}));

vi.mock('../../utils/request', () => ({
  API_ORIGIN: 'http://localhost:3000',
  createApiClient: () => ({
    get: mockClientGet,
    post: mockClientPost,
    put: vi.fn(),
    delete: mockClientDelete,
    raw: {
      get: mockRawGet,
      post: mockRawPost,
      delete: vi.fn(),
    },
  }),
}));

vi.mock('@/utils/storage', () => ({
  storage: {
    getItem: (key: string) => localStorage.getItem(key),
    setItem: (key: string, value: string) => localStorage.setItem(key, value),
    removeItem: (key: string) => localStorage.removeItem(key),
    clear: () => localStorage.clear(),
  },
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

      // client.get returns unwrapped data (simulating interceptor)
      mockClientGet.mockResolvedValue(mockLines);

      const result = await listVoiceLines();

      expect(mockClientGet).toHaveBeenCalledWith('');
      expect(result).toEqual(mockLines);
      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('game_start');
    });

    it('should return empty array when no data', async () => {
      mockClientGet.mockResolvedValue([]);

      const result = await listVoiceLines();
      expect(result).toEqual([]);
    });

    it('should handle fetch errors gracefully', async () => {
      mockClientGet.mockRejectedValue(new Error('Network error'));

      await expect(listVoiceLines()).rejects.toThrow('Network error');
    });
  });

  describe('uploadVoice', () => {
    it('should upload voice with admin token', async () => {
      localStorage.setItem('admin_token', 'admin-jwt-token');
      mockRawPost.mockResolvedValue({});

      const blob = new Blob(['test audio'], { type: 'audio/webm' });
      await uploadVoice('game_start', blob);

      expect(mockRawPost).toHaveBeenCalledWith('/game_start', blob, {
        headers: {
          'Content-Type': 'audio/webm',
          Authorization: 'Bearer admin-jwt-token',
        },
      });
    });

    it('should use default content-type if blob.type is missing', async () => {
      localStorage.setItem('admin_token', 'admin-jwt-token');
      mockRawPost.mockResolvedValue({});

      const blob = new Blob(['test audio']);
      await uploadVoice('game_start', blob);

      expect(mockRawPost).toHaveBeenCalledWith(
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
    it('should delete voice', async () => {
      mockClientDelete.mockResolvedValue({});

      await deleteVoice('game_start');

      expect(mockClientDelete).toHaveBeenCalledWith('/game_start');
    });
  });

  describe('uploadRoomVoice', () => {
    it('should upload room voice with user token', async () => {
      localStorage.setItem('token', 'user-jwt-token');
      mockRawPost.mockResolvedValue({
        data: { data: { voiceId: 'voice-123' } },
      });

      const blob = new Blob(['test audio'], { type: 'audio/webm' });
      const result = await uploadRoomVoice('room-456', blob, 5);

      expect(mockRawPost).toHaveBeenCalledWith('/room/room-456/voice?duration=5', blob, {
        headers: {
          'Content-Type': 'audio/webm',
          Authorization: 'Bearer user-jwt-token',
        },
        timeout: 10000,
      });
      expect(result).toEqual({ voiceId: 'voice-123' });
    });

    it('should handle missing blob type', async () => {
      localStorage.setItem('token', 'user-jwt-token');
      mockRawPost.mockResolvedValue({
        data: { data: { voiceId: 'voice-123' } },
      });

      const blob = new Blob(['test audio']);
      await uploadRoomVoice('room-456', blob, 5);

      expect(mockRawPost).toHaveBeenCalledWith(
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
      mockRawGet.mockResolvedValue({ data: mockBlob });

      const result = await fetchRoomVoice('room-456', 'voice-123');

      expect(mockRawGet).toHaveBeenCalledWith('/room/room-456/voice/voice-123', {
        responseType: 'blob',
        headers: {
          Authorization: 'Bearer user-jwt-token',
        },
      });
      expect(result).toBe(mockBlob);
    });
  });

  describe('type exports', () => {
    it('should be able to import VoiceLine type for type checking', () => {
      expect(() => import('../../types/voice')).not.toThrow();
    });

    it('should be able to import RoomVoiceUploadResult type for type checking', () => {
      expect(() => import('../../types/voice')).not.toThrow();
    });
  });
});
