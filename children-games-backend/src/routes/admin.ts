import { Router } from 'express';
import {
  adminLogin,
  getOverview,
  getUsers,
  updateUser,
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
} from '../controllers/adminController';
import { listFeedbacks, updateFeedback, addFeedbackReply } from '../controllers/feedbackController';
import { adminMiddleware } from '../middleware/adminAuth';

const router = Router();

// 登录（公开）
router.post('/login', adminLogin);

// 以下均需管理员凭证
router.use(adminMiddleware);
router.get('/overview', getOverview);
router.get('/users', getUsers);
router.put('/users/:id', updateUser);
router.post('/users/:id/reset', resetUserProgress);
router.post('/users/:id/clear-pin', clearUserPin);
router.delete('/users/:id', deleteUser);
router.get('/settings', getSettings);
router.put('/settings', updateSettings);
router.get('/levels/:gameId', getLevelOverrides);
router.put('/levels/:gameId/:level', saveLevelOverride);
router.delete('/levels/:gameId/:level', deleteLevelOverride);
router.get('/logs', getErrorLogs);
router.delete('/logs', clearErrorLogs);
router.get('/backup', downloadBackup);

// 意见反馈（与 /api/feedback 共用列表控制器，管理员额外返回内部备注）
router.get('/feedback', listFeedbacks);
router.put('/feedback/:id', updateFeedback);
// 官方回复（所有用户可见）
router.post('/feedback/:id/reply', addFeedbackReply);

export default router;
