import { Router } from 'express';
import { getLevelConfig } from '../controllers/levelController';

const router = Router();

// 关卡配置接口
router.get('/:gameId', getLevelConfig);

export default router;
