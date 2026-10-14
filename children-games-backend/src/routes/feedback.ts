import { Router } from 'express';
import { submitFeedback, listFeedbacks, addFeedbackReply } from '../controllers/feedbackController';
import { authMiddleware, userOrAdminAuth } from '../middleware/auth';

const router = Router();

// 提交反馈（需要角色登录）
router.post('/', authMiddleware, submitFeedback);
// 反馈列表（所有登录用户可见；控制台凭证也可查看，额外返回内部备注）
router.get('/', userOrAdminAuth, listFeedbacks);
// 回复反馈（登录用户可回复任何人的反馈；控制台凭证=官方回复）
router.post('/:id/replies', userOrAdminAuth, addFeedbackReply);

export default router;
