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

/**
 * @swagger
 * /api/room/games:
 *   get:
 *     summary: 获取可用游戏列表（大厅建房卡片用）
 *     tags: [Room]
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type: { type: string }
 *                       name: { type: string }
 */
router.get('/games', (_req: Request, res: Response) => {
  success(res, gameList());
});

/**
 * @swagger
 * /api/room:
 *   post:
 *     summary: 创建对战房间
 *     tags: [Room]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               gameType: { type: string, description: 游戏类型，默认 gomoku }
 *               config: { type: object, description: 建房配置 }
 *     responses:
 *       200:
 *         description: 创建成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     roomId: { type: string }
 *                     gameType: { type: string }
 *       401:
 *         description: 未认证
 */
router.post(
  '/',
  authMiddleware,
  asyncHandler(async (req: Request & { userId?: number }, res: Response) => {
    const { gameType, config } = req.body as { gameType?: GameType; config?: unknown };
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
  })
);

/**
 * @swagger
 * /api/room/{roomId}/voice:
 *   post:
 *     summary: 上传房间语音
 *     description: raw body 二进制，最长 60 秒 / 600KB，语音仅存房间内存
 *     tags: [Room]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: duration
 *         schema:
 *           type: integer
 *         description: 语音时长（秒），最大 60
 *     requestBody:
 *       required: true
 *       content:
 *         audio/webm:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: 上传成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     voiceId: { type: string }
 *       403:
 *         description: 不在房间内
 *       404:
 *         description: 房间不存在
 */
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
      if (m.ws && m.ws.readyState === 1)
        m.ws.send(
          JSON.stringify({
            t: 'voice',
            voiceId,
            userId: me.userId,
            nickname: me.nickname,
            duration,
            ts: voice.ts,
          })
        );
    }
    success(res, { voiceId });
  })
);

/**
 * @swagger
 * /api/room/{roomId}/voice/{voiceId}:
 *   get:
 *     summary: 拉取房间语音
 *     tags: [Room]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: voiceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 语音数据（音频二进制流）
 *       403:
 *         description: 不在房间内
 *       404:
 *         description: 房间或语音不存在
 */
router.get(
  '/:roomId/voice/:voiceId',
  authMiddleware,
  asyncHandler(async (req: Request & { userId?: number }, res: Response) => {
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
  })
);

export default router;
