import { Router } from 'express';
import { wxLogin, testLogin, familyLogin, getProfiles, getUserInfo, updateUserInfo, updateMyPin, getMyCareer, getBattleCareer, reportPlaytime } from '../controllers/userController';
import { authMiddleware } from '../middleware/auth';
import { recordPlay } from '../controllers/gameController';
import { loginLimiter } from '../middleware/rateLimiter';
import { validateBody } from '../middleware/validate';
import { wxLoginSchema, testLoginSchema, familyLoginSchema, updateUserInfoSchema, updatePinSchema, reportPlaytimeSchema } from '../validators/schemas';

const router = Router();

// 登录接口（使用更严格的速率限制 + 输入验证）
router.post('/login/wx', loginLimiter, validateBody(wxLoginSchema), wxLogin);
router.post('/login/test', loginLimiter, validateBody(testLoginSchema), testLogin);
// 家庭角色登录（uid 直接登录，设了口令的角色需带 pin / 昵称+角色创建）
router.post('/login/family', loginLimiter, validateBody(familyLoginSchema), familyLogin);
// 家庭成员列表（选角色页用，无需认证）
router.get('/profiles', getProfiles);

// 用户信息接口（需要认证 + 输入验证）
router.get('/info', authMiddleware, getUserInfo);
router.put('/info', authMiddleware, validateBody(updateUserInfoSchema), updateUserInfo);
// 我的生涯（需要认证）
router.get('/career', authMiddleware, getMyCareer);
// 好友对战生涯（积分+战绩流水，需要认证）
router.get('/battle/career', authMiddleware, getBattleCareer);
// 角色口令（需要认证 + 输入验证）
router.put('/pin', authMiddleware, validateBody(updatePinSchema), updateMyPin);
// 游玩时长心跳上报（需要认证 + 输入验证）
router.post('/playtime', authMiddleware, validateBody(reportPlaytimeSchema), reportPlaytime);
// 记一局游玩（失败结算；挂在 /user 下避免与 /game/progress/:gameId 的 POST 冲突语义）
router.post('/play/:gameId', authMiddleware, recordPlay);

export default router;
