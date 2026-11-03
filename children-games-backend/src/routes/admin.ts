import { Router } from 'express';
import {
  adminLogin,
  getOverview,
  getUsers,
  updateUser,
  adjustUserChips,
  resetUserProgress,
  deleteUser,
  clearUserPin,
  getSettings,
  updateSettings,
  getLevelOverrides,
  saveLevelOverride,
  deleteLevelOverride,
  getErrorLogs,
  clearErrorLogs,
  downloadBackup,
  listAutoBackups,
  quizList,
  quizCreate,
  quizUpdate,
  quizDelete,
  quizImport,
} from '../controllers/adminController';
import {
  setup2fa,
  verify2fa,
  disable2faHandler,
  get2faStatus,
} from '../controllers/twoFactorController';
import { listFeedbacks, updateFeedback, addFeedbackReply } from '../controllers/feedbackController';
import { getAuditLogs } from '../controllers/auditLogController';
import { adminMiddleware } from '../middleware/adminAuth';
import { adminLoginLimiter } from '../middleware/rateLimiter';
import { validateBody } from '../middleware/validate';
import { auditLog, auditLogin } from '../middleware/auditLog';
import {
  adminLoginSchema,
  adjustChipsSchema,
  updateSettingsSchema,
  addReplySchema,
  quizSchema,
  twoFactorVerifySchema,
  twoFactorSetupSchema,
  twoFactorDisableSchema,
} from '../validators/schemas';
import { redisMonitor } from '../services/redisMonitor';

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

// ─── 以下路由需要管理员认证 ────────────────────────────────
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
router.get('/overview', adminMiddleware, getOverview);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: 获取用户列表
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
router.get('/users', adminMiddleware, getUsers);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   put:
 *     summary: 更新用户信息
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 用户 ID
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
 *       403:
 *         description: 非管理员
 */
router.put(
  '/users/:id',
  adminMiddleware,
  auditLog('user.update', {
    extractTarget: (req) => ({ targetType: 'user', targetId: Number(req.params.id) }),
  }),
  updateUser
);

/**
 * @swagger
 * /api/admin/users/{id}/chips:
 *   put:
 *     summary: 调整用户筹码/积分
 *     tags: [Admin]
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
 *               delta: { type: integer, description: 增减数量（正数加，负数减） }
 *     responses:
 *       200:
 *         description: 调整成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       403:
 *         description: 非管理员
 */
router.put(
  '/users/:id/chips',
  adminMiddleware,
  validateBody(adjustChipsSchema),
  auditLog('user.chips.adjust', {
    extractTarget: (req) => ({ targetType: 'user', targetId: Number(req.params.id) }),
  }),
  adjustUserChips
);

/**
 * @swagger
 * /api/admin/users/{id}/reset:
 *   post:
 *     summary: 重置用户游戏进度
 *     tags: [Admin]
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
 *         description: 重置成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       403:
 *         description: 非管理员
 */
router.post(
  '/users/:id/reset',
  adminMiddleware,
  auditLog('user.reset', {
    extractTarget: (req) => ({ targetType: 'user', targetId: Number(req.params.id) }),
  }),
  resetUserProgress
);

/**
 * @swagger
 * /api/admin/users/{id}/clear-pin:
 *   post:
 *     summary: 清除用户角色口令
 *     tags: [Admin]
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
 *         description: 清除成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       403:
 *         description: 非管理员
 */
router.post(
  '/users/:id/clear-pin',
  adminMiddleware,
  auditLog('user.pin.clear', {
    extractTarget: (req) => ({ targetType: 'user', targetId: Number(req.params.id) }),
  }),
  clearUserPin
);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   delete:
 *     summary: 删除用户
 *     tags: [Admin]
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
 *         description: 删除成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       403:
 *         description: 非管理员
 */
router.delete(
  '/users/:id',
  adminMiddleware,
  auditLog('user.delete', {
    extractTarget: (req) => ({ targetType: 'user', targetId: Number(req.params.id) }),
  }),
  deleteUser
);

/**
 * @swagger
 * /api/admin/settings:
 *   get:
 *     summary: 获取系统配置
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
router.get('/settings', adminMiddleware, getSettings);

/**
 * @swagger
 * /api/admin/settings:
 *   put:
 *     summary: 更新系统配置
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: 更新成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       403:
 *         description: 非管理员
 */
router.put(
  '/settings',
  adminMiddleware,
  validateBody(updateSettingsSchema),
  auditLog('settings.update'),
  updateSettings
);

/**
 * @swagger
 * /api/admin/levels/{gameId}:
 *   get:
 *     summary: 获取关卡难度覆盖配置列表
 *     tags: [Admin]
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
 *       403:
 *         description: 非管理员
 */
router.get('/levels/:gameId', adminMiddleware, getLevelOverrides);

/**
 * @swagger
 * /api/admin/levels/{gameId}/{level}:
 *   put:
 *     summary: 保存关卡难度覆盖配置
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: level
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
 *         description: 保存成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       403:
 *         description: 非管理员
 */
router.put(
  '/levels/:gameId/:level',
  adminMiddleware,
  auditLog('level.config.update', {
    extractTarget: (req) => ({ targetType: 'level', targetId: Number(req.params.level) }),
    extractDetails: (req) => ({
      gameId: req.params.gameId,
      level: Number(req.params.level),
      config: req.body?.config,
    }),
  }),
  saveLevelOverride
);

/**
 * @swagger
 * /api/admin/levels/{gameId}/{level}:
 *   delete:
 *     summary: 删除关卡难度覆盖配置
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: level
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 删除成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       403:
 *         description: 非管理员
 */
router.delete(
  '/levels/:gameId/:level',
  adminMiddleware,
  auditLog('level.config.delete', {
    extractTarget: (req) => ({ targetType: 'level', targetId: Number(req.params.level) }),
    extractDetails: (req) => ({ gameId: req.params.gameId, level: Number(req.params.level) }),
  }),
  deleteLevelOverride
);

/**
 * @swagger
 * /api/admin/logs:
 *   get:
 *     summary: 获取错误日志列表
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
router.get('/logs', adminMiddleware, auditLog('logs.view'), getErrorLogs);

/**
 * @swagger
 * /api/admin/logs:
 *   delete:
 *     summary: 清空错误日志
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 清空成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       403:
 *         description: 非管理员
 */
router.delete('/logs', adminMiddleware, auditLog('logs.clear'), clearErrorLogs);

/**
 * @swagger
 * /api/admin/backup:
 *   get:
 *     summary: 下载数据库备份
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 备份文件
 *       403:
 *         description: 非管理员
 */
router.get('/backup', adminMiddleware, auditLog('backup.download'), downloadBackup);

/**
 * @swagger
 * /api/admin/backups:
 *   get:
 *     summary: 列出自动备份文件
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
router.get('/backups', adminMiddleware, listAutoBackups);

/**
 * @swagger
 * /api/admin/quiz:
 *   get:
 *     summary: 获取题库列表（答题对战）
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
router.get('/quiz', adminMiddleware, quizList);

/**
 * @swagger
 * /api/admin/quiz:
 *   post:
 *     summary: 创建题目
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: 创建成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       403:
 *         description: 非管理员
 */
router.post(
  '/quiz',
  adminMiddleware,
  validateBody(quizSchema),
  auditLog('question.create'),
  quizCreate
);

/**
 * @swagger
 * /api/admin/quiz/{id}:
 *   put:
 *     summary: 更新题目
 *     tags: [Admin]
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
 *     responses:
 *       200:
 *         description: 更新成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       403:
 *         description: 非管理员
 */
router.put(
  '/quiz/:id',
  adminMiddleware,
  validateBody(quizSchema),
  auditLog('question.update', {
    extractTarget: (req) => ({ targetType: 'question', targetId: Number(req.params.id) }),
  }),
  quizUpdate
);

/**
 * @swagger
 * /api/admin/quiz/{id}:
 *   delete:
 *     summary: 删除题目
 *     tags: [Admin]
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
 *         description: 删除成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       403:
 *         description: 非管理员
 */
router.delete(
  '/quiz/:id',
  adminMiddleware,
  auditLog('question.delete', {
    extractTarget: (req) => ({ targetType: 'question', targetId: Number(req.params.id) }),
  }),
  quizDelete
);

/**
 * @swagger
 * /api/admin/quiz/import:
 *   post:
 *     summary: 批量导入题目
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               questions:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: 导入成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       403:
 *         description: 非管理员
 */
router.post('/quiz/import', adminMiddleware, auditLog('question.import'), quizImport);

/**
 * @swagger
 * /api/admin/feedback:
 *   get:
 *     summary: 获取意见反馈列表（含内部备注）
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
router.get('/feedback', adminMiddleware, listFeedbacks);

/**
 * @swagger
 * /api/admin/feedback/{id}:
 *   put:
 *     summary: 更新反馈（内部备注等）
 *     tags: [Admin]
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
 *     responses:
 *       200:
 *         description: 更新成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       403:
 *         description: 非管理员
 */
router.put(
  '/feedback/:id',
  adminMiddleware,
  auditLog('feedback.update', {
    extractTarget: (req) => ({ targetType: 'feedback', targetId: Number(req.params.id) }),
  }),
  updateFeedback
);

/**
 * @swagger
 * /api/admin/feedback/{id}/reply:
 *   post:
 *     summary: 官方回复反馈（所有用户可见）
 *     tags: [Admin]
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
 *               content: { type: string, description: 回复内容 }
 *     responses:
 *       200:
 *         description: 回复成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       403:
 *         description: 非管理员
 */
router.post(
  '/feedback/:id/reply',
  adminMiddleware,
  validateBody(addReplySchema),
  auditLog('feedback.reply', {
    extractTarget: (req) => ({ targetType: 'feedback', targetId: Number(req.params.id) }),
  }),
  addFeedbackReply
);

/**
 * @swagger
 * /api/admin/redis-stats:
 *   get:
 *     summary: 获取 Redis 监控统计
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 data:
 *                   type: object
 *                   properties:
 *                     hits: { type: integer }
 *                     misses: { type: integer }
 *                     alerts: { type: object }
 *                     timestamp: { type: string, format: date-time }
 *       403:
 *         description: 非管理员
 */
router.get('/redis-stats', adminMiddleware, (req, res) => {
  const stats = redisMonitor.getStats();
  const alerts = redisMonitor.getAlertStatus();
  res.json({
    code: 0,
    data: {
      ...stats,
      alerts,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * @swagger
 * /api/admin/audit-logs:
 *   get:
 *     summary: 查询审计日志（分页）
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: 每页数量
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: 按动作类型过滤
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: 开始日期 YYYY-MM-DD
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: 结束日期 YYYY-MM-DD
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
router.get('/audit-logs', adminMiddleware, getAuditLogs);

// ─── 2FA 双因素认证 ────────────────────────────────

/**
 * @swagger
 * /api/admin/2fa/setup:
 *   post:
 *     summary: 初始化 2FA 设置（生成密钥和二维码）
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
 *               password: { type: string, description: 确认管理员密码 }
 *     responses:
 *       200:
 *         description: 返回 TOTP 密钥和二维码图片
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.post('/2fa/setup', validateBody(twoFactorSetupSchema), auditLog('2fa.setup'), setup2fa);

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
router.post('/2fa/verify', validateBody(twoFactorVerifySchema), auditLog('2fa.verify'), verify2fa);

/**
 * @swagger
 * /api/admin/2fa/disable:
 *   post:
 *     summary: 解绑 2FA
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
 *               password: { type: string, description: 确认管理员密码 }
 *     responses:
 *       200:
 *         description: 解绑成功
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
 *     summary: 查询 2FA 状态
 *     tags: [Admin 2FA]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 当前 2FA 状态
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.get('/2fa/status', get2faStatus);

export default router;
