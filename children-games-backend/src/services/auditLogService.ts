import { Request } from 'express';
import { AuditLog } from '../models';
import { logError } from '../utils/logger';

/**
 * 审计日志服务
 * 负责记录管理员操作到数据库
 */
export interface AuditLogData {
  adminId: number;
  action: string;
  targetType?: string;
  targetId?: number;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * 记录审计日志
 * 使用异步方式写入，避免阻塞主业务流程
 * 失败时只记录错误日志，不影响业务执行
 */
export const recordAuditLog = async (data: AuditLogData): Promise<void> => {
  try {
    await AuditLog.create({
      adminId: data.adminId,
      action: data.action,
      targetType: data.targetType || null,
      targetId: data.targetId || null,
      details: data.details || null,
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
    });
  } catch (error) {
    // 审计日志写入失败不应影响业务流程，只记录错误
    logError(
      'audit',
      `审计日志写入失败: action=${data.action}`,
      error instanceof Error ? error.stack : String(error)
    );
  }
};

/**
 * 从请求中提取审计日志所需的信息
 * 在中间件中调用，供后续写入使用
 */
export const extractAuditInfo = (req: Request): Pick<AuditLogData, 'ipAddress' | 'userAgent'> => {
  return {
    ipAddress: extractClientIp(req),
    userAgent: req.get('user-agent') || null,
  };
};

/**
 * 提取客户端真实 IP
 * 优先从 X-Forwarded-For 获取（经过代理/负载均衡时），否则使用 req.ip
 */
export const extractClientIp = (req: Request): string | null => {
  // X-Forwarded-For 可能包含多个 IP（经过多层代理），取第一个（真实客户端）
  const forwardedFor = req.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0].trim();
    if (firstIp) {
      return firstIp;
    }
  }

  // req.ip 在 Express 中已经考虑了 trust proxy 设置
  if (req.ip) {
    // IPv6 回环地址转换为 IPv4
    return req.ip === '::1' ? '127.0.0.1' : req.ip;
  }

  return null;
};

/**
 * 查询审计日志（分页）
 */
export const queryAuditLogs = async (params: {
  page: number;
  limit: number;
  action?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{ list: AuditLog[]; total: number; page: number; limit: number }> => {
  const { Op } = await import('sequelize');
  const where: Record<string, unknown> = {};

  // 按动作类型过滤
  if (params.action) {
    where.action = params.action;
  }

  // 按时间范围过滤
  if (params.startDate || params.endDate) {
    where.createdAt = {};
    if (params.startDate) {
      where.createdAt[Op.gte] = new Date(params.startDate);
    }
    if (params.endDate) {
      // endDate 的次日零点，确保包含整个 endDate 当天
      const endDateObj = new Date(params.endDate);
      endDateObj.setDate(endDateObj.getDate() + 1);
      where.createdAt[Op.lt] = endDateObj;
    }
  }

  const { rows, count } = await AuditLog.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    offset: (params.page - 1) * params.limit,
    limit: params.limit,
  });

  return {
    list: rows,
    total: count,
    page: params.page,
    limit: params.limit,
  };
};

/**
 * 清理过期的审计日志（保留 90 天）
 * 应该在定时任务中调用（例如每日凌晨执行）
 */
export const cleanupExpiredAuditLogs = async (): Promise<number> => {
  const { Op } = await import('sequelize');
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  try {
    const deletedCount = await AuditLog.destroy({
      where: {
        createdAt: {
          [Op.lt]: ninetyDaysAgo,
        },
      },
    });

    return deletedCount;
  } catch (error) {
    logError('audit', '清理过期审计日志失败', error instanceof Error ? error.stack : String(error));
    return 0;
  }
};
