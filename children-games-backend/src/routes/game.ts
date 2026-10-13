import { Router } from 'express';
import { getAllProgress, getGameProgress, updateGameProgress, getDailyTask, getAchievements, getLeaderboard } from '../controllers/gameController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 游戏进度接口（需要认证）
router.get('/progress', authMiddleware, getAllProgress);
router.get('/progress/:gameId', authMiddleware, getGameProgress);
router.post('/progress/:gameId', authMiddleware, updateGameProgress);

// 每日任务进度（需要认证）
router.get('/daily-task', authMiddleware, getDailyTask);

// 成就列表（需要认证）
router.get('/achievements', authMiddleware, getAchievements);

// 排行榜接口（公开）
router.get('/leaderboard/:gameId', getLeaderboard);

export default router;
