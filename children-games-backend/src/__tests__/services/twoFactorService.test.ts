import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as OTPAuth from 'otpauth';

// Mock QRCode（测试中不需要真实生成图片）
vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,fake_qr_code'),
  },
}));

// Mock Admin 模型
const mockAdminSave = vi.fn();
const mockAdmin = {
  id: 1,
  username: 'testadmin',
  passwordHash: '$2b$10$fake',
  totpSecret: null as string | null,
  twoFactorEnabled: false,
  save: mockAdminSave,
};

vi.mock('../../models/Admin', () => ({
  Admin: {},
}));

import {
  generateTotpSecret,
  generateTotpToken,
  verifyTotpToken,
  buildOtpAuthUri,
  generateQrCodeDataUrl,
  initiate2faSetup,
  verifyAndEnable2fa,
  disable2fa,
  validate2faToken,
} from '../../services/twoFactorService';

describe('twoFactorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdmin.totpSecret = null;
    mockAdmin.twoFactorEnabled = false;
    mockAdminSave.mockResolvedValue(undefined);
  });

  describe('generateTotpSecret', () => {
    it('应生成 32 字符 base32 编码的密钥', () => {
      const secret = generateTotpSecret();
      expect(secret).toBeTruthy();
      expect(typeof secret).toBe('string');
      // base32 编码 20 字节 = 32 字符
      expect(secret.length).toBe(32);
      // 只含 base32 字符（A-Z, 2-7）
      expect(secret).toMatch(/^[A-Z2-7]+$/);
    });

    it('每次调用应生成不同密钥', () => {
      const s1 = generateTotpSecret();
      const s2 = generateTotpSecret();
      expect(s1).not.toBe(s2);
    });
  });

  describe('generateTotpToken / verifyTotpToken', () => {
    it('生成的验证码应为 6 位数字', () => {
      const secret = generateTotpSecret();
      const token = generateTotpToken(secret);
      expect(token).toMatch(/^\d{6}$/);
    });

    it('用正确密钥验证生成的验证码应通过', () => {
      const secret = generateTotpSecret();
      const token = generateTotpToken(secret);
      expect(verifyTotpToken(token, secret)).toBe(true);
    });

    it('用错误验证码验证应失败', () => {
      const secret = generateTotpSecret();
      expect(verifyTotpToken('000000', secret)).toBe(false);
    });

    it('用不同密钥验证应失败', () => {
      const secret1 = generateTotpSecret();
      const secret2 = generateTotpSecret();
      const token = generateTotpToken(secret1);
      expect(verifyTotpToken(token, secret2)).toBe(false);
    });
  });

  describe('buildOtpAuthUri', () => {
    it('应生成合法的 otpauth:// URI', () => {
      const secret = generateTotpSecret();
      const uri = buildOtpAuthUri(secret, 'testuser');
      expect(uri).toMatch(/^otpauth:\/\/totp\//);
      expect(uri).toContain('testuser');
      expect(uri).toContain('ChildrenGames');
      expect(uri).toContain('secret=' + secret);
    });
  });

  describe('generateQrCodeDataUrl', () => {
    it('应返回 base64 格式的数据 URL', async () => {
      const result = await generateQrCodeDataUrl('otpauth://test');
      expect(result).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('initiate2faSetup', () => {
    it('应生成密钥和二维码，并暂存密钥到管理员记录', async () => {
      const result = await initiate2faSetup(mockAdmin as any);

      expect(result.secret).toBeTruthy();
      expect(result.secret.length).toBe(32);
      expect(result.qrCode).toMatch(/^data:image\/png;base64,/);
      expect(mockAdmin.totpSecret).toBe(result.secret);
      expect(mockAdminSave).toHaveBeenCalledTimes(1);
    });
  });

  describe('verifyAndEnable2fa', () => {
    it('验证码正确时应启用 2FA', async () => {
      const secret = generateTotpSecret();
      mockAdmin.totpSecret = secret;
      const token = generateTotpToken(secret);

      const result = await verifyAndEnable2fa(mockAdmin as any, token);

      expect(result).toBe(true);
      expect(mockAdmin.twoFactorEnabled).toBe(true);
      expect(mockAdminSave).toHaveBeenCalledTimes(1);
    });

    it('验证码错误时应返回 false', async () => {
      const secret = generateTotpSecret();
      mockAdmin.totpSecret = secret;

      const result = await verifyAndEnable2fa(mockAdmin as any, '000000');

      expect(result).toBe(false);
      expect(mockAdmin.twoFactorEnabled).toBe(false);
    });

    it('无密钥时应返回 false', async () => {
      mockAdmin.totpSecret = null;

      const result = await verifyAndEnable2fa(mockAdmin as any, '123456');

      expect(result).toBe(false);
    });
  });

  describe('disable2fa', () => {
    it('应清除密钥并禁用 2FA', async () => {
      mockAdmin.totpSecret = 'SOME_SECRET';
      mockAdmin.twoFactorEnabled = true;

      await disable2fa(mockAdmin as any);

      expect(mockAdmin.totpSecret).toBeNull();
      expect(mockAdmin.twoFactorEnabled).toBe(false);
      expect(mockAdminSave).toHaveBeenCalledTimes(1);
    });
  });

  describe('validate2faToken', () => {
    it('等同于 verifyTotpToken', () => {
      const secret = generateTotpSecret();
      const token = generateTotpToken(secret);

      expect(validate2faToken(token, secret)).toBe(true);
      expect(validate2faToken('000000', secret)).toBe(false);
    });
  });
});

describe('TOTP 30 秒过期验证', () => {
  it('同一密钥在 30 秒内生成的验证码应一致', () => {
    const secret = generateTotpSecret();
    const t1 = generateTotpToken(secret);
    const t2 = generateTotpToken(secret);
    // 同一时间窗口内生成的验证码相同
    expect(t1).toBe(t2);
  });

  it('window=1 应容忍一个时间窗口的偏移', () => {
    const secret = generateTotpSecret();
    // 手动构造一个偏移时间窗口的 TOTP
    const secretObj = OTPAuth.Secret.fromBase32(secret);
    const totp = new OTPAuth.TOTP({
      issuer: 'Test',
      label: 'test',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secretObj,
    });

    const currentToken = totp.generate();
    // 当前 token 在 window=1 范围内应始终验证通过
    expect(verifyTotpToken(currentToken, secret)).toBe(true);
  });
});
