// 对战房间 HTTP 接口
import { api } from '../utils/request';

// 可用游戏列表（大厅建房卡片）
export const getGameList = async (): Promise<
  Array<{
    type: string;
    title: string;
    emoji: string;
    desc: string;
    minPlayers: number;
    maxPlayers: number;
  }>
> => {
  return api.get('/room/games');
};

// 创建房间（config = 建房配置，服务端按游戏白名单校验+默认值）
export const createRoom = async (
  gameType: string = 'gomoku',
  config?: Record<string, unknown>
): Promise<{ roomId: string; gameType: string }> => {
  return api.post<{ roomId: string; gameType: string }>('/room', { gameType, config });
};

// 好友对战生涯（积分 + 战绩流水）
export const getBattleCareer = async (): Promise<BattleCareer> => {
  return api.get<BattleCareer>('/user/battle/career');
};

export interface BattleCareer {
  chips: number;
  games: Array<{ gameType: string; total: number; wins: number }>;
  recent: Array<{
    gameType: string;
    result: string;
    chipsDelta: number;
    chipsAfter: number;
    createdAt: string;
  }>;
}

// 房间语音相关接口（统一从 voice.ts 导出）
export { uploadRoomVoice, fetchRoomVoice } from './voice';
export type { RoomVoiceUploadResult } from './voice';
