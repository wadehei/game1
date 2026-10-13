import { Router } from 'express';
import { wxLogin, testLogin, getUserInfo, updateUserInfo } from '../controllers/userController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 登录接口
router.post('/login/wx', wxLogin);
router.post('/login/test', testLogin);

// 用户信息接口（需要认证）
router.get('/info', authMiddleware, getUserInfo);
router.put('/info', authMiddleware, updateUserInfo);

export default router;
