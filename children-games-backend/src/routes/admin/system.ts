import { Router } from 'express';
import {
  getErrorLogs,
  clearErrorLogs,
  downloadBackup,
  listAutoBackups,
} from '../../controllers/adminController';
import { getAuditLogs } from '../../controllers/auditLogController';
import { adminMiddleware } from '../../middleware/adminAuth';
import { auditLog } from '../../middleware/auditLog';
import { redisMonitor } from '../../services/redisMonitor';

const router = Router();

// 所有系统管理路由需要管理员认证
router.use(adminMiddleware);

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
router.get('/backups', listAutoBackups);

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
router.get('/redis-stats', async (_req, res) => {
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
router.get('/audit-logs', getAuditLogs);

export default router;
