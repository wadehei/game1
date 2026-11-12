import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, type RequestHandler } from 'express';
import { getLevelOverride, LEVEL_FIELDS } from '../../controllers/levelController';
import * as models from '../../models';

// Mock dependencies
vi.mock('../../models');
vi.mock('../../utils/response', () => ({
  success: vi.fn((res: Response, data: unknown) => {
    res.status(200).json({ code: 200, message: 'success', data });
  }),
  asyncHandler: (fn: RequestHandler) => fn,
}));
vi.mock('../../errors/AppError', () => ({
  BadRequestError: class BadRequestError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'BadRequestError';
    }
  },
}));

describe('levelController', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockJson: ReturnType<typeof vi.fn>;
  let mockStatus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJson = vi.fn();
    mockStatus = vi.fn().mockReturnValue({ json: mockJson });
    mockRes = {
      status: mockStatus as any,
      json: mockJson as any,
    };
    mockReq = {
      params: {},
    };
  });

  describe('getLevelOverride', () => {
    it('should return override config when level config exists', async () => {
      const mockConfig = JSON.stringify({ pairs: 10, timeLimit: 60 });
      vi.mocked(models.LevelConfig.findOne).mockResolvedValue({
        config: mockConfig,
      } as any);

      mockReq.params = { gameId: 'memory', level: '1' };
      await getLevelOverride(mockReq as Request, mockRes as Response, () => {});

      expect(models.LevelConfig.findOne).toHaveBeenCalledWith({
        where: { gameId: 'memory', level: 1 },
      });
      expect(mockJson).toHaveBeenCalledWith({
        code: 200,
        message: 'success',
        data: {
          gameId: 'memory',
          level: 1,
          override: { pairs: 10, timeLimit: 60 },
        },
      });
    });

    it('should return null override when level config does not exist', async () => {
      vi.mocked(models.LevelConfig.findOne).mockResolvedValue(null);

      mockReq.params = { gameId: 'memory', level: '5' };
      await getLevelOverride(mockReq as Request, mockRes as Response, () => {});

      expect(mockJson).toHaveBeenCalledWith({
        code: 200,
        message: 'success',
        data: {
          gameId: 'memory',
          level: 5,
          override: null,
        },
      });
    });

    it('should throw BadRequestError for invalid gameId', async () => {
      mockReq.params = { gameId: 'invalid_game', level: '1' };

      await expect(
        getLevelOverride(mockReq as Request, mockRes as Response, () => {})
      ).rejects.toThrow('参数无效');
    });

    it('should throw BadRequestError for non-numeric level', async () => {
      mockReq.params = { gameId: 'memory', level: 'abc' };

      await expect(
        getLevelOverride(mockReq as Request, mockRes as Response, () => {})
      ).rejects.toThrow('参数无效');
    });

    it('should throw BadRequestError for level less than 1', async () => {
      mockReq.params = { gameId: 'memory', level: '0' };

      await expect(
        getLevelOverride(mockReq as Request, mockRes as Response, () => {})
      ).rejects.toThrow('参数无效');
    });

    it('should throw BadRequestError for negative level', async () => {
      mockReq.params = { gameId: 'memory', level: '-1' };

      await expect(
        getLevelOverride(mockReq as Request, mockRes as Response, () => {})
      ).rejects.toThrow('参数无效');
    });

    it('should throw BadRequestError for empty gameId', async () => {
      mockReq.params = { gameId: '', level: '1' };

      await expect(
        getLevelOverride(mockReq as Request, mockRes as Response, () => {})
      ).rejects.toThrow('参数无效');
    });

    it('should correctly parse config JSON', async () => {
      const complexConfig = JSON.stringify({
        rows: 5,
        ballSpeed: 3.5,
        paddleWidth: 100,
        lives: 3,
      });
      vi.mocked(models.LevelConfig.findOne).mockResolvedValue({
        config: complexConfig,
      } as any);

      mockReq.params = { gameId: 'brick', level: '10' };
      await getLevelOverride(mockReq as Request, mockRes as Response, () => {});

      expect(mockJson).toHaveBeenCalledWith({
        code: 200,
        message: 'success',
        data: {
          gameId: 'brick',
          level: 10,
          override: {
            rows: 5,
            ballSpeed: 3.5,
            paddleWidth: 100,
            lives: 3,
          },
        },
      });
    });

    it('should accept all games defined in LEVEL_FIELDS', async () => {
      const validGameIds = Object.keys(LEVEL_FIELDS);

      expect(validGameIds).toContain('memory');
      expect(validGameIds).toContain('fruit');
      expect(validGameIds).toContain('puzzle');
      expect(validGameIds).toContain('balloon');
      expect(validGameIds).toContain('tank');
      expect(validGameIds).toContain('mole');
      expect(validGameIds).toContain('simon');
      expect(validGameIds).toContain('math');
      expect(validGameIds).toContain('match');
      expect(validGameIds).toContain('match3');
      expect(validGameIds).toContain('brick');

      // Verify each game doesn't throw BadRequestError for valid gameId
      for (const gameId of validGameIds) {
        vi.mocked(models.LevelConfig.findOne).mockResolvedValue(null);
        mockReq.params = { gameId, level: '1' };

        await expect(
          getLevelOverride(mockReq as Request, mockRes as Response, () => {})
        ).resolves.not.toThrow();
      }
    });
  });

  describe('LEVEL_FIELDS', () => {
    it('should have correct fields for memory game', () => {
      expect(LEVEL_FIELDS['memory']).toEqual(['pairs', 'timeLimit']);
    });

    it('should have correct fields for fruit game', () => {
      expect(LEVEL_FIELDS['fruit']).toEqual([
        'spawnRate',
        'fallSpeed',
        'bombChance',
        'targetScore',
        'lives',
      ]);
    });

    it('should have correct fields for tank game', () => {
      expect(LEVEL_FIELDS['tank']).toContain('enemyCount');
      expect(LEVEL_FIELDS['tank']).toContain('bossLevel');
      expect(LEVEL_FIELDS['tank']).toContain('bossHP');
    });
  });
});
