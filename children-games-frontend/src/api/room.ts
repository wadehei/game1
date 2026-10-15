// 对战房间 HTTP 接口
import axios from 'axios';
import { api } from '../utils/request';

// 可用游戏列表（大厅建房卡片）
export const getGameList = async (): Promise<Array<{ type: string; title: string; emoji: string; desc: string; minPlayers: number; maxPlayers: number }>> => {
  return api.get('/room/games');
};

// 创建房间（config = 建房配置，服务端按游戏白名单校验+默认值）
export const createRoom = async (gameType: string = 'gomoku', config?: Record<string, unknown>): Promise<{ roomId: string; gameType: string }> => {
  return api.post<{ roomId: string; gameType: string }>('/room', { gameType, config });
};

// 好友对战生涯（积分 + 战绩流水）
export const getBattleCareer = async (): Promise<BattleCareer> => {
  return api.get<BattleCareer>('/user/battle/career');
};

export interface BattleCareer {
  chips: number;
  games: Array<{ gameType: string; total: number; wins: number }>;
  recent: Array<{ gameType: string; result: string; chipsDelta: number; chipsAfter: number; createdAt: string }>;
}

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
