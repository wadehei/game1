import { Request, Response, NextFunction } from 'express';
import { AdminRequest } from './adminAuth';
import { recordAuditLog, extractAuditInfo } from '../services/auditLogService';
import { logError } from '../utils/logger';

/**
 * 审计日志中间件
 * 在管理员路由中使用，自动记录操作到 audit_logs 表
 *
 * @param action 审计动作标识（如 'admin.login', 'user.update' 等）
 * @param options 可选配置
 *   - extractTarget: 从请求中提取目标类型和ID的函数
 *   - extractDetails: 从请求中提取详细信息的函数（默认记录 body 和 params）
 *
 * 用法示例：
 * router.post('/login', auditLog('admin.login'), adminLogin);
 * router.put('/users/:id', auditLog('user.update', {
 *   extractTarget: (req) => ({ targetType: 'user', targetId: Number(req.params.id) }),
 * }), updateUser);
 */
export const auditLog = (
  action: string,
  options?: {
    extractTarget?: (req: Request) => { targetType?: string; targetId?: number };
    extractDetails?: (req: Request) => Record<string, unknown>;
  }
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 提取客户端信息
      const { ipAddress, userAgent } = extractAuditInfo(req);

      // 提取目标信息
      const target = options?.extractTarget?.(req) || {};

      // 提取详细信息（默认包含 body 和 params）
      const details = options?.extractDetails?.(req) || {
        body: req.body,
        params: req.params,
        query: req.query,
      };

      // 判断是否为管理员操作（通过 AdminRequest 的 admin 属性）
      // adminId 由 adminMiddleware 从 JWT 中解析并设置
      const adminReq = req as AdminRequest;
      const adminId = adminReq.adminId ?? (adminReq.admin ? 1 : 0);

      // 记录审计日志（异步执行，不阻塞响应）
      // 注意：这里使用 Promise 但不 await，让日志写入在后台进行
      recordAuditLog({
        adminId,
        action,
        targetType: target.targetType || undefined,
        targetId: target.targetId || undefined,
        details,
        ipAddress,
        userAgent,
      }).catch((error) => {
        // 额外捕获异步写入错误，防止未处理的 Promise 拒绝
        logError(
          'audit',
          `审计日志异步写入失败: action=${action}`,
          error instanceof Error ? error.stack : String(error)
        );
      });

      next();
    } catch (error) {
      // 审计中间件本身的错误不应阻断业务请求
      logError(
        'audit',
        `审计中间件执行失败: action=${action}`,
        error instanceof Error ? error.stack : String(error)
      );
      next();
    }
  };
};

/**
 * 登录专用的审计中间件
 * 在登录成功返回 token 后记录（需要在响应后执行）
 */
export const auditLogin = () => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { ipAddress, userAgent } = extractAuditInfo(req);

    // 重写 res.json 以拦截登录成功的响应
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      // 登录成功（code: 200）时记录审计日志
      if (body && body.code === 200) {
        recordAuditLog({
          adminId: 0, // 登录时尚未确认管理员身份，使用默认值
          action: 'admin.login',
          targetType: undefined,
          targetId: undefined,
          details: {
            username: req.body?.username || 'unknown',
            success: true,
          },
          ipAddress,
          userAgent,
        }).catch((error) => {
          logError(
            'audit',
            '登录审计日志写入失败',
            error instanceof Error ? error.stack : String(error)
          );
        });
      }

      // 调用原始的 json 方法发送响应
      return originalJson(body);
    };

    next();
  };
};
