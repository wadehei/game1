import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { User } from '../models';
import { config } from '../config';
import { AuthRequest } from '../middleware/auth';
import { success, asyncHandler } from '../utils/response';
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  TooManyRequestsError,
} from '../errors/AppError';
import { toUserInfo } from '../utils/auth';
import { NICKNAME_MAX_LENGTH } from '../config/constants';
import {
  isValidPin,
  verifyPin,
  checkThrottle,
  recordFail,
  clearFails,
} from '../services/pinService';
import { generateTokenPair } from '../services/tokenService';

// 微信登录（后续实现）
export const wxLogin = asyncHandler(async (req: Request, res: Response) => {
  if (config.nodeEnv !== 'development') {
    throw new BadRequestError('微信登录尚未接入');
  }

  const { code } = req.body;
  if (!code) throw new BadRequestError('缺少 code 参数');

  // TODO: 调用微信接口获取 openid
  const openid = `mock_${randomUUID()}`;

  const [user] = await User.findOrCreate({
    where: { openid },
    defaults: {
      openid,
      nickname: '小朋友',
      avatar: '',
    },
  });

  // 签发 access + refresh token 对
  const tokens = await generateTokenPair(user);
  success(res, { ...tokens, userInfo: toUserInfo(user) });
});

// 测试登录（仅开发环境）
export const testLogin = asyncHandler(async (req: Request, res: Response) => {
  if (config.nodeEnv !== 'development') {
    throw new ForbiddenError('该接口仅开发环境可用');
  }

  const { nickname } = req.body;
  const openid = `test_${randomUUID()}`;

  const [user] = await User.findOrCreate({
    where: { openid },
    defaults: {
      openid,
      nickname: nickname || '测试用户',
      avatar: '',
    },
  });

  // 签发 access + refresh token 对
  const tokens = await generateTokenPair(user);
  success(res, { ...tokens, userInfo: toUserInfo(user) });
});

// 家庭角色登录：传 uid 直接登录已有成员，传 nickname+avatar 创建新成员
// 现在使用 access + refresh token 对，替代原来的 365 天长期令牌
export const familyLogin = asyncHandler(async (req: Request, res: Response) => {
  const { uid, nickname, avatar } = req.body;

  let user = null;
  if (uid) {
    user = await User.findByPk(parseInt(uid, 10));
    if (!user) {
      throw new NotFoundError('角色不存在');
    }
    if (user.pinHash) {
      const lockedUntil = checkThrottle(user.id);
      if (lockedUntil) {
        throw new TooManyRequestsError(
          `口令错误次数过多，请 ${Math.ceil((lockedUntil - Date.now()) / 1000)} 秒后再试`
        );
      }
      const pin = req.body?.pin;
      if (!isValidPin(pin) || !(await verifyPin(pin, user.pinHash))) {
        recordFail(user.id);
        throw new UnauthorizedError('口令不正确');
      }
      clearFails(user.id);
    }
  } else {
    if (!nickname || !String(nickname).trim()) {
      throw new BadRequestError('请填写昵称');
    }
    const openid = `family_${randomUUID()}`;
    const [created] = await User.findOrCreate({
      where: { openid },
      defaults: {
        openid,
        nickname: String(nickname).trim().slice(0, NICKNAME_MAX_LENGTH),
        avatar: avatar || '😊',
      },
    });
    user = created;
  }

  // 签发 access + refresh token 对（替代原来的 365 天令牌）
  const tokens = await generateTokenPair(user);
  success(res, { ...tokens, userInfo: toUserInfo(user) });
});

// 家庭成员列表（选角色页）
export const getProfiles = asyncHandler(async (req: Request, res: Response) => {
  const users = await User.findAll({
    where: { openid: { [Op.like]: 'family_%' } },
    attributes: ['id', 'nickname', 'avatar', 'level', 'totalStars', 'pinHash', 'createdAt'],
    order: [['totalStars', 'DESC']],
    limit: 100,
  });

  success(
    res,
    users.map((u) => ({
      id: u.id,
      nickname: u.nickname,
      avatar: u.avatar,
      level: u.level,
      totalStars: u.totalStars,
      hasPin: !!u.pinHash,
    }))
  );
});
