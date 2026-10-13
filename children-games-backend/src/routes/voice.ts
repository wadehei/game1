import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { adminMiddleware } from '../middleware/adminAuth';
import { success, fail, asyncHandler } from '../utils/response';

/**
 * 家长原声配音：录好的语音按台词 key 存文件（uploads/voice/{key}.{ext}）
 * 孩子端优先播放录音，未录的台词回退 TTS
 */

// 与前端 admin/VoicePanel 的台词清单保持一致（防任意文件写入）
const VOICE_KEYS = new Set([
  'memory_intro', 'fruit_intro', 'puzzle_intro', 'balloon_intro', 'tank_intro',
  'mole_intro', 'simon_intro',
  'math_correct', 'math_wrong',
  'result_win', 'result_lose',
  'rest_start',
]);

const VOICE_DIR = path.resolve(process.cwd(), 'uploads', 'voice');
const MAX_SIZE = 2 * 1024 * 1024;

const ensureDir = (): void => {
  if (!fs.existsSync(VOICE_DIR)) {
    fs.mkdirSync(VOICE_DIR, { recursive: true });
  }
};

const ALLOWED_EXT = new Set(['.webm', '.mp4', '.ogg', '.m4a', '.wav']);
const MIME_BY_EXT: Record<string, string> = {
  '.webm': 'audio/webm',
  '.mp4': 'audio/mp4',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

const validKey = (key: string): boolean => /^[a-z_]{2,40}$/.test(key) && VOICE_KEYS.has(key);

const fileOf = (key: string): string | null => {
  if (!validKey(key)) return null;
  for (const ext of ALLOWED_EXT) {
    const p = path.join(VOICE_DIR, key + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
};

const router = Router();

// 已配音列表（孩子端启动时探测，公开）
router.get('/', asyncHandler(async (req, res) => {
  ensureDir();
  const items: { key: string; size: number; updatedAt: number }[] = [];
  for (const key of VOICE_KEYS) {
    const p = fileOf(key);
    if (p) {
      const stat = fs.statSync(p);
      items.push({ key, size: stat.size, updatedAt: Math.round(stat.mtimeMs) });
    }
  }
  success(res, items);
}));

// 播放某条录音（公开，长缓存）
router.get('/:key', (req, res) => {
  const p = fileOf(String(req.params.key || ''));
  if (!p) {
    res.status(404).json({ code: 404, message: '该台词未配音' });
    return;
  }
  res.setHeader('Content-Type', MIME_BY_EXT[path.extname(p)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(p);
});

// 上传录音（管理员；raw body 二进制）
router.post(
  '/:key',
  express.raw({ type: () => true, limit: MAX_SIZE }),
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
    // 依据 Content-Type 决定扩展名（MediaRecorder：Chrome=webm，Safari=mp4）
    const contentType = String(req.headers['content-type'] || '');
    let ext = '.webm';
    if (contentType.includes('mp4')) ext = '.mp4';
    else if (contentType.includes('ogg')) ext = '.ogg';
    else if (contentType.includes('wav')) ext = '.wav';

    ensureDir();
    // 清掉同 key 旧文件（可能扩展名不同）
    for (const e of ALLOWED_EXT) {
      const old = path.join(VOICE_DIR, key + e);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    fs.writeFileSync(path.join(VOICE_DIR, key + ext), body);
    success(res, { key, size: body.length });
  })
);

// 删除录音（管理员，回退 TTS）
router.delete('/:key', adminMiddleware, asyncHandler(async (req, res) => {
  const key = String(req.params.key || '');
  if (!validKey(key)) {
    fail(res, '未知的台词 key');
    return;
  }
  for (const e of ALLOWED_EXT) {
    const p = path.join(VOICE_DIR, key + e);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  success(res, { key });
}));

export default router;
