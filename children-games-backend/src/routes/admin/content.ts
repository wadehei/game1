import { Router } from 'express';
import {
  quizList,
  quizCreate,
  quizUpdate,
  quizDelete,
  quizImport,
} from '../../controllers/adminController';
import {
  listFeedbacks,
  updateFeedback,
  addFeedbackReply,
} from '../../controllers/feedbackController';
import { adminMiddleware } from '../../middleware/adminAuth';
import { validateBody } from '../../middleware/validate';
import { auditLog } from '../../middleware/auditLog';
import { quizSchema, addReplySchema, quizImportSchema } from '../../validators/schemas';

const router = Router();

// 所有内容管理路由需要管理员认证
router.use(adminMiddleware);

// ─── 题库管理 ────────────────────────────────

/**
 * @swagger
 * /api/admin/quiz:
 *   get:
 *     summary: 获取题库列表（分页）
 *     tags: [Admin Quiz]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: category
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
router.get('/quiz', quizList);

/**
 * @swagger
 * /api/admin/quiz:
 *   post:
 *     summary: 创建题目
 *     tags: [Admin Quiz]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [question, answer, category]
 *             properties:
 *               question: { type: string }
 *               answer: { type: string }
 *               category: { type: string }
 *               difficulty: { type: integer }
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.post('/quiz', validateBody(quizSchema), auditLog('question.create'), quizCreate);

/**
 * @swagger
 * /api/admin/quiz/{id}:
 *   put:
 *     summary: 更新题目
 *     tags: [Admin Quiz]
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
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.put(
  '/quiz/:id',
  validateBody(quizSchema),
  auditLog('question.update', {
    extractTarget: (req) => ({ targetType: 'quiz', targetId: Number(req.params.id) }),
  }),
  quizUpdate
);

/**
 * @swagger
 * /api/admin/quiz/{id}:
 *   delete:
 *     summary: 删除题目
 *     tags: [Admin Quiz]
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
  '/quiz/:id',
  auditLog('question.delete', {
    extractTarget: (req) => ({ targetType: 'quiz', targetId: Number(req.params.id) }),
  }),
  quizDelete
);

/**
 * @swagger
 * /api/admin/quiz/import:
 *   post:
 *     summary: 批量导入题目
 *     tags: [Admin Quiz]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [questions]
 *             properties:
 *               questions:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.post(
  '/quiz/import',
  validateBody(quizImportSchema),
  auditLog('question.import'),
  quizImport
);

// ─── 反馈管理 ────────────────────────────────

/**
 * @swagger
 * /api/admin/feedback:
 *   get:
 *     summary: 获取反馈列表
 *     tags: [Admin Feedback]
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
router.get('/feedback', listFeedbacks);

/**
 * @swagger
 * /api/admin/feedback/{id}:
 *   put:
 *     summary: 更新反馈状态
 *     tags: [Admin Feedback]
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
 *               status: { type: string, enum: [pending, replied, archived] }
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.put(
  '/feedback/:id',
  auditLog('feedback.update', {
    extractTarget: (req) => ({ targetType: 'feedback', targetId: Number(req.params.id) }),
  }),
  updateFeedback
);

/**
 * @swagger
 * /api/admin/feedback/{id}/reply:
 *   post:
 *     summary: 添加反馈回复
 *     tags: [Admin Feedback]
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
 *             required: [content]
 *             properties:
 *               content: { type: string }
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.post(
  '/feedback/:id/reply',
  validateBody(addReplySchema),
  auditLog('feedback.reply', {
    extractTarget: (req) => ({ targetType: 'feedback', targetId: Number(req.params.id) }),
  }),
  addFeedbackReply
);

export default router;
