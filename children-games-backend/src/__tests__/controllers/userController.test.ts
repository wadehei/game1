import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, type RequestHandler } from 'express';
import { getUserInfo, updateUserInfo } from '../../controllers/userController';
import { AuthRequest } from '../../middleware/auth';
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
  NotFoundError: class NotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'NotFoundError';
    }
  },
}));
vi.mock('../../config/constants', () => ({
  AVATAR_HISTORY_LIMIT: 10,
}));

describe('userController', () => {
  let mockReq: AuthRequest;
  let mockRes: Response;
  let mockJson: ReturnType<typeof vi.fn>;
  let mockStatus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJson = vi.fn();
    mockStatus = vi.fn().mockReturnValue({ json: mockJson });
    mockRes = {
      status: mockStatus,
      json: mockJson,
    } as unknown as Response;
    mockReq = {
      userId: 123,
    } as AuthRequest;
  });

  describe('getUserInfo', () => {
    it('should return user info when user exists', async () => {
      const mockUser = {
        id: 123,
        nickname: 'TestUser',
        avatar: 'avatar1.png',
        avatarHistory: ['old1.png', 'old2.png'],
        level: 5,
        totalStars: 100,
        battleChips: 1500,
      };
      vi.mocked(models.User.findByPk).mockResolvedValue(mockUser as any);

      await getUserInfo(mockReq, mockRes, () => {});

      expect(models.User.findByPk).toHaveBeenCalledWith(123);
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        code: 200,
        message: 'success',
        data: {
          id: 123,
          nickname: 'TestUser',
          avatar: 'avatar1.png',
          avatarHistory: ['old1.png', 'old2.png'],
          level: 5,
          totalStars: 100,
          battleChips: 1500,
        },
      });
    });

    it('should return default battleChips when null', async () => {
      const mockUser = {
        id: 123,
        nickname: 'TestUser',
        avatar: 'avatar1.png',
        avatarHistory: [],
        level: 1,
        totalStars: 0,
        battleChips: null,
      };
      vi.mocked(models.User.findByPk).mockResolvedValue(mockUser as any);

      await getUserInfo(mockReq, mockRes, () => {});

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            battleChips: 1000,
          }),
        })
      );
    });

    it('should return empty avatarHistory when not array', async () => {
      const mockUser = {
        id: 123,
        nickname: 'TestUser',
        avatar: 'avatar1.png',
        avatarHistory: null,
        level: 1,
        totalStars: 0,
        battleChips: 1000,
      };
      vi.mocked(models.User.findByPk).mockResolvedValue(mockUser as any);

      await getUserInfo(mockReq, mockRes, () => {});

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            avatarHistory: [],
          }),
        })
      );
    });

    it('should throw NotFoundError when user does not exist', async () => {
      vi.mocked(models.User.findByPk).mockResolvedValue(null);

      await expect(getUserInfo(mockReq, mockRes, () => {})).rejects.toThrow('用户不存在');
    });
  });

  describe('updateUserInfo', () => {
    beforeEach(() => {
      mockReq.body = {};
    });

    it('should update nickname', async () => {
      const mockUser = {
        id: 123,
        nickname: 'OldName',
        avatar: 'avatar1.png',
        avatarHistory: [],
        save: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(models.User.findByPk).mockResolvedValue(mockUser as any);
      mockReq.body = { nickname: 'NewName' };

      await updateUserInfo(mockReq, mockRes, () => {});

      expect(mockUser.nickname).toBe('NewName');
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalledWith({
        code: 200,
        message: 'success',
        data: {
          id: 123,
          nickname: 'NewName',
          avatar: 'avatar1.png',
        },
      });
    });

    it('should update avatar and maintain history', async () => {
      const mockUser = {
        id: 123,
        nickname: 'TestUser',
        avatar: 'old.png',
        avatarHistory: ['very_old.png'],
        save: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(models.User.findByPk).mockResolvedValue(mockUser as any);
      mockReq.body = { avatar: 'new.png' };

      await updateUserInfo(mockReq, mockRes, () => {});

      expect(mockUser.avatar).toBe('new.png');
      expect(mockUser.avatarHistory).toEqual(['new.png', 'old.png', 'very_old.png']);
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalledWith({
        code: 200,
        message: 'success',
        data: {
          id: 123,
          nickname: 'TestUser',
          avatar: 'new.png',
          avatarHistory: ['new.png', 'old.png', 'very_old.png'],
        },
      });
    });

    it('should move existing avatar to front when re-used', async () => {
      const mockUser = {
        id: 123,
        nickname: 'TestUser',
        avatar: 'current.png',
        avatarHistory: ['avatar1.png', 'avatar2.png'], // avatar1 in history
        save: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(models.User.findByPk).mockResolvedValue(mockUser as any);
      mockReq.body = { avatar: 'avatar1.png' };

      await updateUserInfo(mockReq, mockRes, () => {});

      // avatar1 should be moved to front (removed from old position, added to front)
      expect(mockUser.avatarHistory[0]).toBe('avatar1.png');
      // current.png should be added to history
      expect(mockUser.avatarHistory).toContain('current.png');
    });

    it('should not change avatar when same as current', async () => {
      const mockUser = {
        id: 123,
        nickname: 'TestUser',
        avatar: 'avatar1.png',
        avatarHistory: [],
        save: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(models.User.findByPk).mockResolvedValue(mockUser as any);
      mockReq.body = { avatar: 'avatar1.png' };

      await updateUserInfo(mockReq, mockRes, () => {});

      expect(mockUser.save).toHaveBeenCalled();
      // avatarHistory should not be in response when not changed
      expect(mockJson).toHaveBeenCalledWith({
        code: 200,
        message: 'success',
        data: {
          id: 123,
          nickname: 'TestUser',
          avatar: 'avatar1.png',
        },
      });
    });

    it('should throw NotFoundError when user does not exist', async () => {
      vi.mocked(models.User.findByPk).mockResolvedValue(null);
      mockReq.body = { nickname: 'NewName' };

      await expect(updateUserInfo(mockReq, mockRes, () => {})).rejects.toThrow('用户不存在');
    });

    it('should handle empty body gracefully', async () => {
      const mockUser = {
        id: 123,
        nickname: 'TestUser',
        avatar: 'avatar1.png',
        avatarHistory: [],
        save: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(models.User.findByPk).mockResolvedValue(mockUser as any);
      mockReq.body = {};

      await updateUserInfo(mockReq, mockRes, () => {});

      expect(mockUser.save).toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalledWith({
        code: 200,
        message: 'success',
        data: {
          id: 123,
          nickname: 'TestUser',
          avatar: 'avatar1.png',
        },
      });
    });
  });
});
