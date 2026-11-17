import { Router } from 'express';
import { z } from 'zod';
import {
  getErrorLogs,
  clearErrorLogs,
  downloadBackup,
  listAutoBackups,
} from '../../controllers/adminController';
import { getAuditLogs } from '../../controllers/auditLogController';
import { eventsSummary } from '../../controllers/trackController';
import { adminMiddleware } from '../../middleware/adminAuth';
import { auditLog } from '../../middleware/auditLog';
import { validateQuery } from '../../middleware/validate';
import { redisMonitor } from '../../services/redisMonitor';

const router = Router();

/** 审计日志分页参数校验（startDate/endDate 供 auditLogController 时间范围过滤，勿删） */
const auditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().optional(),
  adminId: z.coerce.number().int().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// 所有系统管理路由需要管理员认证
router.use(adminMiddleware);

/** 行为埋点聚合窗口（天数） */
const eventsSummaryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});

/**
 * @swagger
 * /api/admin/logs:
 *   get:
 *     summary: 获取错误日志
 *     tags: [Admin System]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.get('/logs', auditLog('logs.view'), getErrorLogs);

/**
 * @swagger
 * /api/admin/logs:
 *   delete:
 *     summary: 清除错误日志
 *     tags: [Admin System]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.delete('/logs', auditLog('logs.clear'), clearErrorLogs);

/**
 * @swagger
 * /api/admin/backup:
 *   get:
 *     summary: 下载手动备份
 *     tags: [Admin System]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功（返回 JSON 文件）
 */
router.get('/backup', auditLog('backup.download'), downloadBackup);

/**
 * @swagger
 * /api/admin/backups:
 *   get:
 *     summary: 获取自动备份列表
 *     tags: [Admin System]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.get('/backups', auditLog('backups.list'), listAutoBackups);

/**
 * @swagger
 * /api/admin/redis-stats:
 *   get:
 *     summary: 获取 Redis 监控统计
 *     tags: [Admin System]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.get('/redis-stats', auditLog('redis-stats.view'), async (_req, res) => {
  const stats = await redisMonitor.getStats();
  res.json({ code: 200, message: 'success', data: stats });
});

/**
 * @swagger
 * /api/admin/audit-logs:
 *   get:
 *     summary: 获取审计日志列表（分页）
 *     tags: [Admin System]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.get(
  '/audit-logs',
  validateQuery(auditLogsQuerySchema),
  auditLog('audit-logs.view'),
  getAuditLogs
);

export default router;

/**
 * @swagger
 * /api/admin/events/summary:
 *   get:
 *     summary: 行为埋点聚合（近 N 天：按类型/按游戏/3D 模式使用率）
 *     tags: [Admin System]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 聚合结果
 */
router.get('/events/summary', validateQuery(eventsSummaryQuerySchema), eventsSummary);
