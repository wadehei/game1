import { API_ORIGIN, createApiClient } from '../utils/request';
import { storage } from '@/utils/storage';

const TOKEN_KEY = 'admin_token';

// 创建管理员 API 客户端
const client = createApiClient({
  baseURL: `${API_ORIGIN}/api/admin`,
  tokenKey: TOKEN_KEY,
  onUnauthorized: () => {
    if (!window.location.hash.startsWith('#/admin/login')) {
      window.location.hash = '#/admin/login';
    }
  },
});

// ─── 响应类型定义 ──────────────────────────────────────────

/** 后端标准响应结构 */
interface ApiResponse<T> {
  code: number;
  data: T;
  message?: string;
}

export const isAdminLoggedIn = (): boolean => !!storage.getItem(TOKEN_KEY);

export const adminLogout = (): void => {
  storage.removeItem(TOKEN_KEY);
};

export interface AdminLoginResult {
  /** 启用 2FA 时返回，需要再调 verify2faLogin 完成第二步 */
  require2FA?: boolean;
  /** 2FA 临时令牌（5 分钟有效，仅用于第二步验证） */
  tempToken?: string;
  /** 未启用 2FA 时直接返回完整管理员 JWT */
  token?: string;
}

export const adminLogin = async (password: string): Promise<AdminLoginResult> => {
  const data = await client.post<AdminLoginResult>('/login', { password });
  if (data.token) {
    storage.setItem(TOKEN_KEY, data.token);
  }
  return data;
};

/** 登录第二步：2FA 临时令牌 + 验证码 → 完整管理员 JWT（后端 /2fa/verify） */
export const verify2faLogin = async (tempToken: string, code: string): Promise<void> => {
  const data = await client.post<{ token: string }>('/2fa/verify', { token: tempToken, code });
  storage.setItem(TOKEN_KEY, data.token);
};

// ─── 数据看板 ────────────────────────────────

export interface AdminMember {
  id: number;
  nickname: string;
  avatar: string;
  level: number;
  totalStars: number;
  todaySeconds: number;
}

export interface ActivityItem {
  userId: number;
  nickname: string;
  avatar: string;
  gameId: string;
  currentLevel: number;
  highScore: number;
  stars: number;
  updatedAt: string;
}

export interface Overview {
  familyMembers: number;
  guestUsers: number;
  totalStars: number;
  todayActiveUsers: number;
  todayPlaySeconds: number;
  /** 积分入账失败记录数（applyChipDelta 重试仍失败，source=chips 日志条数） */
  chipFailures: number;
  members: AdminMember[];
  activity: ActivityItem[];
}

export const getOverview = (): Promise<Overview> => client.get<Overview>('/overview');

// ─── 角色管理 ────────────────────────────────

export interface AdminUser {
  id: number;
  nickname: string;
  avatar: string;
  level: number;
  totalStars: number;
  battleChips?: number;
  isFamily: boolean;
  hasPin?: boolean;
  gamesPlayed: number;
  todaySeconds: number;
  lastActiveAt: string | null;
  createdAt: string;
}

export const getUsers = (): Promise<AdminUser[]> => client.get<AdminUser[]>('/users');

export const adjustUserChips = (
  id: number,
  data: { delta?: number; set?: number }
): Promise<{ battleChips: number }> =>
  client.put<{ battleChips: number }>(`/users/${id}/chips`, data);

export const updateUser = (
  id: number,
  data: { nickname?: string; avatar?: string }
): Promise<void> => client.put(`/users/${id}`, data);

export const clearUserPin = (id: number): Promise<void> => client.post(`/users/${id}/clear-pin`);

export const resetUserProgress = (id: number): Promise<void> => client.post(`/users/${id}/reset`);

export const deleteUser = (id: number): Promise<void> => client.delete(`/users/${id}`);

// ─── 设置 ────────────────────────────────

export interface AdminSettings {
  restIntervalMinutes: number;
}

export const getSettings = (): Promise<AdminSettings> => client.get<AdminSettings>('/settings');

export const updateSettings = (data: AdminSettings): Promise<AdminSettings> =>
  client.put<AdminSettings>('/settings', data);

// ─── 关卡难度覆盖 ────────────────────────────────

export interface LevelOverrideRow {
  level: number;
  config: Record<string, number | boolean>;
  updatedAt: string;
}

export const getLevelOverrides = (gameId: string): Promise<LevelOverrideRow[]> =>
  client.get<LevelOverrideRow[]>(`/levels/${gameId}`);

export const saveLevelOverride = (
  gameId: string,
  level: number,
  config: Record<string, number | boolean>
): Promise<void> => client.put(`/levels/${gameId}/${level}`, { config });

export const deleteLevelOverride = (gameId: string, level: number): Promise<void> =>
  client.delete(`/levels/${gameId}/${level}`);

// ─── 家长原声配音（统一从 voice.ts 导出） ────────────────────

export { listVoiceLines, uploadVoice, deleteVoice } from './voice';
export type { VoiceLine } from './voice';

/** @deprecated 使用 VoiceLine 代替 */
export type VoiceLineStatus = {
  key: string;
  size: number;
  updatedAt: number;
};

// ─── 错误日志 ────────────────────────────────

export interface AdminErrorLog {
  time: string;
  source: string;
  message: string;
  detail?: string;
}

export const getErrorLogs = (limit = 200): Promise<AdminErrorLog[]> =>
  client.get<AdminErrorLog[]>(`/logs?limit=${limit}`);

export const clearErrorLogs = (): Promise<void> => client.delete('/logs');

// ─── 备份（下载 .sql） ────────────────────────────────

export const downloadBackup = async (): Promise<void> => {
  // blob 响应不走统一拦截器（response.data.data 解包会破坏二进制）
  const res = await client.raw.get(`${API_ORIGIN}/api/admin/backup`, {
    responseType: 'blob',
    headers: { Authorization: `Bearer ${storage.getItem(TOKEN_KEY)}` },
  });
  const url = URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `children_games_backup_${new Date().toISOString().slice(0, 10)}.sql`;
  link.click();
  URL.revokeObjectURL(url);
};

export interface AutoBackup {
  file: string;
  size: number;
  createdAt: string;
}

/** 磁盘自动备份列表（每日 03:05 生成，保留 7 份） */
export const listAutoBackups = (): Promise<AutoBackup[]> => client.get<AutoBackup[]>('/backups');

// ─── 意见反馈 ────────────────────────────────

import { type FeedbackItem, type FeedbackStatus } from './feedback';

// 反馈列表（管理员额外返回内部备注）
export const adminGetFeedbacks = (): Promise<FeedbackItem[]> =>
  client.get<FeedbackItem[]>('/feedback');

// 更新反馈状态 / 备注
export const adminUpdateFeedback = (
  id: number,
  data: { status?: FeedbackStatus; adminNote?: string }
): Promise<FeedbackItem> => client.put<FeedbackItem>(`/feedback/${id}`, data);

// 官方回复（所有用户可见）
export const adminAddReply = (id: number, content: string): Promise<void> =>
  client.post(`/feedback/${id}/reply`, { content });

// ─── 题库管理（答题对战） ────────────────────────────────

export interface AdminQuizQuestion {
  id: number;
  category: string;
  difficulty: number;
  text: string;
  options: string[];
  answer: number;
}

export interface QuizQuestionPayload {
  text: string;
  options: string[];
  answer: number;
  category?: string;
  difficulty?: number;
}

export const adminQuizList = (
  page = 1,
  category = ''
): Promise<{ list: AdminQuizQuestion[]; total: number }> => {
  const params: Record<string, unknown> = { page };
  if (category) params.category = category;
  return client.get<{ list: AdminQuizQuestion[]; total: number }>('/quiz', params);
};

export const adminQuizCreate = (data: QuizQuestionPayload): Promise<AdminQuizQuestion> =>
  client.post<AdminQuizQuestion>('/quiz', data);

export const adminQuizUpdate = (
  id: number,
  data: QuizQuestionPayload
): Promise<AdminQuizQuestion> => client.put<AdminQuizQuestion>(`/quiz/${id}`, data);

export const adminQuizDelete = (id: number): Promise<void> => client.delete(`/quiz/${id}`);

export const adminQuizImport = (
  questions: QuizQuestionPayload[]
): Promise<{ created: number; skipped: number }> =>
  client.post<{ created: number; skipped: number }>('/quiz/import', { questions });

// ─── 行为埋点聚合 ─────────────────────────────────────────────
export interface EventsSummary {
  days: number;
  total: number;
  byType: Record<string, number>;
  byGame: Record<string, number>;
  /** game_start 口径的 2D/3D 使用分布（key=gameId） */
  modeByGame: Record<string, { '2d': number; '3d': number }>;
}

export const getEventsSummary = (days: number): Promise<EventsSummary> =>
  client.get<EventsSummary>(`/events/summary?days=${days}`);
