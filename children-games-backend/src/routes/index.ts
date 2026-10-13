import { Router } from 'express';
import userRoutes from './user';
import gameRoutes from './game';
import levelRoutes from './level';

const router = Router();

router.use('/user', userRoutes);
router.use('/game', gameRoutes);
router.use('/level', levelRoutes);

// 健康检查
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
