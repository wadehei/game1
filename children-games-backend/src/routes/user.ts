import { Router } from 'express';
import { wxLogin, testLogin, familyLogin, getProfiles, getUserInfo, updateUserInfo, updateMyPin, reportPlaytime } from '../controllers/userController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 登录接口
router.post('/login/wx', wxLogin);
router.post('/login/test', testLogin);
// 家庭角色登录（uid 直接登录，设了口令的角色需带 pin / 昵称+角色创建）
router.post('/login/family', familyLogin);
// 家庭成员列表（选角色页用，无需认证）
router.get('/profiles', getProfiles);

// 用户信息接口（需要认证）
router.get('/info', authMiddleware, getUserInfo);
router.put('/info', authMiddleware, updateUserInfo);
// 角色口令（需要认证）
router.put('/pin', authMiddleware, updateMyPin);
// 游玩时长心跳上报（需要认证）
router.post('/playtime', authMiddleware, reportPlaytime);

export default router;
