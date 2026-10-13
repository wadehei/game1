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

// 401 时清除本地凭证，由调用方回到登录页
client.interceptors.response.use(
  (response) => response.data.data,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
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
  isFamily: boolean;
  gamesPlayed: number;
  todaySeconds: number;
  lastActiveAt: string | null;
  createdAt: string;
}

export const getUsers = (): Promise<AdminUser[]> => client.get('/users');

export const updateUser = (id: number, data: { nickname?: string; avatar?: string }): Promise<void> =>
  client.put(`/users/${id}`, data);

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
