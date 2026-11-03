import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { Admin } from '../models/Admin';

// TOTP 配置：30 秒时间窗口，6 位数字
authenticator.setOptions({
  window: 1, // 允许前后各 1 个时间窗口的偏移（容错网络延迟）
  digits: 6,
  step: 30,
});

const ISSUER = 'ChildrenGames';

/** 生成 TOTP 密钥 */
export const generateTotpSecret = (): string => {
  return authenticator.generateSecret();
};

/** 生成 TOTP 当前验证码（仅测试/调试用） */
export const generateTotpToken = (secret: string): string => {
  return authenticator.generate(secret);
};

/** 验证 TOTP 验证码 */
export const verifyTotpToken = (token: string, secret: string): boolean => {
  return authenticator.verify({ token, secret });
};

/** 生成 OTP Auth URI（供二维码使用） */
export const buildOtpAuthUri = (secret: string, username: string): string => {
  return authenticator.keyuri(username, ISSUER, secret);
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
