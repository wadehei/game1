import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response, type RequestHandler } from 'express';
import { getStarsLeaderboard } from '../../controllers/gameController';
import { User } from '../../models';

vi.mock('../../models', () => ({
  User: { findAll: vi.fn() },
}));
vi.mock('../../utils/response', () => ({
  success: vi.fn((res: Response, data: unknown) => {
    res.status(200).json({ code: 200, message: 'success', data });
  }),
  asyncHandler: (fn: RequestHandler) => fn,
}));
vi.mock('../../errors/AppError', () => ({
  BadRequestError: class BadRequestError extends Error {
    statusCode = 400;
  },
}));
vi.mock('../../services/leaderboardCacheService', () => ({
  getCachedLeaderboard: vi.fn(),
  cacheLeaderboard: vi.fn(),
  invalidateLeaderboardCache: vi.fn(),
}));

describe('getStarsLeaderboard', () => {
  const mkRes = (): Response => {
    const res = {
      statusCode: 200,
      jsonBody: null,
      status(c: number) {
        this.statusCode = c;
        return this;
      },
      json(b: unknown) {
        this.jsonBody = b;
        return this;
      },
    };
    return res as unknown as Response;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('只查 family 用户并按 totalStars 降序，附 rank', async () => {
    vi.mocked(User.findAll).mockResolvedValue([
      { id: 2, nickname: '姐姐', avatar: '🐰', totalStars: 90, level: 7 },
      { id: 1, nickname: '弟弟', avatar: '🐼', totalStars: 30, level: 3 },
    ] as never);
    const res = mkRes();
    await getStarsLeaderboard({ query: {} } as never, res, () => {});

    expect(User.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ openid: expect.objectContaining({}) }),
        limit: 50, // LEADERBOARD_DEFAULT_LIMIT
      })
    );
    const data = (res.jsonBody as { data: Array<{ rank: number; totalStars: number }> }).data;
    expect(data[0].rank).toBe(1);
    expect(data[0].totalStars).toBe(90);
    expect(data[1].rank).toBe(2);
  });

  it('limit 超界收敛到上限', async () => {
    vi.mocked(User.findAll).mockResolvedValue([] as never);
    const res = mkRes();
    await getStarsLeaderboard({ query: { limit: '99999' } } as never, res, () => {});
    const call = vi.mocked(User.findAll).mock.calls[0][0] as { limit: number };
    expect(call.limit).toBeLessThanOrEqual(100); // LEADERBOARD_MAX_LIMIT
    expect(res.jsonBody).toMatchObject({ code: 200, data: [] });
  });
});
