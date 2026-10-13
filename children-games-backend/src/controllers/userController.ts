import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models';
import { config } from '../config';
import { AuthRequest } from '../middleware/auth';
import { success, fail, asyncHandler } from '../utils/response';

// 微信登录（后续实现）
export const wxLogin = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body;

  if (!code) {
    fail(res, '缺少 code 参数');
    return;
  }

  // TODO: 调用微信接口获取 openid
  // const openid = await getOpenidFromWechat(code);

  // 临时模拟 openid
  const openid = `mock_${Date.now()}`;

  // 查找或创建用户
  let [user, created] = await User.findOrCreate({
    where: { openid },
    defaults: {
      openid,
      nickname: '小朋友',
      avatar: '',
    },
  });

  // 生成 JWT
  const token = jwt.sign(
    { userId: user.id, openid: user.openid },
    config.jwt.secret,
    { expiresIn: '7d' }
  );

  success(res, {
    token,
    userInfo: {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      level: user.level,
      totalStars: user.totalStars,
    },
  });
});

// 测试登录（家庭自用，所有环境开放；正式对外前应接入微信登录并关停此接口）
export const testLogin = asyncHandler(async (req: Request, res: Response) => {
  const { nickname } = req.body;

  const openid = `test_${Date.now()}`;

  const [user] = await User.findOrCreate({
    where: { openid },
    defaults: {
      openid,
      nickname: nickname || '测试用户',
      avatar: '',
    },
  });

  const token = jwt.sign(
    { userId: user.id, openid: user.openid },
    config.jwt.secret,
    { expiresIn: '7d' }
  );

  success(res, {
    token,
    userInfo: {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      level: user.level,
      totalStars: user.totalStars,
    },
  });
});

// 获取用户信息
export const getUserInfo = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findByPk(req.userId!);

  if (!user) {
    fail(res, '用户不存在', 404);
    return;
  }

  success(res, {
    id: user.id,
    nickname: user.nickname,
    avatar: user.avatar,
    level: user.level,
    totalStars: user.totalStars,
  });
});

// 更新用户信息
export const updateUserInfo = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { nickname, avatar } = req.body;

  const user = await User.findByPk(req.userId!);

  if (!user) {
    fail(res, '用户不存在', 404);
    return;
  }

  if (nickname) user.nickname = nickname;
  if (avatar) user.avatar = avatar;

  await user.save();

  success(res, {
    id: user.id,
    nickname: user.nickname,
    avatar: user.avatar,
  });
});
