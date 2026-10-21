// 用户认证工具函数：JWT 签发 + 用户信息序列化

import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { User } from '../models';

/** 签发用户 JWT（默认 7 天，家庭登录可传 '365d'） */
export function generateUserToken(user: User, expiresIn = '7d'): string {
  return jwt.sign(
    { userId: user.id, openid: user.openid },
    config.jwt.secret,
    { expiresIn }
  );
}

/** 序列化用户基本信息（供登录/注册接口返回） */
export function toUserInfo(user: User) {
  return {
    id: user.id,
    nickname: user.nickname,
    avatar: user.avatar,
    level: user.level,
    totalStars: user.totalStars,
  };
}
