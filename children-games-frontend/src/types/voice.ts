// 语音相关类型定义

/** 管理员配音：单条录音元信息 */
export interface VoiceLine {
  key: string;
  size: number;
  updatedAt: number;
}

/** 房间实时语音：上传结果 */
export interface RoomVoiceUploadResult {
  voiceId: string;
}
