import { Request, Response } from 'express';
import { queryAuditLogs } from '../services/auditLogService';
import { asyncHandler, success } from '../utils/response';
import { BadRequestError } from '../errors/AppError';

/**
 * 查询审计日志（分页）
 *
 * Query 参数：
 * - page: 页码（默认 1）
 * - limit: 每页数量（默认 20，最大 100）
 * - action: 按动作类型过滤（可选）
 * - startDate: 开始日期 YYYY-MM-DD（可选）
 * - endDate: 结束日期 YYYY-MM-DD（可选）
 */
export const getAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
  const action = req.query.action ? String(req.query.action) : undefined;
  const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
  const endDate = req.query.endDate ? String(req.query.endDate) : undefined;

  // 验证日期格式
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw new BadRequestError('startDate 格式错误，应为 YYYY-MM-DD');
  }
  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new BadRequestError('endDate 格式错误，应为 YYYY-MM-DD');
  }

  const result = await queryAuditLogs({
    page,
    limit,
    action,
    startDate,
    endDate,
  });

  success(res, result);
});
