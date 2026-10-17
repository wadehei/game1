import axios from 'axios';

const BASE_URL = '/api/admin';
const TOKEN_KEY = 'admin_token';

const client = axios.create({ baseURL: BASE_URL, timeout: 15000 });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 时清除本地凭证并回到后台登录页（凭证过期后页面停留在旧数据上，所有操作会静默失败）
client.interceptors.response.use(
  (response) => response.data.data,
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

export const isAdminLoggedIn = (): boolean => !!localStorage.getItem(TOKEN_KEY);

export const adminLogout = (): void => {
  localStorage.removeItem(TOKEN_KEY);
};

export const adminLogin = async (password: string): Promise<void> => {
  // 响应拦截器已解包出业务数据，这里对齐类型
  const data = await client.post('/login', { password }) as unknown as { token: string };
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

export const getOverview = (): Promise<Overview> => client.get('/overview');

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

export const getUsers = (): Promise<AdminUser[]> => client.get('/users');

export const adjustUserChips = (id: number, data: { delta?: number; set?: number }): Promise<{ battleChips: number }> =>
  client.put(`/users/${id}/chips`, data);

export const updateUser = (id: number, data: { nickname?: string; avatar?: string }): Promise<void> =>
  client.put(`/users/${id}`, data);

export const clearUserPin = (id: number): Promise<void> => client.post(`/users/${id}/clear-pin`);

export const resetUserProgress = (id: number): Promise<void> => client.post(`/users/${id}/reset`);

export const deleteUser = (id: number): Promise<void> => client.delete(`/users/${id}`);

// ─── 设置 ────────────────────────────────

export interface AdminSettings {
  restIntervalMinutes: number;
}

export const getSettings = (): Promise<AdminSettings> => client.get('/settings');

export const updateSettings = (data: AdminSettings): Promise<AdminSettings> => client.put('/settings', data);

// ─── 关卡难度覆盖 ────────────────────────────────

export interface LevelOverrideRow {
  level: number;
  config: Record<string, number | boolean>;
  updatedAt: string;
}

export const getLevelOverrides = (gameId: string): Promise<LevelOverrideRow[]> =>
  client.get(`/levels/${gameId}`);

export const saveLevelOverride = (
  gameId: string,
  level: number,
  config: Record<string, number | boolean>
): Promise<void> => client.put(`/levels/${gameId}/${level}`, { config });

export const deleteLevelOverride = (gameId: string, level: number): Promise<void> =>
  client.delete(`/levels/${gameId}/${level}`);

// ─── 家长原声配音 ────────────────────────────────

export interface VoiceLineStatus {
  key: string;
  size: number;
  updatedAt: number;
}

export const listVoiceLines = (): Promise<VoiceLineStatus[]> =>
  fetch('/api/voice').then((r) => r.json()).then((d) => d.data || []);

// 配音接口在 /api/voice（不在 /api/admin 下），用独立请求携带管理员凭证
export const uploadVoice = (key: string, blob: Blob): Promise<void> =>
  axios.post(`/api/voice/${key}`, blob, {
    headers: {
      'Content-Type': blob.type || 'audio/webm',
      Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}`,
    },
  }) as unknown as Promise<void>;

export const deleteVoice = (key: string): Promise<void> =>
  axios.delete(`/api/voice/${key}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
  }) as unknown as Promise<void>;

// ─── 错误日志 ────────────────────────────────

export interface AdminErrorLog {
  time: string;
  source: string;
  message: string;
  detail?: string;
}

export const getErrorLogs = (limit = 200): Promise<AdminErrorLog[]> =>
  client.get(`/logs?limit=${limit}`);

export const clearErrorLogs = (): Promise<void> => client.delete('/logs');

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
export const listAutoBackups = (): Promise<AutoBackup[]> => client.get('/backups');

// ─── 意见反馈 ────────────────────────────────

import { type FeedbackItem, type FeedbackStatus } from './feedback';

// 反馈列表（管理员额外返回内部备注）
export const adminGetFeedbacks = async (): Promise<FeedbackItem[]> => {
  return client.get('/feedback') as unknown as Promise<FeedbackItem[]>;
};

// 更新反馈状态 / 备注
export const adminUpdateFeedback = async (
  id: number,
  data: { status?: FeedbackStatus; adminNote?: string }
): Promise<FeedbackItem> => {
  return client.put(`/feedback/${id}`, data) as unknown as Promise<FeedbackItem>;
};

// 官方回复（所有用户可见）
export const adminAddReply = async (id: number, content: string): Promise<void> => {
  await client.post(`/feedback/${id}/reply`, { content });
};

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

export const adminQuizList = async (page = 1, category = ''): Promise<{ list: AdminQuizQuestion[]; total: number }> => {
  const params: Record<string, unknown> = { page };
  if (category) params.category = category;
  return client.get('/quiz', { params }) as unknown as Promise<{ list: AdminQuizQuestion[]; total: number }>;
};

export const adminQuizCreate = async (data: QuizQuestionPayload): Promise<AdminQuizQuestion> =>
  client.post('/quiz', data) as unknown as Promise<AdminQuizQuestion>;

export const adminQuizUpdate = async (id: number, data: QuizQuestionPayload): Promise<AdminQuizQuestion> =>
  client.put(`/quiz/${id}`, data) as unknown as Promise<AdminQuizQuestion>;

export const adminQuizDelete = async (id: number): Promise<void> =>
  client.delete(`/quiz/${id}`) as unknown as Promise<void>;

export const adminQuizImport = async (questions: QuizQuestionPayload[]): Promise<{ created: number; skipped: number }> =>
  client.post('/quiz/import', { questions }) as unknown as Promise<{ created: number; skipped: number }>;
