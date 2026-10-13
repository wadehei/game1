import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { success, fail, asyncHandler } from '../utils/response';

/**
 * 照片头像上传（非必填，默认仍用 emoji）
 * - 客户端已压缩为 ≤256px 方图，服务端再限 2MB / 图片类型白名单
 * - 创建角色时用户尚未登录，故不设登录门槛（与创建角色同风险级），按 IP 限流
 */

const AVATAR_DIR = path.resolve(process.cwd(), 'uploads', 'avatars');
const MAX_SIZE = 2 * 1024 * 1024;

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

const ensureDir = (): void => {
  if (!fs.existsSync(AVATAR_DIR)) {
    fs.mkdirSync(AVATAR_DIR, { recursive: true });
  }
};

// 简单限流：每 IP 每分钟 20 次上传
const rateMap = new Map<string, { count: number; resetAt: number }>();
const allowRate = (ip: string): boolean => {
  const now = Date.now();
  const rec = rateMap.get(ip);
  if (!rec || rec.resetAt < now) {
    rateMap.set(ip, { count: 1, resetAt: now + 60 * 1000 });
    return true;
  }
  rec.count += 1;
  return rec.count <= 20;
};

const router = Router();

// 上传（raw 二进制），返回可作 avatar 字段的相对 URL
router.post(
  '/api/upload/avatar',
  express.raw({ type: () => true, limit: MAX_SIZE }),
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
    // 简单魔数校验，防止伪装成图片的其他文件
    const isJpg = body[0] === 0xff && body[1] === 0xd8;
    const isPng = body[0] === 0x89 && body[1] === 0x50;
    const isWebp = body.slice(8, 12).toString() === 'WEBP';
    const isGif = body.slice(0, 3).toString() === 'GIF';
    if (!isJpg && !isPng && !isWebp && !isGif) {
      fail(res, '文件内容不是有效图片');
      return;
    }

    ensureDir();
    const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    fs.writeFileSync(path.join(AVATAR_DIR, name), body);
    success(res, { url: `/api/avatars/${name}` });
  })
);

// 静态提供（公开，长缓存）
router.get('/api/avatars/:file', (req, res) => {
  const file = String(req.params.file || '');
  if (!/^[A-Za-z0-9_-]+\.(jpg|png|webp|gif)$/.test(file)) {
    res.status(404).json({ code: 404, message: 'not found' });
    return;
  }
  const p = path.join(AVATAR_DIR, file);
  if (!fs.existsSync(p)) {
    res.status(404).json({ code: 404, message: 'not found' });
    return;
  }
  res.setHeader('Content-Type', MIME_BY_EXT[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.sendFile(p);
});

export default router;
