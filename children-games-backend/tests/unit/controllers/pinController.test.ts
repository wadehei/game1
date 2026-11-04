import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Response, NextFunction } from 'express';

// ─── Mocks ────────────────
vi.mock('../../../src/models', () => ({
  User: {
    findByPk: vi.fn(),
  },
}));

vi.mock('../../../src/services/pinService', () => ({
  isValidPin: vi.fn(),
  verifyPin: vi.fn(),
  hashPin: vi.fn(),
  checkThrottle: vi.fn(),
  recordFail: vi.fn(),
  clearFails: vi.fn(),
}));

import { updateMyPin } from '../../../src/controllers/pinController';
import { User } from '../../../src/models';
import {
  isValidPin,
  verifyPin,
  hashPin,
  checkThrottle,
  recordFail,
  clearFails,
} from '../../../src/services/pinService';
import type { AuthRequest } from '../../../src/middleware/auth';
import type { AppError } from '../../../src/errors/AppError';

const mockRes = (): Response =>
  ({
    statusCode: 200,
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  }) as unknown as Response;

const makeReq = (body: unknown, userId: number): AuthRequest =>
  ({ body, userId }) as unknown as AuthRequest;

const run = async (body: unknown, userId = 1) => {
  const res = mockRes();
  const next: NextFunction = vi.fn();
  void updateMyPin(makeReq(body, userId), res, next);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  return { res, next };
};

const statusCodeOf = (next: Mock): number => {
  const err = next.mock.calls[0]?.[0] as AppError | undefined;
  return err?.statusCode ?? 0;
};

describe('pinController.updateMyPin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('用户不存在返回 404', async () => {
    (User.findByPk as Mock).mockResolvedValue(null);

    const { next } = await run({ newPin: '1234' });
    expect(statusCodeOf(next)).toBe(404);
  });

  it('已有 PIN - 被限流返回 429', async () => {
    const mockUser = { id: 1, pinHash: 'existing-hash', save: vi.fn() };
    (User.findByPk as Mock).mockResolvedValue(mockUser);
    (checkThrottle as Mock).mockReturnValue(Date.now() + 60000);

    const { next } = await run({ oldPin: '1234', newPin: '5678' });
    expect(statusCodeOf(next)).toBe(429);
  });

  it('已有 PIN - 旧 PIN 无效返回 401', async () => {
    const mockUser = { id: 1, pinHash: 'existing-hash', save: vi.fn() };
    (User.findByPk as Mock).mockResolvedValue(mockUser);
    (checkThrottle as Mock).mockReturnValue(null);
    (isValidPin as Mock).mockReturnValue(false);

    const { next } = await run({ oldPin: 'abc', newPin: '5678' });
    expect(statusCodeOf(next)).toBe(401);
    expect(recordFail).toHaveBeenCalledWith(1);
  });

  it('已有 PIN - 旧 PIN 验证失败返回 401', async () => {
    const mockUser = { id: 1, pinHash: 'existing-hash', save: vi.fn() };
    (User.findByPk as Mock).mockResolvedValue(mockUser);
    (checkThrottle as Mock).mockReturnValue(null);
    (isValidPin as Mock).mockReturnValue(true);
    (verifyPin as Mock).mockResolvedValue(false);

    const { next } = await run({ oldPin: '0000', newPin: '5678' });
    expect(statusCodeOf(next)).toBe(401);
    expect(recordFail).toHaveBeenCalledWith(1);
  });

  it('已有 PIN - 验证通过后设置新 PIN', async () => {
    const mockUser = { id: 1, pinHash: 'existing-hash', save: vi.fn() };
    (User.findByPk as Mock).mockResolvedValue(mockUser);
    (checkThrottle as Mock).mockReturnValue(null);
    (isValidPin as Mock).mockReturnValue(true);
    (verifyPin as Mock).mockResolvedValue(true);
    (hashPin as Mock).mockResolvedValue('new-hash');

    const { res, next } = await run({ oldPin: '1234', newPin: '5678' });

    expect(next).not.toHaveBeenCalled();
    expect(clearFails).toHaveBeenCalledWith(1);
    expect(hashPin).toHaveBeenCalledWith('5678');
    expect(mockUser.pinHash).toBe('new-hash');
    expect(mockUser.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 200,
        data: { hasPin: true },
      })
    );
  });

  it('已有 PIN - newPin 为空则清除 PIN', async () => {
    const mockUser = { id: 1, pinHash: 'existing-hash', save: vi.fn() };
    (User.findByPk as Mock).mockResolvedValue(mockUser);
    (checkThrottle as Mock).mockReturnValue(null);
    (isValidPin as Mock).mockReturnValue(true);
    (verifyPin as Mock).mockResolvedValue(true);

    const { res, next } = await run({ oldPin: '1234', newPin: '' });

    expect(next).not.toHaveBeenCalled();
    expect(mockUser.pinHash).toBeNull();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { hasPin: false },
      })
    );
  });

  it('无 PIN - 直接设置新 PIN（格式合法）', async () => {
    const mockUser = { id: 1, pinHash: null, save: vi.fn() };
    (User.findByPk as Mock).mockResolvedValue(mockUser);
    (hashPin as Mock).mockResolvedValue('new-hash');

    const { res, next } = await run({ newPin: '1234' });

    expect(next).not.toHaveBeenCalled();
    expect(hashPin).toHaveBeenCalledWith('1234');
    expect(mockUser.pinHash).toBe('new-hash');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { hasPin: true },
      })
    );
  });

  it('无 PIN - 新 PIN 格式非法返回 400', async () => {
    const mockUser = { id: 1, pinHash: null, save: vi.fn() };
    (User.findByPk as Mock).mockResolvedValue(mockUser);
    (isValidPin as Mock).mockReturnValue(false);

    const { next } = await run({ newPin: 'abc' });
    expect(statusCodeOf(next)).toBe(400);
  });

  it('无 PIN - newPin 为 null 则清除（幂等）', async () => {
    const mockUser = { id: 1, pinHash: null, save: vi.fn() };
    (User.findByPk as Mock).mockResolvedValue(mockUser);

    const { res, next } = await run({ newPin: null });

    expect(next).not.toHaveBeenCalled();
    expect(mockUser.pinHash).toBeNull();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { hasPin: false },
      })
    );
  });
});
