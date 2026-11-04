import { Router } from 'express';
import userRoutes from './user';
import gameRoutes from './game';
import levelRoutes from './level';
import adminRoutes from './admin';
import logsRoutes from './logs';
import voiceRoutes from './voice';
import feedbackRoutes from './feedback';
import roomRoutes from './room';
import { getPublicSettings } from '../controllers/adminController';

const router = Router();

router.use('/user', userRoutes);
router.use('/game', gameRoutes);
router.use('/level', levelRoutes);
router.use('/admin', adminRoutes);
router.use('/logs', logsRoutes);
router.use('/voice', voiceRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/room', roomRoutes);

/**
 * @swagger
 * /api/settings/public:
 *   get:
 *     summary: 获取公开设置（客户端护眼守卫读取默认间隔）
 *     tags: [Public]
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 */
// 公开全局设置（客户端护眼守卫读取默认间隔）
router.get('/settings/public', getPublicSettings);

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: 健康检查
 *     tags: [Public]
 *     responses:
 *       200:
 *         description: 服务正常
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
// 健康检查
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
