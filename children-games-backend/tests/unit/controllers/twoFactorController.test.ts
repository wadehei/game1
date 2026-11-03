import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Request, Response } from 'express';

// ─── Mocks ────────────────────────────────────────────────────────
vi.mock('../../../src/config/database', () => ({
  sequelize: {},
}));

vi.mock('../../../src/config', () => ({
  config: { nodeEnv: 'test', jwt: { secret: 'test-secret' } },
}));

const mockAdminSave = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../src/models/Admin', () => ({
  Admin: {
    findByPk: vi.fn(),
  },
}));

vi.mock('../../../src/services/twoFactorService', () => ({
  initiate2faSetup: vi.fn().mockResolvedValue({
    secret: 'JBSWY3DPEHPK3PXP',
    qrCode: 'data:image/png;base64,fake',
  }),
  verifyAndEnable2fa: vi.fn().mockResolvedValue(true),
  disable2fa: vi.fn().mockResolvedValue(undefined),
  validate2faToken: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../src/utils/auth', () => ({
  verify2faTempToken: vi.fn().mockReturnValue(1),
  generateAdminToken: vi.fn().mockReturnValue('mock-jwt-token'),
}));

// bcrypt 是 CJS 模块，factory 返回的就是 module.exports
// controller 使用 import bcrypt from 'bcrypt' 获取 default export
// vitest 对 CJS 模块的 default import 返回整个 factory 对象
vi.mock('bcrypt', () => {
  const compareFn = vi.fn().mockResolvedValue(true);
  return { default: { compare: compareFn }, compare: compareFn, __mockCompare: compareFn };
});

import {
  setup2fa,
  verify2fa,
  disable2faHandler,
  get2faStatus,
} from '../../../src/controllers/twoFactorController';
import { Admin } from '../../../src/models/Admin';
import {
  initiate2faSetup,
  verifyAndEnable2fa,
  disable2fa,
  validate2faToken,
} from '../../../src/services/twoFactorService';
import { verify2faTempToken, generateAdminToken } from '../../../src/utils/auth';

// 获取 bcrypt mock 的引用
const bcryptMock = await import('bcrypt');
const mockCompare = (bcryptMock as any).__mockCompare as ReturnType<typeof vi.fn>;

// ─── 辅助 ─────────────────────────────────────────────────────────
const mockReq = (overrides: Record<string, any> = {}): Request =>
  ({
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides,
  }) as unknown as Request;

const mockRes = (): Response & { jsonBody: any } => {
  const res: any = {
    jsonBody: null,
    statusCode: 200,
    json: vi.fn((body: any) => {
      res.jsonBody = body;
    }),
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
  };
  return res;
};

const mockNext = vi.fn() as Mock;

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

const mockAdminObj = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  username: 'testadmin',
  passwordHash: '$2b$10$fakehash',
  totpSecret: null as string | null,
  twoFactorEnabled: false,
  save: mockAdminSave,
  ...overrides,
});

// ─── 测试套件 ─────────────────────────────────────────────────────

describe('twoFactorController', () => {
  let res: ReturnType<typeof mockRes>;

  beforeEach(() => {
    vi.clearAllMocks();
    res = mockRes();
    mockAdminSave.mockResolvedValue(undefined);
    (Admin.findByPk as Mock).mockResolvedValue(mockAdminObj());
    mockCompare.mockResolvedValue(true);
    (validate2faToken as Mock).mockReturnValue(true);
    (verify2faTempToken as Mock).mockReturnValue(1);
    (verifyAndEnable2fa as Mock).mockResolvedValue(true);
  });

  // ─── setup2fa ────────────────────────────────────────────────

  describe('setup2fa', () => {
    it('密码正确且 2FA 未启用时应返回密钥和二维码', async () => {
      const req = mockReq({ body: { password: 'correct' }, adminId: 1 });
      (Admin.findByPk as Mock).mockResolvedValue(mockAdminObj({ twoFactorEnabled: false }));

      await setup2fa(req, res, mockNext);
      await flushPromises();

      expect(initiate2faSetup).toHaveBeenCalledTimes(1);
      expect(res.jsonBody).toEqual({
        code: 200,
        message: expect.stringContaining('扫描'),
        data: {
          secret: 'JBSWY3DPEHPK3PXP',
          qrCode: 'data:image/png;base64,fake',
        },
      });
    });

    it('2FA 已启用时应将错误传给 next', async () => {
      const req = mockReq({ body: { password: 'correct' }, adminId: 1 });
      (Admin.findByPk as Mock).mockResolvedValue(mockAdminObj({ twoFactorEnabled: true }));

      await setup2fa(req, res, mockNext);
      await flushPromises();

      const err = mockNext.mock.calls[0]?.[0];
      expect(err).toBeTruthy();
      expect(err.message).toMatch('2FA 已启用');
    });

    it('密码错误时应将错误传给 next', async () => {
      const req = mockReq({ body: { password: 'wrong' }, adminId: 1 });
      (Admin.findByPk as Mock).mockResolvedValue(mockAdminObj());
      mockCompare.mockResolvedValue(false);

      await setup2fa(req, res, mockNext);
      await flushPromises();

      const err = mockNext.mock.calls[0]?.[0];
      expect(err).toBeTruthy();
      expect(err.message).toMatch('密码不正确');
    });

    it('管理员不存在时应将错误传给 next', async () => {
      const req = mockReq({ body: { password: 'correct' }, adminId: 999 });
      (Admin.findByPk as Mock).mockResolvedValue(null);

      await setup2fa(req, res, mockNext);
      await flushPromises();

      const err = mockNext.mock.calls[0]?.[0];
      expect(err).toBeTruthy();
      expect(err.message).toMatch('管理员账号不存在');
    });
  });

  // ─── verify2fa ───────────────────────────────────────────────

  describe('verify2fa', () => {
    describe('场景1：登录第二步（临时令牌）', () => {
      it('临时令牌有效且验证码正确时应返回完整 JWT', async () => {
        const req = mockReq({ body: { token: 'temp-token', code: '123456' } });
        (verify2faTempToken as Mock).mockReturnValue(1);
        (Admin.findByPk as Mock).mockResolvedValue(
          mockAdminObj({ twoFactorEnabled: true, totpSecret: 'SECRET' })
        );

        await verify2fa(req, res, mockNext);
        await flushPromises();

        expect(generateAdminToken).toHaveBeenCalledWith(1, 'testadmin');
        expect(res.jsonBody).toEqual({
          code: 200,
          message: 'success',
          data: { token: 'mock-jwt-token' },
        });
      });

      it('临时令牌无效时应将错误传给 next', async () => {
        const req = mockReq({ body: { token: 'invalid-temp', code: '123456' } });
        (verify2faTempToken as Mock).mockReturnValue(null);

        await verify2fa(req, res, mockNext);
        await flushPromises();

        const err = mockNext.mock.calls[0]?.[0];
        expect(err).toBeTruthy();
        expect(err.message).toMatch('临时令牌无效或已过期');
      });

      it('管理员不存在时应将错误传给 next', async () => {
        const req = mockReq({ body: { token: 'temp-token', code: '123456' } });
        (verify2faTempToken as Mock).mockReturnValue(999);
        (Admin.findByPk as Mock).mockResolvedValue(null);

        await verify2fa(req, res, mockNext);
        await flushPromises();

        const err = mockNext.mock.calls[0]?.[0];
        expect(err).toBeTruthy();
        expect(err.message).toMatch('管理员账号状态异常');
      });

      it('管理员 2FA 未启用时应将错误传给 next', async () => {
        const req = mockReq({ body: { token: 'temp-token', code: '123456' } });
        (verify2faTempToken as Mock).mockReturnValue(1);
        (Admin.findByPk as Mock).mockResolvedValue(mockAdminObj({ twoFactorEnabled: false }));

        await verify2fa(req, res, mockNext);
        await flushPromises();

        const err = mockNext.mock.calls[0]?.[0];
        expect(err).toBeTruthy();
        expect(err.message).toMatch('管理员账号状态异常');
      });

      it('验证码不正确时应将错误传给 next', async () => {
        const req = mockReq({ body: { token: 'temp-token', code: '000000' } });
        (verify2faTempToken as Mock).mockReturnValue(1);
        (Admin.findByPk as Mock).mockResolvedValue(
          mockAdminObj({ twoFactorEnabled: true, totpSecret: 'SECRET' })
        );
        (validate2faToken as Mock).mockReturnValue(false);

        await verify2fa(req, res, mockNext);
        await flushPromises();

        const err = mockNext.mock.calls[0]?.[0];
        expect(err).toBeTruthy();
        expect(err.message).toMatch('验证码不正确');
      });
    });

    describe('场景2：绑定确认（完整管理员认证）', () => {
      it('验证码正确时应启用 2FA', async () => {
        const req = mockReq({ body: { code: '123456' }, adminId: 1 });
        (Admin.findByPk as Mock).mockResolvedValue(
          mockAdminObj({ totpSecret: 'PENDING_SECRET', twoFactorEnabled: false })
        );

        await verify2fa(req, res, mockNext);
        await flushPromises();

        expect(verifyAndEnable2fa).toHaveBeenCalledTimes(1);
        expect(res.jsonBody).toEqual(expect.objectContaining({ code: 200 }));
      });

      it('无 totpSecret 时应将错误传给 next', async () => {
        const req = mockReq({ body: { code: '123456' }, adminId: 1 });
        (Admin.findByPk as Mock).mockResolvedValue(
          mockAdminObj({ totpSecret: null, twoFactorEnabled: false })
        );

        await verify2fa(req, res, mockNext);
        await flushPromises();

        const err = mockNext.mock.calls[0]?.[0];
        expect(err).toBeTruthy();
        expect(err.message).toMatch('请先调用 setup 接口');
      });

      it('2FA 已启用时应将错误传给 next', async () => {
        const req = mockReq({ body: { code: '123456' }, adminId: 1 });
        (Admin.findByPk as Mock).mockResolvedValue(
          mockAdminObj({ totpSecret: 'SECRET', twoFactorEnabled: true })
        );

        await verify2fa(req, res, mockNext);
        await flushPromises();

        const err = mockNext.mock.calls[0]?.[0];
        expect(err).toBeTruthy();
        expect(err.message).toMatch('2FA 已启用');
      });

      it('验证码错误时应将错误传给 next', async () => {
        const req = mockReq({ body: { code: '000000' }, adminId: 1 });
        (Admin.findByPk as Mock).mockResolvedValue(
          mockAdminObj({ totpSecret: 'SECRET', twoFactorEnabled: false })
        );
        (verifyAndEnable2fa as Mock).mockResolvedValue(false);

        await verify2fa(req, res, mockNext);
        await flushPromises();

        const err = mockNext.mock.calls[0]?.[0];
        expect(err).toBeTruthy();
        expect(err.message).toMatch('验证码不正确');
      });
    });
  });

  // ─── disable2faHandler ───────────────────────────────────────

  describe('disable2faHandler', () => {
    it('密码正确且 2FA 已启用时应解绑', async () => {
      const req = mockReq({ body: { password: 'correct' }, adminId: 1 });
      (Admin.findByPk as Mock).mockResolvedValue(
        mockAdminObj({ twoFactorEnabled: true, totpSecret: 'SECRET' })
      );

      await disable2faHandler(req, res, mockNext);
      await flushPromises();

      expect(disable2fa).toHaveBeenCalledTimes(1);
      expect(res.jsonBody).toEqual(expect.objectContaining({ code: 200 }));
    });

    it('2FA 未启用时应将错误传给 next', async () => {
      const req = mockReq({ body: { password: 'correct' }, adminId: 1 });
      (Admin.findByPk as Mock).mockResolvedValue(mockAdminObj({ twoFactorEnabled: false }));

      await disable2faHandler(req, res, mockNext);
      await flushPromises();

      const err = mockNext.mock.calls[0]?.[0];
      expect(err).toBeTruthy();
      expect(err.message).toMatch('2FA 未启用');
    });

    it('密码错误时应将错误传给 next', async () => {
      const req = mockReq({ body: { password: 'wrong' }, adminId: 1 });
      (Admin.findByPk as Mock).mockResolvedValue(
        mockAdminObj({ twoFactorEnabled: true, totpSecret: 'SECRET' })
      );
      mockCompare.mockResolvedValue(false);

      await disable2faHandler(req, res, mockNext);
      await flushPromises();

      const err = mockNext.mock.calls[0]?.[0];
      expect(err).toBeTruthy();
      expect(err.message).toMatch('密码不正确');
    });
  });

  // ─── get2faStatus ────────────────────────────────────────────

  describe('get2faStatus', () => {
    it('应返回 2FA 启用状态', async () => {
      const req = mockReq({ adminId: 1 });
      (Admin.findByPk as Mock).mockResolvedValue(
        mockAdminObj({ twoFactorEnabled: true, totpSecret: 'SECRET' })
      );

      await get2faStatus(req, res, mockNext);
      await flushPromises();

      expect(res.jsonBody).toEqual({
        code: 200,
        message: 'success',
        data: { enabled: true, hasSecret: true },
      });
    });

    it('2FA 未启用时应返回 enabled=false', async () => {
      const req = mockReq({ adminId: 1 });
      (Admin.findByPk as Mock).mockResolvedValue(mockAdminObj({ twoFactorEnabled: false }));

      await get2faStatus(req, res, mockNext);
      await flushPromises();

      expect(res.jsonBody).toEqual({
        code: 200,
        message: 'success',
        data: { enabled: false, hasSecret: false },
      });
    });

    it('有密钥但未启用时应返回 enabled=false, hasSecret=true', async () => {
      const req = mockReq({ adminId: 1 });
      (Admin.findByPk as Mock).mockResolvedValue(
        mockAdminObj({ twoFactorEnabled: false, totpSecret: 'PENDING' })
      );

      await get2faStatus(req, res, mockNext);
      await flushPromises();

      expect(res.jsonBody).toEqual({
        code: 200,
        message: 'success',
        data: { enabled: false, hasSecret: true },
      });
    });
  });
});
