import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, type RequestHandler } from 'express';
import { getAuditLogs } from '../../controllers/auditLogController';
import * as auditLogService from '../../services/auditLogService';

// Mock dependencies
vi.mock('../../services/auditLogService');
vi.mock('../../utils/response', () => ({
  success: vi.fn((res: Response, data: unknown) => {
    res.status(200).json({ code: 200, message: 'success', data });
  }),
  asyncHandler: (fn: RequestHandler) => fn,
}));
vi.mock('../../errors/AppError', () => ({
  BadRequestError: class BadRequestError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'BadRequestError';
    }
  },
}));

describe('auditLogController', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockJson: ReturnType<typeof vi.fn>;
  let mockStatus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJson = vi.fn();
    mockStatus = vi.fn().mockReturnValue({ json: mockJson });
    mockRes = {
      status: mockStatus as any,
      json: mockJson as any,
    };
    mockReq = {
      query: {},
    };
  });

  describe('getAuditLogs', () => {
    const mockQueryResult = {
      list: [
        { id: 1, action: 'CREATE_USER', adminId: 1 },
        { id: 2, action: 'UPDATE_USER', adminId: 1 },
      ],
      total: 2,
      page: 1,
      limit: 20,
    };

    it('should query audit logs without filters', async () => {
      vi.mocked(auditLogService.queryAuditLogs).mockResolvedValue(mockQueryResult as any);

      await getAuditLogs(mockReq as Request, mockRes as Response, () => {});

      expect(auditLogService.queryAuditLogs).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        action: undefined,
        startDate: undefined,
        endDate: undefined,
      });
      expect(mockJson).toHaveBeenCalledWith({
        code: 200,
        message: 'success',
        data: mockQueryResult,
      });
    });

    it('should filter by action', async () => {
      vi.mocked(auditLogService.queryAuditLogs).mockResolvedValue(mockQueryResult as any);
      mockReq.query = { action: 'CREATE_USER' };

      await getAuditLogs(mockReq as Request, mockRes as Response, () => {});

      expect(auditLogService.queryAuditLogs).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        action: 'CREATE_USER',
        startDate: undefined,
        endDate: undefined,
      });
    });

    it('should filter by date range', async () => {
      vi.mocked(auditLogService.queryAuditLogs).mockResolvedValue(mockQueryResult as any);
      mockReq.query = { startDate: '2024-01-01', endDate: '2024-12-31' };

      await getAuditLogs(mockReq as Request, mockRes as Response, () => {});

      expect(auditLogService.queryAuditLogs).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        action: undefined,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });
    });

    it('should throw BadRequestError for invalid startDate format', async () => {
      mockReq.query = { startDate: '2024/01/01' };

      await expect(getAuditLogs(mockReq as Request, mockRes as Response, () => {})).rejects.toThrow(
        'startDate 格式错误，应为 YYYY-MM-DD'
      );
    });

    it('should throw BadRequestError for invalid endDate format', async () => {
      mockReq.query = { endDate: '2024-1-1' };

      await expect(getAuditLogs(mockReq as Request, mockRes as Response, () => {})).rejects.toThrow(
        'endDate 格式错误，应为 YYYY-MM-DD'
      );
    });

    it('should correct page parameter when less than 1', async () => {
      vi.mocked(auditLogService.queryAuditLogs).mockResolvedValue(mockQueryResult as any);
      mockReq.query = { page: '0' };

      await getAuditLogs(mockReq as Request, mockRes as Response, () => {});

      expect(auditLogService.queryAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1 })
      );
    });

    it('should correct page parameter when negative', async () => {
      vi.mocked(auditLogService.queryAuditLogs).mockResolvedValue(mockQueryResult as any);
      mockReq.query = { page: '-5' };

      await getAuditLogs(mockReq as Request, mockRes as Response, () => {});

      expect(auditLogService.queryAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1 })
      );
    });

    it('should correct limit parameter when greater than 100', async () => {
      vi.mocked(auditLogService.queryAuditLogs).mockResolvedValue(mockQueryResult as any);
      mockReq.query = { limit: '200' };

      await getAuditLogs(mockReq as Request, mockRes as Response, () => {});

      expect(auditLogService.queryAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 })
      );
    });

    it('should correct limit parameter when less than 1', async () => {
      vi.mocked(auditLogService.queryAuditLogs).mockResolvedValue(mockQueryResult as any);
      mockReq.query = { limit: '0' };

      await getAuditLogs(mockReq as Request, mockRes as Response, () => {});

      expect(auditLogService.queryAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 1 })
      );
    });

    it('should handle empty result set', async () => {
      const emptyResult = { list: [], total: 0, page: 1, limit: 20 };
      vi.mocked(auditLogService.queryAuditLogs).mockResolvedValue(emptyResult);

      await getAuditLogs(mockReq as Request, mockRes as Response, () => {});

      expect(mockJson).toHaveBeenCalledWith({
        code: 200,
        message: 'success',
        data: emptyResult,
      });
    });
  });
});
