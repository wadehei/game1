import { Router } from 'express';
import fsPromises from 'fs/promises';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { success, fail, asyncHandler } from '../utils/response';
import {
  UPLOAD_MAX_SIZE,
  RATE_LIMIT_MAX_SIZE,
  RATE_LIMIT_CLEANUP_THRESHOLD,
} from '../config/constants';

/**
 * 照片头像上传（非必填，默认仍用 emoji）
 * - 客户端已压缩为 ≤256px 方图，服务端再限 2MB / 图片类型白名单
 * - 创建角色时用户尚未登录，故不设登录门槛（与创建角色同风险级），按 IP 限流
 */

const AVATAR_DIR = path.resolve(process.cwd(), 'uploads', 'avatars');

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

// 异步确保目录存在
const ensureDir = async (): Promise<void> => {
  await fsPromises.mkdir(AVATAR_DIR, { recursive: true });
};

// 简单限流：每 IP 每分钟 20 次上传
const rateMap = new Map<string, { count: number; resetAt: number }>();

const evictOldestRateEntries = (targetSize: number): void => {
  if (rateMap.size <= targetSize) return;
  const entries = [...rateMap.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
  const toDelete = rateMap.size - targetSize;
  for (let i = 0; i < toDelete && i < entries.length; i++) {
    rateMap.delete(entries[i][0]);
  }
};

const allowRate = (ip: string): boolean => {
  const now = Date.now();
  const rec = rateMap.get(ip);
  if (!rec || rec.resetAt < now) {
    if (rateMap.size >= RATE_LIMIT_MAX_SIZE) {
      evictOldestRateEntries(RATE_LIMIT_CLEANUP_THRESHOLD);
    }
    rateMap.set(ip, { count: 1, resetAt: now + 60 * 1000 });
    return true;
  }
  rec.count += 1;
  return rec.count <= 20;
};
setInterval(
  () => {
    const now = Date.now();
    for (const [ip, rec] of rateMap) {
      if (rec.resetAt < now) rateMap.delete(ip);
    }
  },
  5 * 60 * 1000
).unref();

const router = Router();

/**
 * @swagger
 * /api/upload/avatar:
 *   post:
 *     summary: 上传照片头像
 *     description: raw 二进制上传，限 2MB / jpg|png|webp|gif，返回可作 avatar 字段的相对 URL
 *     tags: [Avatar]
 *     requestBody:
 *       required: true
 *       content:
 *         image/jpeg:
 *           schema:
 *             type: string
 *             format: binary
 *         image/png:
 *           schema:
 *             type: string
 *             format: binary
 *         image/webp:
 *           schema:
 *             type: string
 *             format: binary
 *         image/gif:
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
 *                     url: { type: string, example: /api/avatars/xxx.jpg }
 *       429:
 *         description: 上传太频繁
 */
router.post(
  '/api/upload/avatar',
  express.raw({ type: () => true, limit: UPLOAD_MAX_SIZE }),
  asyncHandler(async (req, res) => {
    if (!allowRate(req.ip || 'unknown')) {
      fail(res, '上传太频繁，稍后再试', 429);
      return;
    }
    const contentType = String(req.headers['content-type'] || '');
    const ext = EXT_BY_TYPE[contentType.split(';')[0].trim()];
    if (!ext) {
      fail(res, '仅支持 jpg/png/webp/gif 图片');
      return;
    }
    const body = req.body as Buffer;
    if (!body || body.length === 0) {
      fail(res, '图片内容为空');
      return;
    }
    const isJpg = body[0] === 0xff && body[1] === 0xd8;
    const isPng = body[0] === 0x89 && body[1] === 0x50;
    const isWebp = body.slice(8, 12).toString() === 'WEBP';
    const isGif = body.slice(0, 3).toString() === 'GIF';
    if (!isJpg && !isPng && !isWebp && !isGif) {
      fail(res, '文件内容不是有效图片');
      return;
    }

    await ensureDir();
    const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    await fsPromises.writeFile(path.join(AVATAR_DIR, name), body);
    success(res, { url: `/api/avatars/${name}` });
  })
);

/**
 * @swagger
 * /api/avatars/{file}:
 *   get:
 *     summary: 获取头像图片
 *     description: 公开接口，长缓存（7 天）
 *     tags: [Avatar]
 *     parameters:
 *       - in: path
 *         name: file
 *         required: true
 *         schema:
 *           type: string
 *         description: 文件名（含扩展名）
 *     responses:
 *       200:
 *         description: 图片二进制流
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *           image/webp:
 *             schema:
 *               type: string
 *               format: binary
 *           image/gif:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: 文件不存在
 */
router.get('/api/avatars/:file', async (req, res) => {
  const file = String(req.params.file || '');
  if (!/^[A-Za-z0-9_-]+\.(jpg|png|webp|gif)$/.test(file)) {
    res.status(404).json({ code: 404, message: 'not found' });
    return;
  }
  const p = path.join(AVATAR_DIR, file);
  try {
    await fsPromises.access(p, fs.constants.F_OK);
  } catch {
    res.status(404).json({ code: 404, message: 'not found' });
    return;
  }
  res.setHeader('Content-Type', MIME_BY_EXT[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.sendFile(p);
});

export default router;
