import { Router } from 'express';
import {
  getAllProgress,
  getGameProgress,
  updateGameProgress,
  getDailyTask,
  getAchievements,
  getLeaderboard,
  getStarsLeaderboard,
} from '../controllers/gameController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * /api/game/progress:
 *   get:
 *     summary: 获取所有游戏进度
 *     tags: [Game]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   additionalProperties:
 *                     $ref: '#/components/schemas/GameProgress'
 *       401:
 *         description: 未认证
 */
router.get('/progress', authMiddleware, getAllProgress);

/**
 * @swagger
 * /api/game/progress/{gameId}:
 *   get:
 *     summary: 获取单个游戏进度
 *     tags: [Game]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: string
 *         description: 游戏 ID
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
router.get('/progress/:gameId', authMiddleware, getGameProgress);

/**
 * @swagger
 * /api/game/progress/{gameId}:
 *   post:
 *     summary: 更新游戏进度
 *     tags: [Game]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: string
 *         description: 游戏 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               score: { type: integer }
 *               stars: { type: integer }
 *               level: { type: integer }
 *     responses:
 *       200:
 *         description: 更新成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: 未认证
 */
router.post('/progress/:gameId', authMiddleware, updateGameProgress);

/**
 * @swagger
 * /api/game/daily-task:
 *   get:
 *     summary: 获取每日任务进度
 *     tags: [Game]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/DailyTask'
 *       401:
 *         description: 未认证
 */
router.get('/daily-task', authMiddleware, getDailyTask);

/**
 * @swagger
 * /api/game/achievements:
 *   get:
 *     summary: 获取成就列表
 *     tags: [Game]
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
router.get('/achievements', authMiddleware, getAchievements);

/**
 * @swagger
 * /api/game/leaderboard/{gameId}:
 *   get:
 *     summary: 获取游戏排行榜
 *     description: 公开接口，无需认证
 *     tags: [Game]
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: string
 *         description: 游戏 ID
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.get('/leaderboard/stars', getStarsLeaderboard);
router.get('/leaderboard/:gameId', getLeaderboard);

export default router;
