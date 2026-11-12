import { Router } from 'express';
import {
  getUsers,
  updateUser,
  adjustUserChips,
  resetUserProgress,
  deleteUser,
  clearUserPin,
} from '../../controllers/adminController';
import { adminMiddleware } from '../../middleware/adminAuth';
import { validateBody } from '../../middleware/validate';
import { auditLog } from '../../middleware/auditLog';
import { adjustChipsSchema, adminUpdateUserSchema } from '../../validators/schemas';

const router = Router();

// 所有用户管理路由需要管理员认证
router.use(adminMiddleware);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: 获取所有用户列表
 *     tags: [Admin Users]
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
router.get('/users', auditLog('users.list'), getUsers);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   put:
 *     summary: 更新用户信息
 *     tags: [Admin Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nickname: { type: string }
 *               avatar: { type: string }
 *               familyGroup: { type: string }
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.put(
  '/users/:id',
  validateBody(adminUpdateUserSchema),
  auditLog('user.update', {
    extractTarget: (req) => ({ targetType: 'user', targetId: Number(req.params.id) }),
  }),
  updateUser
);

/**
 * @swagger
 * /api/admin/users/{id}/chips:
 *   put:
 *     summary: 调整用户筹码
 *     tags: [Admin Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [delta, reason]
 *             properties:
 *               delta: { type: integer }
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.put(
  '/users/:id/chips',
  validateBody(adjustChipsSchema),
  auditLog('user.adjustChips', {
    extractTarget: (req) => ({ targetType: 'user', targetId: Number(req.params.id) }),
  }),
  adjustUserChips
);

/**
 * @swagger
 * /api/admin/users/{id}/reset:
 *   post:
 *     summary: 重置用户进度
 *     tags: [Admin Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
router.post(
  '/users/:id/reset',
  auditLog('user.reset', {
    extractTarget: (req) => ({ targetType: 'user', targetId: Number(req.params.id) }),
  }),
  resetUserProgress
);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   delete:
 *     summary: 删除用户
 *     tags: [Admin Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
  '/users/:id',
  auditLog('user.delete', {
    extractTarget: (req) => ({ targetType: 'user', targetId: Number(req.params.id) }),
  }),
  deleteUser
);

/**
 * @swagger
 * /api/admin/users/{id}/pin:
 *   delete:
 *     summary: 清除用户 PIN 码
 *     tags: [Admin Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
  '/users/:id/pin',
  auditLog('user.clearPin', {
    extractTarget: (req) => ({ targetType: 'user', targetId: Number(req.params.id) }),
  }),
  clearUserPin
);

export default router;
