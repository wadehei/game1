import { Router } from 'express';
import userRoutes from './user';
import gameRoutes from './game';
import levelRoutes from './level';
import adminRoutes from './admin';
import logsRoutes from './logs';
import voiceRoutes from './voice';
import feedbackRoutes from './feedback';
import { getPublicSettings } from '../controllers/adminController';

const router = Router();

router.use('/user', userRoutes);
router.use('/game', gameRoutes);
router.use('/level', levelRoutes);
router.use('/admin', adminRoutes);
router.use('/logs', logsRoutes);
router.use('/voice', voiceRoutes);
router.use('/feedback', feedbackRoutes);

// 公开全局设置（客户端护眼守卫读取默认间隔）
router.get('/settings/public', getPublicSettings);

// 健康检查
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
