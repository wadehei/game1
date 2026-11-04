import axios from 'axios';
import type { AxiosResponse } from 'axios';
import { API_ORIGIN } from '../utils/request';

const BASE_URL = `${API_ORIGIN}/api/admin`;
const TOKEN_KEY = 'admin_token';

// ─── 响应类型定义 ──────────────────────────────────────────

/** 后端标准响应结构 */
interface ApiResponse<T> {
  code: number;
  data: T;
  message?: string;
}

/** 响应拦截器解包后的数据类型 */
type UnwrapResponse<T> = T;

const client = axios.create({ baseURL: BASE_URL, timeout: 15000 });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * 解包 API 响应数据
 * @throws 当响应格式不正确时抛出错误
 */
function unwrapResponse<T>(response: AxiosResponse<ApiResponse<T>>): UnwrapResponse<T> {
  const { data } = response;
  if (data.code === 200) {
    return data.data;
  }
  throw new Error(data.message || `API error: code ${data.code}`);
}

// 401 时清除本地凭证并回到后台登录页（凭证过期后页面停留在旧数据上，所有操作会静默失败）
client.interceptors.response.use(
  (response) => unwrapResponse(response),
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      if (!window.location.hash.startsWith('#/admin/login')) {
        window.location.hash = '#/admin/login';
      }
    }
    throw error;
  }
);

// ─── 类型安全的请求方法 ────────────────────────────────────

/** 类型安全的 GET 请求 */
async function apiGet<T>(url: string): Promise<T> {
  const result = await client.get<ApiResponse<T>>(url);
  return result as unknown as T;
}

/** 类型安全的 POST 请求 */
async function apiPost<T>(url: string, data?: unknown): Promise<T> {
  const result = await client.post<ApiResponse<T>>(url, data);
  return result as unknown as T;
}

/** 类型安全的 PUT 请求 */
async function apiPut<T>(url: string, data?: unknown): Promise<T> {
  const result = await client.put<ApiResponse<T>>(url, data);
  return result as unknown as T;
}

/** 类型安全的 DELETE 请求 */
async function apiDelete<T = void>(url: string): Promise<T> {
  const result = await client.delete<ApiResponse<T>>(url);
  return result as unknown as T;
}

export const isAdminLoggedIn = (): boolean => !!localStorage.getItem(TOKEN_KEY);

export const adminLogout = (): void => {
  localStorage.removeItem(TOKEN_KEY);
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
  const data = await apiPost<AdminLoginResult>('/login', { password });
  if (data.token) {
    localStorage.setItem(TOKEN_KEY, data.token);
  }
  return data;
};

/** 登录第二步：2FA 临时令牌 + 验证码 → 完整管理员 JWT（后端 /2fa/verify） */
export const verify2faLogin = async (tempToken: string, code: string): Promise<void> => {
  const data = await apiPost<{ token: string }>('/2fa/verify', { token: tempToken, code });
  localStorage.setItem(TOKEN_KEY, data.token);
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

export const getOverview = (): Promise<Overview> => apiGet<Overview>('/overview');

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

export const getUsers = (): Promise<AdminUser[]> => apiGet<AdminUser[]>('/users');

export const adjustUserChips = (
  id: number,
  data: { delta?: number; set?: number }
): Promise<{ battleChips: number }> => apiPut<{ battleChips: number }>(`/users/${id}/chips`, data);

export const updateUser = (
  id: number,
  data: { nickname?: string; avatar?: string }
): Promise<void> => apiPut(`/users/${id}`, data);

export const clearUserPin = (id: number): Promise<void> => apiPost(`/users/${id}/clear-pin`);

export const resetUserProgress = (id: number): Promise<void> => apiPost(`/users/${id}/reset`);

export const deleteUser = (id: number): Promise<void> => apiDelete(`/users/${id}`);

// ─── 设置 ────────────────────────────────

export interface AdminSettings {
  restIntervalMinutes: number;
}

export const getSettings = (): Promise<AdminSettings> => apiGet<AdminSettings>('/settings');

export const updateSettings = (data: AdminSettings): Promise<AdminSettings> =>
  apiPut<AdminSettings>('/settings', data);

// ─── 关卡难度覆盖 ────────────────────────────────

export interface LevelOverrideRow {
  level: number;
  config: Record<string, number | boolean>;
  updatedAt: string;
}

export const getLevelOverrides = (gameId: string): Promise<LevelOverrideRow[]> =>
  apiGet<LevelOverrideRow[]>(`/levels/${gameId}`);

export const saveLevelOverride = (
  gameId: string,
  level: number,
  config: Record<string, number | boolean>
): Promise<void> => apiPut(`/levels/${gameId}/${level}`, { config });

export const deleteLevelOverride = (gameId: string, level: number): Promise<void> =>
  apiDelete(`/levels/${gameId}/${level}`);

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
  apiGet<AdminErrorLog[]>(`/logs?limit=${limit}`);

export const clearErrorLogs = (): Promise<void> => apiDelete('/logs');

// ─── 备份（下载 .sql） ────────────────────────────────

export const downloadBackup = async (): Promise<void> => {
  // blob 响应不走统一拦截器（response.data.data 解包会破坏二进制）
  const res = await axios.get(`${BASE_URL}/backup`, {
    responseType: 'blob',
    headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
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
export const listAutoBackups = (): Promise<AutoBackup[]> => apiGet<AutoBackup[]>('/backups');

// ─── 意见反馈 ────────────────────────────────

import { type FeedbackItem, type FeedbackStatus } from './feedback';

// 反馈列表（管理员额外返回内部备注）
export const adminGetFeedbacks = (): Promise<FeedbackItem[]> => apiGet<FeedbackItem[]>('/feedback');

// 更新反馈状态 / 备注
export const adminUpdateFeedback = (
  id: number,
  data: { status?: FeedbackStatus; adminNote?: string }
): Promise<FeedbackItem> => apiPut<FeedbackItem>(`/feedback/${id}`, data);

// 官方回复（所有用户可见）
export const adminAddReply = (id: number, content: string): Promise<void> =>
  apiPost(`/feedback/${id}/reply`, { content });

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
  return apiGet<{ list: AdminQuizQuestion[]; total: number }>('/quiz');
};

export const adminQuizCreate = (data: QuizQuestionPayload): Promise<AdminQuizQuestion> =>
  apiPost<AdminQuizQuestion>('/quiz', data);

export const adminQuizUpdate = (
  id: number,
  data: QuizQuestionPayload
): Promise<AdminQuizQuestion> => apiPut<AdminQuizQuestion>(`/quiz/${id}`, data);

export const adminQuizDelete = (id: number): Promise<void> => apiDelete(`/quiz/${id}`);

export const adminQuizImport = (
  questions: QuizQuestionPayload[]
): Promise<{ created: number; skipped: number }> =>
  apiPost<{ created: number; skipped: number }>('/quiz/import', { questions });
