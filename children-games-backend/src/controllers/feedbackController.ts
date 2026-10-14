import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { Feedback, FeedbackReply, User } from '../models';
import { AuthRequest } from '../middleware/auth';
import { success, fail, asyncHandler } from '../utils/response';

export const FEEDBACK_TYPES = ['suggestion', 'bug', 'experience', 'other'] as const;
export const FEEDBACK_STATUSES = ['pending', 'processing', 'done'] as const;

/** userOrAdminAuth 通过后的请求：用户凭证带 userId，管理员凭证带 admin */
type AnyAuthRequest = AuthRequest & { admin?: boolean };

export const isValidType = (t: unknown): t is string =>
  typeof t === 'string' && (FEEDBACK_TYPES as readonly string[]).includes(t);

// 简单限流：同一角色每天最多 5 条反馈、20 条回复，防误触连发
const DAILY_FEEDBACK_LIMIT = 5;
const DAILY_REPLY_LIMIT = 20;
const todayStart = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// ─── 用户端 / 控制台共用 ────────────────────────────────

// 提交反馈（需要角色登录，自动关联当前角色）
export const submitFeedback = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { type, content, page } = req.body as { type?: string; content?: string; page?: string };

  if (!isValidType(type)) {
    fail(res, '请选择反馈类型');
    return;
  }
  const text = (content || '').trim();
  if (!text) {
    fail(res, '请填写反馈内容');
    return;
  }
  if (text.length > 1000) {
    fail(res, '反馈内容不能超过 1000 字');
    return;
  }

  const todayCount = await Feedback.count({
    where: { userId, createdAt: { [Op.gte]: todayStart() } },
  });
  if (todayCount >= DAILY_FEEDBACK_LIMIT) {
    fail(res, '今天的反馈已经够多啦，明天再来吧');
    return;
  }

  const feedback = await Feedback.create({
    userId,
    type,
    content: text,
    page: (page || '').slice(0, 100),
  });

  success(res, { id: feedback.id }, '提交成功，感谢反馈！');
});

// 反馈列表（所有登录用户可见；控制台凭证也可访问，管理员额外可见内部备注）
// ?mine=1 只看自己的反馈（仅角色登录有效；控制台凭证忽略该参数）
export const listFeedbacks = asyncHandler(async (req: AnyAuthRequest, res: Response) => {
  const isAdmin = !!req.admin;
  const mineOnly = !isAdmin && req.query.mine === '1' && typeof req.userId === 'number';

  const rows = await Feedback.findAll({
    where: mineOnly ? { userId: req.userId } : undefined,
    order: [['createdAt', 'DESC']],
    limit: 50,
    include: [
      { model: User, as: 'user', attributes: ['id', 'nickname', 'avatar'] },
      {
        model: FeedbackReply,
        as: 'replies',
        include: [{ model: User, as: 'user', attributes: ['nickname', 'avatar'] }],
      },
    ],
  });

  const data = rows.map((f) => {
    const json = f.toJSON() as Record<string, any>;
    if (!isAdmin) delete json.adminNote;
    return json;
  });
  success(res, data);
});

// 回复反馈（登录用户可回复任何人的反馈；控制台凭证回复=官方回复）
export const addFeedbackReply = asyncHandler(async (req: AnyAuthRequest, res: Response) => {
  const isAdmin = !!req.admin;
  const feedbackId = Number(req.params.id);
  const content = (req.body?.content || '').toString().trim();

  if (!content) {
    fail(res, '请填写回复内容');
    return;
  }
  if (content.length > 500) {
    fail(res, '回复不能超过 500 字');
    return;
  }

  const feedback = await Feedback.findByPk(feedbackId);
  if (!feedback) {
    fail(res, '反馈不存在', 404);
    return;
  }

  if (!isAdmin) {
    const userId = req.userId!;
    const todayCount = await FeedbackReply.count({
      where: { userId, createdAt: { [Op.gte]: todayStart() } },
    });
    if (todayCount >= DAILY_REPLY_LIMIT) {
      fail(res, '今天回复的次数太多了，明天再来吧');
      return;
    }
    await FeedbackReply.create({ feedbackId, userId, isAdmin: false, content });
  } else {
    await FeedbackReply.create({ feedbackId, userId: null, isAdmin: true, content });
  }

  success(res, { ok: true }, isAdmin ? '官方回复已发送' : '回复成功');
});

// ─── 控制台专用 ────────────────────────────────

// 更新反馈状态/备注（管理员）
export const updateFeedback = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { status, adminNote } = req.body as { status?: string; adminNote?: string };

  const feedback = await Feedback.findByPk(id);
  if (!feedback) {
    fail(res, '反馈不存在', 404);
    return;
  }
  if (status !== undefined) {
    if (!(FEEDBACK_STATUSES as readonly string[]).includes(status)) {
      fail(res, '无效的状态');
      return;
    }
    feedback.status = status;
  }
  if (adminNote !== undefined) {
    feedback.adminNote = String(adminNote).slice(0, 2000);
  }
  await feedback.save();
  success(res, feedback);
});
