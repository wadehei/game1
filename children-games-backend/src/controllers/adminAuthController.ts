import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { config } from '../config';
import { Admin } from '../models';
import { AdminRequest } from '../middleware/adminAuth';
import { success, asyncHandler } from '../utils/response';
import { UnauthorizedError, InternalError } from '../errors/AppError';
import { generate2faTempToken, generateAdminToken } from '../utils/auth';
import { blacklistToken } from '../services/tokenService';

// ─── 登录 ────────────────────────────────

/**
 * 管理员登录（支持 2FA）
 *
 * 流程：
 * 1. 优先查找数据库管理员账号
 * 2. 未找到时回退到环境变量密码校验（向后兼容）
 * 3. 若启用了 2FA → 返回临时令牌 + require2FA 标志
 * 4. 未启用 2FA → 直接返回完整 JWT
 */
export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body;

  // 1. 尝试从数据库验证管理员
  const adminUsername = username || process.env.ADMIN_USERNAME || 'admin';
  const admin = await Admin.findOne({ where: { username: adminUsername } });

  if (admin) {
    // 数据库管理员：使用 bcrypt 验证密码
    const passwordValid = await bcrypt.compare(String(password || ''), admin.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedError('密码不正确');
    }

    // 检查 2FA 状态
    if (admin.twoFactorEnabled && admin.totpSecret) {
      // 2FA 已启用：签发临时令牌，要求输入验证码
      const tempToken = generate2faTempToken(admin.id);
      success(res, { require2FA: true, tempToken });
      return;
    }

    // 2FA 未启用：直接签发完整 JWT
    const { token, jti } = generateAdminToken(admin.id, admin.username);
    success(res, { token, jti });
    return;
  }

  // 2. 回退：环境变量密码校验（向后兼容）
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    throw new InternalError('未配置管理员账号，请设置 ADMIN_PASSWORD 环境变量');
  }

  // 使用 SHA-256 哈希后比较，防止计时攻击泄漏密码长度
  const hashActual = crypto
    .createHash('sha256')
    .update(String(password || ''), 'utf-8')
    .digest();
  const hashExpected = crypto.createHash('sha256').update(expected, 'utf-8').digest();
  if (!crypto.timingSafeEqual(hashActual, hashExpected)) {
    throw new UnauthorizedError('密码不正确');
  }

  // 环境变量模式不支持 2FA，直接签发 JWT
  const token = jwt.sign({ role: 'admin' }, config.jwt.secret, { expiresIn: '12h' });
  success(res, { token });
});

/**
 * 管理员登出
 * 将当前 access token 加入黑名单，强制失效
 */
export const adminLogout = asyncHandler(async (req: AdminRequest, res: Response) => {
  // 将当前 token 加入黑名单
  if (req.tokenJti && req.tokenExp) {
    await blacklistToken(req.tokenJti, req.tokenExp);
  }

  success(res, { message: '已登出' });
});
