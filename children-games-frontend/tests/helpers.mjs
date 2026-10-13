// 测试共享配置：从后端 .env 读取管理密码，避免测试硬编码过期
import fs from 'fs';
import path from 'path';

export const BASE = process.env.BASE_URL || 'http://localhost:8080';

export const ADMIN_PASSWORD =
  fs
    .readFileSync(path.resolve(import.meta.dirname, '../../children-games-backend/.env'), 'utf8')
    .match(/^ADMIN_PASSWORD=(.*)$/m)?.[1]?.trim() || '';
