import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { logError } from '../utils/logger';
import { success, asyncHandler } from '../utils/response';

const router = Router();

// 客户端错误上报（需登录，防止滥用）
router.post('/client', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const { message, detail } = req.body || {};
  if (message) {
    logError(
      'client',
      `用户${req.userId}: ${String(message).slice(0, 300)}`,
      detail ? String(detail).slice(0, 1500) : undefined
    );
  }
  success(res, { ok: true });
}));

export default router;
