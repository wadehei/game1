// 认证控制器：Token 刷新 + 登出

import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { success, asyncHandler } from '../utils/response';
import { UnauthorizedError, BadRequestError } from '../errors/AppError';
import { User } from '../models';
import { verifyRefreshToken } from '../utils/auth';
import { logWarn } from '../utils/logger';
import {
  logout,
  validateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  blacklistToken,
  generateTokenPair,
} from '../services/tokenService';

/**
 * 刷新 Token（rotation 模式）
 * POST /api/user/refresh
 * Body: { refreshToken: string }
 *
 * 每次 refresh 签发全新的 access + refresh token 对并撤销旧 refresh token；
 * 已轮换的旧 refresh token 再次出现 = 疑似被盗 → 撤销该用户全部会话（重用检测）
 */
export const refreshAccessToken = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    throw new BadRequestError('缺少 refreshToken');
  }

  // 验证 refresh token 签名和有效期
  const payload = verifyRefreshToken(refreshToken);
  if (!payload) {
    throw new UnauthorizedError('Refresh token 无效或已过期');
  }

  // 检查 refresh token 是否仍有效（未被轮换/撤销）
  const storedUserId = await validateRefreshToken(payload.jti);
  if (!storedUserId) {
    // 签名合法但服务端记录已不存在 = 已轮换/已登出的 token 被重放，疑似被盗
    // 重用检测：撤销该用户全部 refresh token，强制所有设备重新登录
    await revokeAllRefreshTokens(payload.userId);
    logWarn(
      'auth',
      `检测到 refresh token 重用（jti=${payload.jti}，userId=${payload.userId}），已撤销该用户全部会话`
    );
    throw new UnauthorizedError('登录状态已过期，请重新登录');
  }

  // 验证用户存在
  const user = await User.findByPk(payload.userId);
  if (!user) {
    throw new UnauthorizedError('用户不存在');
  }

  // 验证 userId 一致性（防止 refresh token 存储被篡改）
  if (storedUserId !== payload.userId) {
    throw new UnauthorizedError('Token 验证失败');
  }

  // Rotation：撤销旧 refresh token，签发全新 token 对
  await revokeRefreshToken(payload.jti);
  const tokens = await generateTokenPair(user);

  success(res, tokens);
});

/**
 * 登出当前设备
 * POST /api/user/logout
 * Body: { refreshToken: string }
 * Headers: Authorization: Bearer <accessToken>
 */
export const logoutCurrentDevice = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { refreshToken } = req.body;

  // refreshToken 是必需的（用于撤销服务端的 refresh token 记录）
  if (!refreshToken) {
    throw new BadRequestError('缺少 refreshToken');
  }

  // 解析 refresh token
  const refreshPayload = verifyRefreshToken(refreshToken);
  if (!refreshPayload) {
    // refresh token 已过期或无效，直接返回成功（已登出状态）
    success(res, { message: '已登出' });
    return;
  }

  // 校验归属：只能登出自己的会话，防止持有他人 refresh token 撤销他人会话
  if (!req.userId || refreshPayload.userId !== req.userId) {
    throw new UnauthorizedError('Refresh token 与当前用户不匹配');
  }

  // 执行登出：黑名单 access token + 撤销 refresh token
  await logout(req.tokenJti, req.tokenExp || Date.now() + 15 * 60 * 1000, refreshPayload.jti);

  success(res, { message: '已登出' });
});

/**
 * 登出所有设备（安全事件响应）
 * POST /api/user/logout-all
 * Headers: Authorization: Bearer <accessToken>
 * Body: { refreshToken: string }
 */
export const logoutAllDevices = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { refreshToken } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new UnauthorizedError('未认证');
  }

  // 撤销当前 refresh token（校验归属，防止撤销他人会话）
  if (refreshToken) {
    const refreshPayload = verifyRefreshToken(refreshToken);
    if (refreshPayload) {
      if (refreshPayload.userId !== userId) {
        throw new UnauthorizedError('Refresh token 与当前用户不匹配');
      }
      await revokeRefreshToken(refreshPayload.jti);
    }
  }

  // 黑名单当前 access token
  if (req.tokenJti && req.tokenExp) {
    await blacklistToken(req.tokenJti, req.tokenExp);
  }

  // 撤销该用户的所有 refresh token
  const revokedCount = await revokeAllRefreshTokens(userId);

  success(res, {
    message: `已登出所有设备，撤销了 ${revokedCount} 个会话`,
  });
});
