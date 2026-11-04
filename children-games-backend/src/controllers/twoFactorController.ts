import { Response } from 'express';
import bcrypt from 'bcrypt';
import { Admin } from '../models/Admin';
import { AdminRequest } from '../middleware/adminAuth';
import { success, asyncHandler } from '../utils/response';
import { UnauthorizedError, BadRequestError } from '../errors/AppError';
import {
  initiate2faSetup,
  verifyAndEnable2fa,
  disable2fa,
  validate2faToken,
} from '../services/twoFactorService';
import { verify2faTempToken, generateAdminToken } from '../utils/auth';

/** POST /api/admin/2fa/setup — 生成 TOTP 密钥和二维码（需完整认证） */
export const setup2fa = asyncHandler(async (req: AdminRequest, res: Response) => {
  const { password } = req.body;
  const admin = await requireAdminWithPassword(req, password);

  // 如果已经启用了 2FA，不允许重复设置
  if (admin.twoFactorEnabled) {
    throw new BadRequestError('2FA 已启用，请先解绑再重新设置');
  }

  const { secret, qrCode } = await initiate2faSetup(admin);

  success(res, { secret, qrCode }, '请使用认证器应用扫描二维码，然后调用 verify 接口完成绑定');
});

/** POST /api/admin/2fa/verify — 两种用途：
 *  1. 登录第二步：临时令牌 + 验证码 → 完整 JWT
 *  2. 绑定确认：已认证管理员 + 验证码 → 启用 2FA
 * 通过请求中是否包含 tempToken 来区分 */
export const verify2fa = asyncHandler(async (req: AdminRequest, res: Response) => {
  const { token: tempToken, code } = req.body;

  // 场景 1：登录第二步（使用临时令牌）
  if (tempToken) {
    const adminId = verify2faTempToken(tempToken);
    if (adminId === null) {
      throw new UnauthorizedError('临时令牌无效或已过期，请重新登录');
    }

    const admin = await Admin.findByPk(adminId);
    if (!admin || !admin.twoFactorEnabled || !admin.totpSecret) {
      throw new UnauthorizedError('管理员账号状态异常');
    }

    const isValid = validate2faToken(code, admin.totpSecret);
    if (!isValid) {
      throw new UnauthorizedError('验证码不正确，请重试');
    }

    const { token, jti } = generateAdminToken(admin.id, admin.username);
    success(res, { token, jti });
    return;
  }

  // 场景 2：绑定确认（使用完整管理员认证）
  const admin = await requireAdmin(req);

  if (!admin.totpSecret) {
    throw new BadRequestError('请先调用 setup 接口生成密钥');
  }
  if (admin.twoFactorEnabled) {
    throw new BadRequestError('2FA 已启用，无需重复绑定');
  }

  const activated = await verifyAndEnable2fa(admin, code);
  if (!activated) {
    throw new UnauthorizedError('验证码不正确，请重试');
  }

  success(res, null, '2FA 绑定成功');
});

/** POST /api/admin/2fa/disable — 解绑 2FA（需完整认证 + 密码确认） */
export const disable2faHandler = asyncHandler(async (req: AdminRequest, res: Response) => {
  const { password } = req.body;
  const admin = await requireAdminWithPassword(req, password);

  if (!admin.twoFactorEnabled) {
    throw new BadRequestError('2FA 未启用');
  }

  await disable2fa(admin);
  success(res, null, '2FA 已解绑');
});

/** POST /api/admin/2fa/status — 查询当前 2FA 状态 */
export const get2faStatus = asyncHandler(async (req: AdminRequest, res: Response) => {
  const admin = await requireAdmin(req);
  success(res, {
    enabled: admin.twoFactorEnabled,
    hasSecret: !!admin.totpSecret,
  });
});

// ─── 内部辅助 ─────────────────────────────

/** 从请求中提取管理员记录（要求完整认证 JWT） */
const requireAdmin = async (req: AdminRequest): Promise<Admin> => {
  // adminAuth 中间件已验证 JWT，从 token payload 获取 adminId
  const adminId = (req as any).adminId;
  if (!adminId) {
    throw new UnauthorizedError('无法识别管理员身份');
  }
  const admin = await Admin.findByPk(adminId);
  if (!admin) {
    throw new UnauthorizedError('管理员账号不存在');
  }
  return admin;
};

/** 从请求中提取管理员并验证密码（用于敏感操作） */
const requireAdminWithPassword = async (req: AdminRequest, password: string): Promise<Admin> => {
  const admin = await requireAdmin(req);
  const passwordValid = await bcrypt.compare(String(password || ''), admin.passwordHash);
  if (!passwordValid) {
    throw new UnauthorizedError('密码不正确');
  }
  return admin;
};
