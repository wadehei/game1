/**
 * 统一 Voice API 入口
 * 整合管理员配音 API 和房间实时语音 API
 */

import axios from 'axios';
import { API_ORIGIN } from '../utils/request';
import type { VoiceLine, RoomVoiceUploadResult } from '../types/voice';
import { storage } from '@/utils/storage';

export type { VoiceLine, RoomVoiceUploadResult } from '../types/voice';

// ─── 共享工具函数 ────────────────────────────────────────────

/** 获取管理员 token（配音接口需要管理员权限） */
const getAdminToken = (): string | null => storage.getItem('admin_token');

/** 获取用户 token（房间语音接口需要用户权限） */
const getUserToken = (): string | null => storage.getItem('token');

// ─── 管理员配音 API（家长原声） ────────────────────────────────

/** 获取已配音列表 */
export const listVoiceLines = async (): Promise<VoiceLine[]> => {
  const response = await fetch(`${API_ORIGIN}/api/voice`);
  const data = await response.json();
  return (data?.data || []) as VoiceLine[];
};

/**
 * 上传录音
 * @param key 语音 key（如 "game_start"）
 * @param blob 录音 Blob 数据
 */
export const uploadVoice = async (key: string, blob: Blob): Promise<void> => {
  await axios.post(`${API_ORIGIN}/api/voice/${key}`, blob, {
    headers: {
      'Content-Type': blob.type || 'audio/webm',
      Authorization: `Bearer ${getAdminToken()}`,
    },
  });
};

/**
 * 删除录音
 * @param key 语音 key
 */
export const deleteVoice = async (key: string): Promise<void> => {
  await axios.delete(`${API_ORIGIN}/api/voice/${key}`, {
    headers: { Authorization: `Bearer ${getAdminToken()}` },
  });
};

// ─── 房间实时语音 API ────────────────────────────────────────

/**
 * 上传房间语音（raw body），返回 voiceId；广播由服务端完成
 * @param roomId 房间 ID
 * @param blob 录音 Blob 数据
 * @param duration 语音时长（秒）
 */
export const uploadRoomVoice = async (
  roomId: string,
  blob: Blob,
  duration: number
): Promise<RoomVoiceUploadResult> => {
  const res = await axios.post(
    `${API_ORIGIN}/api/room/${roomId}/voice?duration=${duration}`,
    blob,
    {
      headers: {
        'Content-Type': blob.type || 'audio/webm',
        Authorization: `Bearer ${getUserToken()}`,
      },
      timeout: 10000,
    }
  );
  const envelope = res.data as { data: RoomVoiceUploadResult };
  return envelope.data;
};

/**
 * 拉取房间语音（blob 响应不走统一拦截器，单独用 axios）
 * @param roomId 房间 ID
 * @param voiceId 语音 ID
 */
export const fetchRoomVoice = async (roomId: string, voiceId: string): Promise<Blob> => {
  const res = await axios.get(`${API_ORIGIN}/api/room/${roomId}/voice/${voiceId}`, {
    responseType: 'blob',
    headers: { Authorization: `Bearer ${getUserToken()}` },
  });
  return res.data as Blob;
};
