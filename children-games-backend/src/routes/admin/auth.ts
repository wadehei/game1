import { Router } from 'express';
import { adminLogin, adminLogout } from '../../controllers/adminController';
import {
  setup2fa,
  verify2fa,
  disable2faHandler,
  get2faStatus,
} from '../../controllers/twoFactorController';
import { adminMiddleware } from '../../middleware/adminAuth';
import { adminLoginLimiter } from '../../middleware/rateLimiter';
import { validateBody } from '../../middleware/validate';
import { auditLog, auditLogin } from '../../middleware/auditLog';
import {
  adminLoginSchema,
  twoFactorVerifySchema,
  twoFactorSetupSchema,
  twoFactorDisableSchema,
} from '../../validators/schemas';

const router = Router();

// ─── 公开路由（无需认证） ────────────────────────────────

/**
 * @swagger
 * /api/admin/login:
 *   post:
 *     summary: 管理员登录
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               username: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: 登录成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       429:
 *         description: 请求过于频繁
 */
router.post('/login', adminLoginLimiter, validateBody(adminLoginSchema), auditLogin(), adminLogin);

/**
 * @swagger
 * /api/admin/2fa/verify:
 *   post:
 *     summary: 验证 2FA 验证码（登录第二步 或 绑定确认）
 *     tags: [Admin 2FA]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               token: { type: string, description: 登录第二步时的临时令牌 }
 *               code: { type: string, description: 6位数字验证码 }
 *     responses:
 *       200:
 *         description: 验证成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
// 注意：/2fa/verify 必须放在 adminMiddleware 之前
// 因为登录第二步使用临时令牌（purpose=2fa_pending），会被 adminMiddleware 拒绝
router.post('/2fa/verify', validateBody(twoFactorVerifySchema), auditLog('2fa.verify'), verify2fa);

// ─── 以下路由需要管理员认证 ────────────────────────────────
router.use(adminMiddleware);

/**
 * @swagger
 * /api/admin/logout:
 *   post:
 *     summary: 管理员登出
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 登出成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: 未授权
 */
router.post('/logout', auditLog('admin.logout'), adminLogout);

/**
 * @swagger
 * /api/admin/2fa/setup:
 *   post:
 *     summary: 生成 2FA 密钥和二维码（需密码确认）
 *     tags: [Admin 2FA]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.post('/2fa/setup', validateBody(twoFactorSetupSchema), auditLog('2fa.setup'), setup2fa);

/**
 * @swagger
 * /api/admin/2fa/disable:
 *   post:
 *     summary: 解绑 2FA（需密码确认）
 *     tags: [Admin 2FA]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.post(
  '/2fa/disable',
  validateBody(twoFactorDisableSchema),
  auditLog('2fa.disable'),
  disable2faHandler
);

/**
 * @swagger
 * /api/admin/2fa/status:
 *   get:
 *     summary: 查询当前 2FA 状态
 *     tags: [Admin 2FA]
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
router.get('/2fa/status', get2faStatus);

export default router;
