import { api } from '../utils/request';

export type FeedbackType = 'suggestion' | 'bug' | 'experience' | 'other';
export type FeedbackStatus = 'pending' | 'processing' | 'done';

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  suggestion: '功能建议',
  bug: '问题反馈',
  experience: '体验优化',
  other: '其他',
};

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  pending: '待处理',
  processing: '处理中',
  done: '已完成',
};

export interface FeedbackReplyInfo {
  id: number;
  feedbackId: number;
  userId: number;
  isAdmin: boolean;
  content: string;
  createdAt: string;
  user?: { nickname: string; avatar: string } | null;
}

export interface FeedbackItem {
  id: number;
  userId: number;
  type: FeedbackType;
  content: string;
  page: string;
  status: FeedbackStatus;
  /** 仅控制台凭证返回 */
  adminNote?: string;
  createdAt: string;
  user?: { id: number; nickname: string; avatar: string } | null;
  replies: FeedbackReplyInfo[];
}

// 提交反馈（自动关联当前登录角色）
export const submitFeedback = async (data: { type: FeedbackType; content: string; page?: string }): Promise<{ id: number }> => {
  return api.post<{ id: number }>('/feedback', data);
};

// 反馈列表（所有登录用户可见，含各条回复）；mineOnly=只看自己的反馈
export const getFeedbacks = async (mineOnly = false): Promise<FeedbackItem[]> => {
  return api.get<FeedbackItem[]>('/feedback', mineOnly ? { mine: 1 } : undefined);
};

// 回复反馈（可回复任何人的反馈）
export const addFeedbackReply = async (feedbackId: number, content: string): Promise<void> => {
  await api.post(`/feedback/${feedbackId}/replies`, { content });
};
