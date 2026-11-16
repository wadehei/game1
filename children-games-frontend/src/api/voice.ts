/**
 * 统一 Voice API 入口
 * 整合管理员配音 API 和房间实时语音 API
 */

import { API_ORIGIN, createApiClient } from '../utils/request';
import type { VoiceLine, RoomVoiceUploadResult } from '../types/voice';

export type { VoiceLine, RoomVoiceUploadResult } from '../types/voice';

// ─── API 客户端 ────────────────────────────────────────────

/** 管理员客户端（配音接口需要管理员权限） */
const adminClient = createApiClient({
  baseURL: `${API_ORIGIN}/api/voice`,
  tokenKey: 'admin_token',
});

/** 用户客户端（房间语音接口需要用户权限） */
const userClient = createApiClient({
  baseURL: `${API_ORIGIN}/api`,
  tokenKey: 'token',
});

// ─── 管理员配音 API（家长原声） ────────────────────────────────

/** 获取已配音列表 */
export const listVoiceLines = async (): Promise<VoiceLine[]> => {
  return adminClient.get<VoiceLine[]>('');
};

/**
 * 上传录音
 * @param key 语音 key（如 "game_start"）
 * @param blob 录音 Blob 数据
 */
export const uploadVoice = async (key: string, blob: Blob): Promise<void> => {
  const { storage } = await import('@/utils/storage');
  const token = storage.getItem('admin_token');
  await adminClient.raw.post(`/${key}`, blob, {
    headers: {
      'Content-Type': blob.type || 'audio/webm',
      Authorization: token ? `Bearer ${token}` : '',
    },
  });
};

/**
 * 删除录音
 * @param key 语音 key
 */
export const deleteVoice = async (key: string): Promise<void> => {
  await adminClient.delete(`/${key}`);
};

// ─── 房间实时语音 API ────────────────────────────────────────

/**
 * 上传房间语音（raw body），返回 voiceId；广播由服务端完成
 * @param roomId 房间 ID
 * @param blob 录音 Blob
 * @param duration 语音时长（秒）
 */
export const uploadRoomVoice = async (
  roomId: string,
  blob: Blob,
  duration: number
): Promise<RoomVoiceUploadResult> => {
  const { storage } = await import('@/utils/storage');
  const token = storage.getItem('token');
  const res = await userClient.raw.post(`/room/${roomId}/voice?duration=${duration}`, blob, {
    headers: {
      'Content-Type': blob.type || 'audio/webm',
      Authorization: token ? `Bearer ${token}` : '',
    },
    timeout: 10000,
  });
  const envelope = res.data as { data: RoomVoiceUploadResult };
  return envelope.data;
};

/**
 * 拉取房间语音（blob 响应不走统一拦截器，单独用 axios）
 * @param roomId 房间 ID
 * @param voiceId 语音 ID
 */
export const fetchRoomVoice = async (roomId: string, voiceId: string): Promise<Blob> => {
  const { storage } = await import('@/utils/storage');
  const token = storage.getItem('token');
  const res = await userClient.raw.get(`/room/${roomId}/voice/${voiceId}`, {
    responseType: 'blob',
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
    },
  });
  return res.data as Blob;
};
