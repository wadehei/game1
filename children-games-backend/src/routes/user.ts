import { Router } from 'express';
import { getUserInfo, updateUserInfo } from '../controllers/userController';
import { wxLogin, testLogin, familyLogin, getProfiles } from '../controllers/loginController';
import { updateMyPin } from '../controllers/pinController';
import { getMyCareer, getBattleCareer, reportPlaytime } from '../controllers/careerController';
import { authMiddleware } from '../middleware/auth';
import { recordPlay } from '../controllers/gameController';
import { loginLimiter } from '../middleware/rateLimiter';
import { validateBody } from '../middleware/validate';
import {
  wxLoginSchema,
  testLoginSchema,
  familyLoginSchema,
  updateUserInfoSchema,
  updatePinSchema,
  reportPlaytimeSchema,
} from '../validators/schemas';

const router = Router();

/**
 * @swagger
 * /api/user/login/wx:
 *   post:
 *     summary: 微信小程序登录
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: { type: string, description: 微信登录凭证 }
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
router.post('/login/wx', loginLimiter, validateBody(wxLoginSchema), wxLogin);

/**
 * @swagger
 * /api/user/login/test:
 *   post:
 *     summary: 测试环境登录
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username]
 *             properties:
 *               username: { type: string, description: 用户名 }
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
router.post('/login/test', loginLimiter, validateBody(testLoginSchema), testLogin);

/**
 * @swagger
 * /api/user/login/family:
 *   post:
 *     summary: 家庭角色登录
 *     description: 支持 uid 直接登录、带口令角色验证、昵称+角色创建
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               uid: { type: integer, description: 用户 ID }
 *               pin: { type: string, description: 角色口令 }
 *               nickname: { type: string, description: 昵称 }
 *               role: { type: string, description: 家庭角色 }
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
router.post('/login/family', loginLimiter, validateBody(familyLoginSchema), familyLogin);

/**
 * @swagger
 * /api/user/profiles:
 *   get:
 *     summary: 家庭成员列表
 *     description: 选角色页使用，无需认证
 *     tags: [User]
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.get('/profiles', getProfiles);

/**
 * @swagger
 * /api/user/info:
 *   get:
 *     summary: 获取当前用户信息
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: 未认证
 */
router.get('/info', authMiddleware, getUserInfo);

/**
 * @swagger
 * /api/user/info:
 *   put:
 *     summary: 更新用户信息
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nickname: { type: string }
 *               avatar: { type: string }
 *     responses:
 *       200:
 *         description: 更新成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: 未认证
 */
router.put('/info', authMiddleware, validateBody(updateUserInfoSchema), updateUserInfo);

/**
 * @swagger
 * /api/user/career:
 *   get:
 *     summary: 获取我的生涯数据
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: 未认证
 */
router.get('/career', authMiddleware, getMyCareer);

/**
 * @swagger
 * /api/user/battle/career:
 *   get:
 *     summary: 获取好友对战生涯（积分+战绩流水）
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: 未认证
 */
router.get('/battle/career', authMiddleware, getBattleCareer);

/**
 * @swagger
 * /api/user/pin:
 *   put:
 *     summary: 设置/修改角色口令
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pin: { type: string, description: 新口令 }
 *     responses:
 *       200:
 *         description: 设置成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: 未认证
 */
router.put('/pin', authMiddleware, validateBody(updatePinSchema), updateMyPin);

/**
 * @swagger
 * /api/user/playtime:
 *   post:
 *     summary: 游玩时长心跳上报
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               gameId: { type: string }
 *               duration: { type: integer, description: 时长（秒） }
 *     responses:
 *       200:
 *         description: 上报成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: 未认证
 */
router.post('/playtime', authMiddleware, validateBody(reportPlaytimeSchema), reportPlaytime);

/**
 * @swagger
 * /api/user/play/{gameId}:
 *   post:
 *     summary: 记录一局游玩（失败结算）
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: string
 *         description: 游戏 ID
 *     responses:
 *       200:
 *         description: 记录成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: 未认证
 */
router.post('/play/:gameId', authMiddleware, recordPlay);

export default router;
