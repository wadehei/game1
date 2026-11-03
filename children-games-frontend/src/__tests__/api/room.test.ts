import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

// Mock request module
vi.mock('../../utils/request', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  API_ORIGIN: 'http://localhost:3000',
}));

// Mock axios for direct calls
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

import { api, API_ORIGIN } from '../../utils/request';
import axiosInstance from 'axios';
import {
  getGameList,
  createRoom,
  getBattleCareer,
  uploadRoomVoice,
  fetchRoomVoice,
} from '../../api/room';

const mockedApi = vi.mocked(api);
const mockedAxios = vi.mocked(axiosInstance, true) as unknown as Record<
  'post' | 'get',
  ReturnType<typeof vi.fn>
>;

describe('api/room', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('getGameList', () => {
    it('should fetch available games', async () => {
      const mockGames = [
        {
          type: 'gomoku',
          title: '五子棋',
          emoji: '♟️',
          desc: '经典五子棋',
          minPlayers: 2,
          maxPlayers: 2,
        },
        {
          type: 'quiz',
          title: '答题对战',
          emoji: '❓',
          desc: '知识竞答',
          minPlayers: 2,
          maxPlayers: 4,
        },
      ];
      mockedApi.get.mockResolvedValue(mockGames);

      const result = await getGameList();

      expect(mockedApi.get).toHaveBeenCalledWith('/room/games');
      expect(result).toEqual(mockGames);
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('gomoku');
    });
  });

  describe('createRoom', () => {
    it('should create room with default gameType', async () => {
      const mockResult = { roomId: 'room-123', gameType: 'gomoku' };
      mockedApi.post.mockResolvedValue(mockResult);

      const result = await createRoom();

      expect(mockedApi.post).toHaveBeenCalledWith('/room', {
        gameType: 'gomoku',
        config: undefined,
      });
      expect(result).toEqual(mockResult);
      expect(result.roomId).toBe('room-123');
    });

    it('should create room with custom gameType and config', async () => {
      const mockResult = { roomId: 'room-456', gameType: 'quiz' };
      mockedApi.post.mockResolvedValue(mockResult);

      const result = await createRoom('quiz', { maxPlayers: 4, category: 'math' });

      expect(mockedApi.post).toHaveBeenCalledWith('/room', {
        gameType: 'quiz',
        config: { maxPlayers: 4, category: 'math' },
      });
      expect(result.gameType).toBe('quiz');
    });
  });

  describe('getBattleCareer', () => {
    it('should fetch battle career stats', async () => {
      const mockCareer = {
        chips: 1000,
        games: [
          { gameType: 'gomoku', total: 50, wins: 30 },
          { gameType: 'quiz', total: 20, wins: 12 },
        ],
        recent: [
          {
            gameType: 'gomoku',
            result: 'win',
            chipsDelta: 10,
            chipsAfter: 1010,
            createdAt: '2024-01-15T10:30:00Z',
          },
        ],
      };
      mockedApi.get.mockResolvedValue(mockCareer);

      const result = await getBattleCareer();

      expect(mockedApi.get).toHaveBeenCalledWith('/user/battle/career');
      expect(result).toEqual(mockCareer);
      expect(result.chips).toBe(1000);
      expect(result.games).toHaveLength(2);
      expect(result.recent).toHaveLength(1);
    });

    it('should return empty career for new user', async () => {
      const mockCareer = {
        chips: 0,
        games: [],
        recent: [],
      };
      mockedApi.get.mockResolvedValue(mockCareer);

      const result = await getBattleCareer();

      expect(result.chips).toBe(0);
      expect(result.games).toHaveLength(0);
    });
  });

  describe('uploadRoomVoice', () => {
    it('should upload voice blob and return voiceId', async () => {
      const mockBlob = new Blob(['audio data'], { type: 'audio/webm' });
      const mockResponse = { data: { data: { voiceId: 'voice-123' } } };

      mockedAxios.post.mockResolvedValue(mockResponse);
      localStorage.setItem('token', 'user-token');

      const result = await uploadRoomVoice('room-123', mockBlob, 5000);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${API_ORIGIN}/api/room/room-123/voice?duration=5000`,
        mockBlob,
        {
          headers: {
            'Content-Type': 'audio/webm',
            Authorization: 'Bearer user-token',
          },
          timeout: 10000,
        }
      );
      expect(result).toEqual({ voiceId: 'voice-123' });
    });

    it('should use default content type if not specified', async () => {
      const mockBlob = new Blob(['audio data']);
      const mockResponse = { data: { data: { voiceId: 'voice-456' } } };

      mockedAxios.post.mockResolvedValue(mockResponse);

      await uploadRoomVoice('room-456', mockBlob, 3000);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('voice?duration=3000'),
        expect.any(Blob),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'audio/webm',
          }),
        })
      );
    });
  });

  describe('fetchRoomVoice', () => {
    it('should fetch voice blob', async () => {
      const mockBlob = new Blob(['audio data'], { type: 'audio/webm' });
      const mockResponse = { data: mockBlob };

      mockedAxios.get.mockResolvedValue(mockResponse);
      localStorage.setItem('token', 'user-token');

      const result = await fetchRoomVoice('room-123', 'voice-123');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${API_ORIGIN}/api/room/room-123/voice/voice-123`,
        {
          responseType: 'blob',
          headers: {
            Authorization: 'Bearer user-token',
          },
        }
      );
      expect(result).toBeInstanceOf(Blob);
    });

    it('should handle missing token', async () => {
      const mockBlob = new Blob(['audio data']);
      mockedAxios.get.mockResolvedValue({ data: mockBlob });

      const result = await fetchRoomVoice('room-789', 'voice-789');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('voice/voice-789'),
        expect.objectContaining({
          responseType: 'blob',
        })
      );
      expect(result).toBeInstanceOf(Blob);
    });
  });
});
