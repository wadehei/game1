import { Router } from 'express';
import {
  getOverview,
  getSettings,
  updateSettings,
  getLevelOverrides,
  saveLevelOverride,
  deleteLevelOverride,
} from '../../controllers/adminController';
import { adminMiddleware } from '../../middleware/adminAuth';
import { validateBody } from '../../middleware/validate';
import { auditLog } from '../../middleware/auditLog';
import { updateSettingsSchema } from '../../validators/schemas';

const router = Router();

// 所有设置路由需要管理员认证
router.use(adminMiddleware);

/**
 * @swagger
 * /api/admin/overview:
 *   get:
 *     summary: 获取管理后台概览数据
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       403:
 *         description: 非管理员
 */
router.get('/overview', getOverview);

/**
 * @swagger
 * /api/admin/settings:
 *   get:
 *     summary: 获取系统设置
 *     tags: [Admin Settings]
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
router.get('/settings', auditLog('settings.view'), getSettings);

/**
 * @swagger
 * /api/admin/settings:
 *   put:
 *     summary: 更新系统设置
 *     tags: [Admin Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               restIntervalMinutes: { type: integer }
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.put(
  '/settings',
  validateBody(updateSettingsSchema),
  auditLog('settings.update'),
  updateSettings
);

/**
 * @swagger
 * /api/admin/levels/{gameId}:
 *   get:
 *     summary: 获取关卡覆盖配置
 *     tags: [Admin Levels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
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
router.get('/levels/:gameId', getLevelOverrides);

/**
 * @swagger
 * /api/admin/levels/{gameId}/{levelNumber}:
 *   put:
 *     summary: 保存关卡覆盖配置
 *     tags: [Admin Levels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: levelNumber
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.put(
  '/levels/:gameId/:levelNumber',
  auditLog('level.save', {
    extractTarget: (req) => ({
      targetType: 'level',
      targetId: Number(req.params.levelNumber),
    }),
  }),
  saveLevelOverride
);

/**
 * @swagger
 * /api/admin/levels/{gameId}/{levelNumber}:
 *   delete:
 *     summary: 删除关卡覆盖配置
 *     tags: [Admin Levels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: levelNumber
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.delete(
  '/levels/:gameId/:levelNumber',
  auditLog('level.delete', {
    extractTarget: (req) => ({
      targetType: 'level',
      targetId: Number(req.params.levelNumber),
    }),
  }),
  deleteLevelOverride
);

export default router;
