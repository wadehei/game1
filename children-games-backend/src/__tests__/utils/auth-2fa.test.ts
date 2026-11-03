import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config
vi.mock('../../config', () => ({
  config: {
    jwt: {
      secret: 'test-secret-key-for-unit-tests',
      expiresIn: '7d',
    },
  },
}));

// Mock Admin model
vi.mock('../../models/Admin', () => ({
  Admin: {},
}));

// Mock User model
vi.mock('../../models', () => ({
  User: {},
}));

import { generate2faTempToken, generateAdminToken, verify2faTempToken } from '../../utils/auth';
import jwt from 'jsonwebtoken';

describe('auth utils - 2FA', () => {
  const testSecret = 'test-secret-key-for-unit-tests';

  describe('generate2faTempToken', () => {
    it('应生成包含 adminId 和 purpose=2fa_pending 的 JWT', () => {
      const token = generate2faTempToken(42);
      const decoded = jwt.verify(token, testSecret) as any;

      expect(decoded.adminId).toBe(42);
      expect(decoded.purpose).toBe('2fa_pending');
      expect(decoded.exp).toBeDefined();
    });

    it('应在 5 分钟后过期', () => {
      const token = generate2faTempToken(1);
      const decoded = jwt.verify(token, testSecret) as any;
      const now = Math.floor(Date.now() / 1000);
      const diff = decoded.exp - decoded.iat;

      expect(diff).toBe(300); // 5 * 60 = 300 seconds
    });
  });

  describe('generateAdminToken', () => {
    it('应生成包含 role=admin 的 JWT', () => {
      const token = generateAdminToken(5, 'admin');
      const decoded = jwt.verify(token, testSecret) as any;

      expect(decoded.role).toBe('admin');
      expect(decoded.adminId).toBe(5);
      expect(decoded.username).toBe('admin');
    });

    it('应在 12 小时后过期', () => {
      const token = generateAdminToken(1, 'test');
      const decoded = jwt.verify(token, testSecret) as any;
      const diff = decoded.exp - decoded.iat;

      expect(diff).toBe(12 * 3600); // 12 hours
    });
  });

  describe('verify2faTempToken', () => {
    it('有效的临时令牌应返回 adminId', () => {
      const token = generate2faTempToken(99);
      const result = verify2faTempToken(token);

      expect(result).toBe(99);
    });

    it('非 2fa_pending 用途的令牌应返回 null', () => {
      const token = jwt.sign({ adminId: 1, purpose: 'other' }, testSecret);
      const result = verify2faTempToken(token);

      expect(result).toBeNull();
    });

    it('管理员 JWT（role=admin）应返回 null', () => {
      const token = jwt.sign({ role: 'admin', adminId: 1 }, testSecret);
      const result = verify2faTempToken(token);

      expect(result).toBeNull();
    });

    it('无效签名应返回 null', () => {
      const token = generate2faTempToken(1);
      const tampered = token.slice(0, -5) + 'xxxxx';
      const result = verify2faTempToken(tampered);

      expect(result).toBeNull();
    });

    it('过期的令牌应返回 null', () => {
      const token = jwt.sign({ adminId: 1, purpose: '2fa_pending' }, testSecret, {
        expiresIn: '-1s',
      });
      const result = verify2faTempToken(token);

      expect(result).toBeNull();
    });

    it('缺少 adminId 应返回 null', () => {
      const token = jwt.sign({ purpose: '2fa_pending' }, testSecret);
      const result = verify2faTempToken(token);

      expect(result).toBeNull();
    });
  });
});
