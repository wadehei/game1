import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { Admin } from '../models/Admin';

const ISSUER = 'ChildrenGames';
const DIGITS = 6;
const PERIOD = 30; // 秒

/** 创建 TOTP 实例 */
const createTotp = (secret: OTPAuth.Secret, username: string): OTPAuth.TOTP => {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label: username,
    algorithm: 'SHA1',
    digits: DIGITS,
    period: PERIOD,
    secret,
  });
};

/** 生成 TOTP 密钥（base32 编码字符串） */
export const generateTotpSecret = (): string => {
  const secret = new OTPAuth.Secret({ size: 20 });
  return secret.base32;
};

/** 解析 base32 密钥为 Secret 对象 */
const parseSecret = (base32: string): OTPAuth.Secret => {
  return OTPAuth.Secret.fromBase32(base32);
};

/** 生成 TOTP 当前验证码（仅测试/调试用） */
export const generateTotpToken = (secretBase32: string): string => {
  const secret = parseSecret(secretBase32);
  const totp = createTotp(secret, 'test');
  return totp.generate();
};

/** 验证 TOTP 验证码（允许前后各 1 个时间窗口偏移） */
export const verifyTotpToken = (token: string, secretBase32: string): boolean => {
  const secret = parseSecret(secretBase32);
  const totp = createTotp(secret, 'verify');
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
};

/** 生成 OTP Auth URI（供二维码使用） */
export const buildOtpAuthUri = (secretBase32: string, username: string): string => {
  const secret = parseSecret(secretBase32);
  const totp = createTotp(secret, username);
  return totp.toString();
};

/** 将 OTP Auth URI 转换为 QR Code base64 图片 */
export const generateQrCodeDataUrl = async (otpAuthUri: string): Promise<string> => {
  return QRCode.toDataURL(otpAuthUri, {
    width: 280,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
};

/**
 * 初始化 2FA 设置流程
 * 1. 生成新 TOTP 密钥
 * 2. 构建 otpauth:// URI
 * 3. 生成 QR Code 图片
 * 4. 暂存密钥到管理员记录（尚未激活）
 */
export const initiate2faSetup = async (
  admin: Admin
): Promise<{
  secret: string;
  qrCode: string;
}> => {
  const secret = generateTotpSecret();
  const otpAuthUri = buildOtpAuthUri(secret, admin.username);
  const qrCode = await generateQrCodeDataUrl(otpAuthUri);

  // 暂存密钥（2FA 尚未启用，需验证后才激活）
  admin.totpSecret = secret;
  await admin.save();

  return { secret, qrCode };
};

/**
 * 验证并激活 2FA
 * 用户提供 6 位验证码，验证通过后正式启用
 */
export const verifyAndEnable2fa = async (admin: Admin, token: string): Promise<boolean> => {
  if (!admin.totpSecret) {
    return false;
  }

  const isValid = verifyTotpToken(token, admin.totpSecret);
  if (!isValid) {
    return false;
  }

  admin.twoFactorEnabled = true;
  await admin.save();
  return true;
};

/** 解绑 2FA：清除密钥并禁用 */
export const disable2fa = async (admin: Admin): Promise<void> => {
  admin.totpSecret = null;
  admin.twoFactorEnabled = false;
  await admin.save();
};

/** 校验 2FA 验证码（登录时使用） */
export const validate2faToken = (token: string, secret: string): boolean => {
  return verifyTotpToken(token, secret);
};
