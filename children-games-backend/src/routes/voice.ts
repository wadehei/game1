import { Router } from 'express';
import fsPromises from 'fs/promises';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { adminMiddleware } from '../middleware/adminAuth';
import { success, fail, asyncHandler } from '../utils/response';
import { UPLOAD_MAX_SIZE } from '../config/constants';

/**
 * 家长原声配音：录好的语音按台词 key 存文件（uploads/voice/{key}.{ext}）
 * 孩子端优先播放录音，未录的台词回退 TTS
 */

const VOICE_KEYS = new Set([
  'memory_intro',
  'fruit_intro',
  'puzzle_intro',
  'balloon_intro',
  'tank_intro',
  'mole_intro',
  'simon_intro',
  'brick_intro',
  'match_intro',
  'match3_intro',
  'sudoku_intro',
  'math_correct',
  'math_wrong',
  'result_win',
  'result_lose',
  'rest_start',
]);

const VOICE_DIR = path.resolve(process.cwd(), 'uploads', 'voice');

const ensureDir = async (): Promise<void> => {
  await fsPromises.mkdir(VOICE_DIR, { recursive: true });
};

const ALLOWED_EXT = new Set(['.webm', '.mp4', '.ogg', '.m4a', '.wav']);
const MIME_BY_EXT: Record<string, string> = {
  '.webm': 'audio/webm',
  '.mp4': 'audio/mp4',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

// 允许的 Content-Type 白名单（防止上传非音频文件）
const ALLOWED_CONTENT_TYPES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'video/webm', // Chrome MediaRecorder 有时用 video/webm
  'video/mp4', // Safari MediaRecorder 有时用 video/mp4
]);

const validKey = (key: string): boolean => /^[a-z_]{2,40}$/.test(key) && VOICE_KEYS.has(key);

const fileOf = async (key: string): Promise<string | null> => {
  if (!validKey(key)) return null;
  for (const ext of ALLOWED_EXT) {
    const p = path.join(VOICE_DIR, key + ext);
    try {
      await fsPromises.access(p, fs.constants.F_OK);
      return p;
    } catch {
      // 不存在，继续尝试下一个扩展名
    }
  }
  return null;
};

const router = Router();

/**
 * @swagger
 * /api/voice:
 *   get:
 *     summary: 获取已配音列表
 *     description: 孩子端启动时探测，公开接口
 *     tags: [Voice]
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
 *                       key: { type: string }
 *                       size: { type: integer }
 *                       updatedAt: { type: integer }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    await ensureDir();
    const items: { key: string; size: number; updatedAt: number }[] = [];
    for (const key of VOICE_KEYS) {
      for (const ext of ALLOWED_EXT) {
        const p = path.join(VOICE_DIR, key + ext);
        try {
          const stat = await fsPromises.stat(p);
          items.push({ key, size: stat.size, updatedAt: Math.round(stat.mtimeMs) });
          break; // 找到即停
        } catch {
          // 不存在，继续
        }
      }
    }
    success(res, items);
  })
);

/**
 * @swagger
 * /api/voice/{key}:
 *   get:
 *     summary: 播放某条录音
 *     description: 公开接口，长缓存（1 天）
 *     tags: [Voice]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: 台词 key
 *     responses:
 *       200:
 *         description: 音频二进制流
 *         content:
 *           audio/webm:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: 该台词未配音
 */
router.get('/:key', async (req, res) => {
  const p = await fileOf(String(req.params.key || ''));
  if (!p) {
    res.status(404).json({ code: 404, message: '该台词未配音' });
    return;
  }
  res.setHeader('Content-Type', MIME_BY_EXT[path.extname(p)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(p);
});

/**
 * @swagger
 * /api/voice/{key}:
 *   post:
 *     summary: 上传录音
 *     description: 管理员上传家长原声配音，raw body 二进制
 *     tags: [Voice]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: 台词 key
 *     requestBody:
 *       required: true
 *       content:
 *         audio/webm:
 *           schema:
 *             type: string
 *             format: binary
 *         audio/mp4:
 *           schema:
 *             type: string
 *             format: binary
 *         audio/ogg:
 *           schema:
 *             type: string
 *             format: binary
 *         audio/wav:
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
 *                     key: { type: string }
 *                     size: { type: integer }
 *       403:
 *         description: 非管理员
 */
router.post(
  '/:key',
  express.raw({ type: () => true, limit: UPLOAD_MAX_SIZE }),
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const key = String(req.params.key || '');
    if (!validKey(key)) {
      fail(res, '未知的台词 key');
      return;
    }
    const body = req.body as Buffer;
    if (!body || body.length === 0) {
      fail(res, '录音内容为空');
      return;
    }
    // Content-Type 白名单校验
    const contentType = String(req.headers['content-type'] || '')
      .split(';')[0]
      .trim();
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      fail(res, '仅支持音频文件（webm/mp4/ogg/wav）');
      return;
    }
    // 依据 Content-Type 决定扩展名（MediaRecorder：Chrome=webm，Safari=mp4）
    let ext = '.webm';
    if (contentType.includes('mp4')) ext = '.mp4';
    else if (contentType.includes('ogg')) ext = '.ogg';
    else if (contentType.includes('wav')) ext = '.wav';

    await ensureDir();
    // 异步清掉同 key 旧文件（可能扩展名不同）
    for (const e of ALLOWED_EXT) {
      const old = path.join(VOICE_DIR, key + e);
      try {
        await fsPromises.unlink(old);
      } catch {
        // 不存在，忽略
      }
    }
    await fsPromises.writeFile(path.join(VOICE_DIR, key + ext), body);
    success(res, { key, size: body.length });
  })
);

/**
 * @swagger
 * /api/voice/{key}:
 *   delete:
 *     summary: 删除录音
 *     description: 管理员删除配音，回退 TTS
 *     tags: [Voice]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: 台词 key
 *     responses:
 *       200:
 *         description: 删除成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     key: { type: string }
 *       403:
 *         description: 非管理员
 */
router.delete(
  '/:key',
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const key = String(req.params.key || '');
    if (!validKey(key)) {
      fail(res, '未知的台词 key');
      return;
    }
    for (const e of ALLOWED_EXT) {
      const p = path.join(VOICE_DIR, key + e);
      try {
        await fsPromises.unlink(p);
      } catch {
        // 不存在，忽略
      }
    }
    success(res, { key });
  })
);

export default router;
