import { Response } from 'express';
import { User } from '../models';
import { AuthRequest } from '../middleware/auth';
import { success, asyncHandler } from '../utils/response';
import {
  NotFoundError,
  UnauthorizedError,
  TooManyRequestsError,
  BadRequestError,
} from '../errors/AppError';
import {
  isValidPin,
  verifyPin,
  hashPin,
  checkThrottle,
  recordFail,
  clearFails,
} from '../services/pinService';

// 设置/修改/清除自己的角色口令（newPin 传空串=清除）
export const updateMyPin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findByPk(req.userId!);
  if (!user) {
    throw new NotFoundError('用户不存在');
  }

  const { oldPin, newPin } = req.body || {};

  if (user.pinHash) {
    const lockedUntil = checkThrottle(user.id);
    if (lockedUntil) {
      throw new TooManyRequestsError(
        `口令错误次数过多，请 ${Math.ceil((lockedUntil - Date.now()) / 1000)} 秒后再试`
      );
    }
    if (!isValidPin(oldPin) || !(await verifyPin(oldPin, user.pinHash))) {
      recordFail(user.id);
      throw new UnauthorizedError('当前口令不正确');
    }
    clearFails(user.id);
  }

  if (newPin === '' || newPin === undefined || newPin === null) {
    user.pinHash = null;
    await user.save();
    success(res, { hasPin: false });
    return;
  }
  if (!isValidPin(newPin)) {
    throw new BadRequestError('新口令需为 4 位数字');
  }
  user.pinHash = await hashPin(newPin);
  await user.save();
  success(res, { hasPin: true });
});
