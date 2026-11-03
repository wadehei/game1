import { Router } from 'express';
import { submitFeedback, listFeedbacks, addFeedbackReply } from '../controllers/feedbackController';
import { authMiddleware, userOrAdminAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { submitFeedbackSchema, addReplySchema } from '../validators/schemas';

const router = Router();

/**
 * @swagger
 * /api/feedback:
 *   post:
 *     summary: 提交意见反馈
 *     tags: [Feedback]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: string, description: 反馈内容 }
 *               contact: { type: string, description: 联系方式（可选） }
 *     responses:
 *       200:
 *         description: 提交成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: 未认证
 */
router.post('/', authMiddleware, validateBody(submitFeedbackSchema), submitFeedback);

/**
 * @swagger
 * /api/feedback:
 *   get:
 *     summary: 获取反馈列表
 *     description: 所有登录用户可见；控制台凭证额外返回内部备注
 *     tags: [Feedback]
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
router.get('/', userOrAdminAuth, listFeedbacks);

/**
 * @swagger
 * /api/feedback/{id}/replies:
 *   post:
 *     summary: 回复反馈
 *     description: 登录用户可回复；控制台凭证视为官方回复
 *     tags: [Feedback]
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
 *               content: { type: string, description: 回复内容 }
 *     responses:
 *       200:
 *         description: 回复成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: 未认证
 */
router.post('/:id/replies', userOrAdminAuth, validateBody(addReplySchema), addFeedbackReply);

export default router;
