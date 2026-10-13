import { Router } from 'express';
import {
  adminLogin,
  getOverview,
  getUsers,
  updateUser,
  resetUserProgress,
  deleteUser,
  getSettings,
  updateSettings,
  downloadBackup,
} from '../controllers/adminController';
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
router.delete('/users/:id', deleteUser);
router.get('/settings', getSettings);
router.put('/settings', updateSettings);
router.get('/backup', downloadBackup);

export default router;
