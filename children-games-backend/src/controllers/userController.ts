import { Response } from 'express';
import { User } from '../models';
import { AuthRequest } from '../middleware/auth';
import { success, asyncHandler } from '../utils/response';
import { NotFoundError } from '../errors/AppError';
import { AVATAR_HISTORY_LIMIT } from '../config/constants';

// 获取用户信息
export const getUserInfo = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findByPk(req.userId!);

  if (!user) {
    throw new NotFoundError('用户不存在');
  }

  success(res, {
    id: user.id,
    nickname: user.nickname,
    avatar: user.avatar,
    avatarHistory: Array.isArray(user.avatarHistory) ? user.avatarHistory : [],
    level: user.level,
    totalStars: user.totalStars,
    battleChips: user.battleChips ?? 1000,
  });
});

// 更新用户信息
export const updateUserInfo = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { nickname, avatar } = req.body;

  const user = await User.findByPk(req.userId!);

  if (!user) {
    throw new NotFoundError('用户不存在');
  }

  if (nickname) user.nickname = nickname;
  let avatarChanged = false;
  if (avatar && avatar !== user.avatar) {
    const history: string[] = Array.isArray(user.avatarHistory) ? [...user.avatarHistory] : [];
    if (user.avatar && !history.includes(user.avatar)) history.unshift(user.avatar);
    const idx = history.indexOf(avatar);
    if (idx !== -1) history.splice(idx, 1);
    history.unshift(avatar);
    user.avatarHistory = history.slice(0, AVATAR_HISTORY_LIMIT);
    user.avatar = avatar;
    avatarChanged = true;
  }

  await user.save();

  success(res, {
    id: user.id,
    nickname: user.nickname,
    avatar: user.avatar,
    ...(avatarChanged ? { avatarHistory: user.avatarHistory } : {}),
  });
});
