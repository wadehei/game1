// 对战房间 HTTP 接口：建房、语音上传/拉取
// 语音只存房间内存（随房间解散清空），不做持久化
import { Router, Request, Response } from 'express';
import express from 'express';
import { authMiddleware } from '../middleware/auth';
import { success, fail, asyncHandler } from '../utils/response';
import { createRoom, getRoom, getVoice, storeVoice, type RoomVoice } from '../ws/roomManager';
import { gameList, getHandler } from '../ws/games/registry';
import type { GameType } from '../ws/games/types';

const router = Router();

const isGameType = (t: unknown): t is GameType => {
  try {
    getHandler(t as GameType);
    return true;
  } catch {
    return false;
  }
};

// 可用游戏列表（大厅建房卡片用）
router.get('/games', (_req: Request, res: Response) => {
  success(res, gameList());
});

// 创建房间（需要登录）。config = 建房配置（handler 白名单校验+默认值，对局期间不可改）
router.post('/', authMiddleware, asyncHandler(async (req: Request & { userId?: number }, res: Response) => {
  const { gameType, config } = req.body as { gameType?: GameType; config?: any };
  const type: GameType = isGameType(gameType) ? gameType : 'gomoku';
  const user = { userId: req.userId!, nickname: '', avatar: '' };
  // 建房响应里不含昵称也无妨，进房时 WS 会重新取；这里补全以便房间页立即显示房主
  const { User } = await import('../models');
  const u = await User.findByPk(req.userId!, { attributes: ['nickname', 'avatar'] });
  user.nickname = u?.nickname || `角色${req.userId}`;
  user.avatar = u?.avatar || '🙂';

  const normalized = getHandler(type).normalizeConfig?.(config) || {};
  const room = createRoom(user, type, normalized);
  success(res, { roomId: room.id, gameType: room.gameType });
}));

// 上传房间语音（需要登录且在房间内）：raw body，最长 60 秒 / 600KB
router.post(
  '/:roomId/voice',
  authMiddleware,
  express.raw({ type: () => true, limit: '600kb' }),
  asyncHandler(async (req: Request & { userId?: number }, res: Response) => {
    const room = getRoom(String(req.params.roomId));
    if (!room) {
      fail(res, '房间不存在或已解散', 404);
      return;
    }
    const me = room.members.get(req.userId!);
    if (!me) {
      fail(res, '你不在这个房间里', 403);
      return;
    }
    const body = req.body as Buffer;
    if (!body || body.length === 0) {
      fail(res, '语音内容为空');
      return;
    }
    const duration = Math.min(Number(req.query.duration) || 0, 60);
    const mime = (req.headers['content-type'] || 'audio/webm').split(';')[0];

    const voiceId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const voice: RoomVoice = {
      data: body,
      mime,
      userId: me.userId,
      nickname: me.nickname,
      duration,
      ts: Date.now(),
    };
    storeVoice(room, voice, voiceId);

    // 广播给房间所有人（含自己，方便多端同步）
    for (const m of room.members.values()) {
      if (m.ws && m.ws.readyState === 1) m.ws.send(JSON.stringify({ t: 'voice', voiceId, userId: me.userId, nickname: me.nickname, duration, ts: voice.ts }));
    }
    success(res, { voiceId });
  })
);

// 拉取房间语音（需要登录且在房间内）
router.get('/:roomId/voice/:voiceId', authMiddleware, asyncHandler(async (req: Request & { userId?: number }, res: Response) => {
  const room = getRoom(String(req.params.roomId));
  if (!room) {
    fail(res, '房间不存在或已解散', 404);
    return;
  }
  if (!room.members.has(req.userId!)) {
    fail(res, '你不在这个房间里', 403);
    return;
  }
  const voice = getVoice(room, String(req.params.voiceId));
  if (!voice) {
    fail(res, '语音不存在或已过期', 404);
    return;
  }
  res.set('Content-Type', voice.mime);
  res.set('Cache-Control', 'no-store');
  res.send(voice.data);
}));

export default router;
