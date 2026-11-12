import { Router } from 'express';
import { getLevelOverride } from '../controllers/levelController';

const router = Router();

/**
 * @swagger
 * /api/level/{gameId}/{level}:
 *   get:
 *     summary: 获取关卡覆盖配置
 *     description: 公开接口；无覆盖时 override 为 null，默认难度用前端内置公式
 *     tags: [Level]
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
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.get('/:gameId/:level', getLevelOverride);

export default router;
