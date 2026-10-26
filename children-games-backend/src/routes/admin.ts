import { Router } from 'express';
import {
  adminLogin,
  getOverview,
  getUsers,
  updateUser,
  adjustUserChips,
  resetUserProgress,
  deleteUser,
  clearUserPin,
  getSettings,
  updateSettings,
  getLevelOverrides,
  saveLevelOverride,
  deleteLevelOverride,
  getErrorLogs,
  clearErrorLogs,
  downloadBackup,
  listAutoBackups,
  quizList,
  quizCreate,
  quizUpdate,
  quizDelete,
  quizImport,
} from '../controllers/adminController';
import { listFeedbacks, updateFeedback, addFeedbackReply } from '../controllers/feedbackController';
import { adminMiddleware } from '../middleware/adminAuth';
import { adminLoginLimiter } from '../middleware/rateLimiter';
import { validateBody } from '../middleware/validate';
import {
  adminLoginSchema,
  adjustChipsSchema,
  updateSettingsSchema,
  addReplySchema,
  quizSchema,
} from '../validators/schemas';

const router = Router();

// 登录（公开，使用更严格的速率限制 + 输入验证）
router.post('/login', adminLoginLimiter, validateBody(adminLoginSchema), adminLogin);

// 以下均需管理员凭证
router.use(adminMiddleware);
router.get('/overview', getOverview);
router.get('/users', getUsers);
router.put('/users/:id', updateUser);
router.put('/users/:id/chips', validateBody(adjustChipsSchema), adjustUserChips);
router.post('/users/:id/reset', resetUserProgress);
router.post('/users/:id/clear-pin', clearUserPin);
router.delete('/users/:id', deleteUser);
router.get('/settings', getSettings);
router.put('/settings', validateBody(updateSettingsSchema), updateSettings);
router.get('/levels/:gameId', getLevelOverrides);
router.put('/levels/:gameId/:level', saveLevelOverride);
router.delete('/levels/:gameId/:level', deleteLevelOverride);
router.get('/logs', getErrorLogs);
router.delete('/logs', clearErrorLogs);
router.get('/backup', downloadBackup);
router.get('/backups', listAutoBackups);

// 题库管理（答题对战）
router.get('/quiz', quizList);
router.post('/quiz', validateBody(quizSchema), quizCreate);
router.put('/quiz/:id', validateBody(quizSchema), quizUpdate);
router.delete('/quiz/:id', quizDelete);
router.post('/quiz/import', quizImport);

// 意见反馈（与 /api/feedback 共用列表控制器，管理员额外返回内部备注）
router.get('/feedback', listFeedbacks);
router.put('/feedback/:id', updateFeedback);
// 官方回复（所有用户可见）
router.post('/feedback/:id/reply', validateBody(addReplySchema), addFeedbackReply);

export default router;
