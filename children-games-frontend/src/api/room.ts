// 对战房间 HTTP 接口
import axios from 'axios';
import { api } from '../utils/request';

// 可用游戏列表（大厅建房卡片）
export const getGameList = async (): Promise<Array<{ type: string; title: string; emoji: string; desc: string; minPlayers: number; maxPlayers: number }>> => {
  return api.get('/room/games');
};

// 创建房间（五子棋）
export const createRoom = async (gameType: 'gomoku' = 'gomoku'): Promise<{ roomId: string; gameType: string }> => {
  return api.post<{ roomId: string; gameType: string }>('/room', { gameType });
};

// 上传房间语音（raw body），返回 voiceId；广播由服务端完成
export const uploadRoomVoice = async (roomId: string, blob: Blob, duration: number): Promise<{ voiceId: string }> => {
  const res = await axios.post(`/api/room/${roomId}/voice?duration=${duration}`, blob, {
    headers: {
      'Content-Type': blob.type || 'audio/webm',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
    timeout: 10000,
  });
  return (res.data as any).data as { voiceId: string };
};

// 拉取房间语音（blob 响应不走统一拦截器，单独用 axios）
export const fetchRoomVoice = async (roomId: string, voiceId: string): Promise<Blob> => {
  const res = await axios.get(`/api/room/${roomId}/voice/${voiceId}`, {
    responseType: 'blob',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });
  return res.data as Blob;
};
