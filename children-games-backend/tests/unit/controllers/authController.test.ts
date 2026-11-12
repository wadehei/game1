import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ─── Mocks ────────────────
vi.mock('../../../src/models', () => ({
  User: {
    findByPk: vi.fn(),
  },
}));

vi.mock('../../../src/utils/auth', () => ({
  verifyRefreshToken: vi.fn(),
}));

vi.mock('../../../src/utils/logger', () => ({
  logWarn: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock('../../../src/services/tokenService', () => ({
  validateRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  revokeAllRefreshTokens: vi.fn(),
  generateTokenPair: vi.fn(),
  logout: vi.fn(),
  blacklistToken: vi.fn(),
}));

import { refreshAccessToken } from '../../../src/controllers/authController';
import { verifyRefreshToken } from '../../../src/utils/auth';
import {
  validateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  generateTokenPair,
} from '../../../src/services/tokenService';
import { User } from '../../../src/models';
import type { AppError } from '../../../src/errors/AppError';

const mockRes = (): Response =>
  ({
    statusCode: 200,
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  }) as unknown as Response;

const makeReq = (body: unknown): Request => ({ body }) as unknown as Request;

/** asyncHandler 把异常抛给 next(err) 且不回传内部 promise；
 *  调用后等微任务清空（mock 均为 microtask），再断言 */
const run = async (body: unknown) => {
  const res = mockRes();
  const next: NextFunction = vi.fn();
  void refreshAccessToken(makeReq(body), res, next);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  return { res, next };
};

const statusCodeOf = (next: Mock): number => {
  const err = next.mock.calls[0]?.[0] as AppError | undefined;
  return err?.statusCode ?? 0;
};

describe('authController.refreshAccessToken（rotation 模式）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('缺少 refreshToken 返回 400', async () => {
    const { next } = await run({});
    expect(next).toHaveBeenCalledTimes(1);
    expect(statusCodeOf(next)).toBe(400);
  });

  it('签名无效返回 401，不触发全量撤销', async () => {
    (verifyRefreshToken as Mock).mockReturnValue(null);
    const { next } = await run({ refreshToken: 'bad' });
    expect(next).toHaveBeenCalledTimes(1);
    expect(statusCodeOf(next)).toBe(401);
    expect(revokeAllRefreshTokens).not.toHaveBeenCalled();
  });

  it('有效刷新：轮换签发全新 token 对并撤销旧 refresh token', async () => {
    (verifyRefreshToken as Mock).mockReturnValue({ jti: 'old-jti', userId: 7 });
    (validateRefreshToken as Mock).mockResolvedValue(7);
    (User.findByPk as Mock).mockResolvedValue({ id: 7 });
    (generateTokenPair as Mock).mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 900,
    });

    const { res, next } = await run({ refreshToken: 'old-token' });

    expect(next).not.toHaveBeenCalled();
    expect(revokeRefreshToken).toHaveBeenCalledWith('old-jti');
    expect(generateTokenPair).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    expect(res.json).toHaveBeenCalledWith({
      code: 200,
      message: 'success',
      data: { accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 900 },
    });
  });

  it('重用检测：签名合法但已轮换 → 撤销该用户全部会话并 401', async () => {
    (verifyRefreshToken as Mock).mockReturnValue({ jti: 'rotated-jti', userId: 7 });
    (validateRefreshToken as Mock).mockResolvedValue(null);

    const { next } = await run({ refreshToken: 'replayed' });

    expect(next).toHaveBeenCalledTimes(1);
    expect(statusCodeOf(next)).toBe(401);
    expect(revokeAllRefreshTokens).toHaveBeenCalledWith(7);
  });

  it('服务端记录与 JWT 的 userId 不一致 → 401（防篡改）', async () => {
    (verifyRefreshToken as Mock).mockReturnValue({ jti: 'jti-x', userId: 7 });
    (validateRefreshToken as Mock).mockResolvedValue(99);
    (User.findByPk as Mock).mockResolvedValue({ id: 7 });

    const { next } = await run({ refreshToken: 'tampered' });
    expect(statusCodeOf(next)).toBe(401);
    expect(generateTokenPair).not.toHaveBeenCalled();
  });
});
