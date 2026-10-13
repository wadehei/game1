import { Router } from 'express';
import { getLevelOverride } from '../controllers/levelController';

const router = Router();

// 关卡覆盖配置（公开；无覆盖时 override 为 null，默认难度用前端内置公式）
router.get('/:gameId/:level', getLevelOverride);

export default router;
