import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  recordAuditLog,
  queryAuditLogs,
  cleanupExpiredAuditLogs,
  extractClientIp,
} from '../../services/auditLogService';
import { AuditLog } from '../../models';

// Mock AuditLog 模型
vi.mock('../../models', () => ({
  AuditLog: {
    create: vi.fn(),
    findAndCountAll: vi.fn(),
    destroy: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  logError: vi.fn(),
}));

describe('auditLogService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('recordAuditLog', () => {
    it('应该成功记录审计日志', async () => {
      const mockData = {
        adminId: 1,
        action: 'user.update',
        targetType: 'user',
        targetId: 123,
        details: { nickname: '新昵称' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      await recordAuditLog(mockData);

      expect(AuditLog.create).toHaveBeenCalledWith({
        adminId: mockData.adminId,
        action: mockData.action,
        targetType: mockData.targetType,
        targetId: mockData.targetId,
        details: mockData.details,
        ipAddress: mockData.ipAddress,
        userAgent: mockData.userAgent,
      });
    });

    it('应该在可选字段缺失时使用 null', async () => {
      const mockData = {
        adminId: 1,
        action: 'admin.login',
      };

      await recordAuditLog(mockData);

      expect(AuditLog.create).toHaveBeenCalledWith({
        adminId: 1,
        action: 'admin.login',
        targetType: null,
        targetId: null,
        details: null,
        ipAddress: null,
        userAgent: null,
      });
    });

    it('应该在记录失败时不抛出异常', async () => {
      vi.mocked(AuditLog.create).mockRejectedValueOnce(new Error('Database error'));

      await expect(
        recordAuditLog({
          adminId: 1,
          action: 'test',
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('queryAuditLogs', () => {
    it('应该支持分页查询', async () => {
      const mockResult = {
        rows: [
          { id: 1, action: 'user.update', adminId: 1 },
          { id: 2, action: 'user.delete', adminId: 1 },
        ],
        count: 10,
      };

      vi.mocked(AuditLog.findAndCountAll).mockResolvedValueOnce(mockResult as any);

      const result = await queryAuditLogs({
        page: 1,
        limit: 20,
      });

      expect(result.list).toHaveLength(2);
      expect(result.total).toBe(10);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('应该支持按动作类型过滤', async () => {
      vi.mocked(AuditLog.findAndCountAll).mockResolvedValueOnce({ rows: [], count: 0 } as any);

      await queryAuditLogs({
        page: 1,
        limit: 20,
        action: 'user.update',
      });

      expect(AuditLog.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { action: 'user.update' },
        })
      );
    });

    it('应该支持按时间范围过滤', async () => {
      vi.mocked(AuditLog.findAndCountAll).mockResolvedValueOnce({ rows: [], count: 0 } as any);

      await queryAuditLogs({
        page: 1,
        limit: 20,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });

      expect(AuditLog.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.any(Object),
          }),
        })
      );
    });
  });

  describe('cleanupExpiredAuditLogs', () => {
    it('应该删除 90 天前的日志', async () => {
      vi.mocked(AuditLog.destroy).mockResolvedValueOnce(5);

      const deletedCount = await cleanupExpiredAuditLogs();

      expect(deletedCount).toBe(5);
      expect(AuditLog.destroy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            createdAt: expect.any(Object),
          },
        })
      );
    });

    it('应该在清理失败时返回 0', async () => {
      vi.mocked(AuditLog.destroy).mockRejectedValueOnce(new Error('Database error'));

      const deletedCount = await cleanupExpiredAuditLogs();

      expect(deletedCount).toBe(0);
    });
  });

  describe('extractClientIp', () => {
    it('应该从 X-Forwarded-For 获取 IP', () => {
      const mockReq = {
        get: (header: string) => {
          if (header === 'x-forwarded-for') return '203.0.113.5, 70.41.3.18';
          return null;
        },
        ip: '127.0.0.1',
      } as any;

      const ip = extractClientIp(mockReq);
      expect(ip).toBe('203.0.113.5');
    });

    it('应该处理 IPv6 回环地址', () => {
      const mockReq = {
        get: () => null,
        ip: '::1',
      } as any;

      const ip = extractClientIp(mockReq);
      expect(ip).toBe('127.0.0.1');
    });

    it('应该处理普通 IPv4', () => {
      const mockReq = {
        get: () => null,
        ip: '192.168.1.100',
      } as any;

      const ip = extractClientIp(mockReq);
      expect(ip).toBe('192.168.1.100');
    });

    it('应该处理无 IP 情况', () => {
      const mockReq = {
        get: () => null,
        ip: null,
      } as any;

      const ip = extractClientIp(mockReq);
      expect(ip).toBeNull();
    });
  });
});
