import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { logError } from '../utils/logger';
import { success, asyncHandler } from '../utils/response';

const router = Router();

/**
 * @swagger
 * /api/logs/client:
 *   post:
 *     summary: 客户端错误上报
 *     description: 需登录，防止滥用
 *     tags: [Logs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string, description: 错误信息（最长 300 字符） }
 *               detail: { type: string, description: 详细堆栈/上下文（最长 1500 字符） }
 *     responses:
 *       200:
 *         description: 上报成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     ok: { type: boolean, example: true }
 *       401:
 *         description: 未认证
 */
router.post(
  '/client',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res) => {
    const { message, detail } = req.body || {};
    if (message) {
      logError(
        'client',
        `用户${req.userId}: ${String(message).slice(0, 300)}`,
        detail ? String(detail).slice(0, 1500) : undefined
      );
    }
    success(res, { ok: true });
  })
);

export default router;
