/**
 * CORS 白名单配置单测
 * 回归背景（2026-11-17 生产建房 500 事故）：92eb7d0 引入生产严格 CORS 白名单，
 * 但生产默认值是空数组且 .env 未配置 CORS_ALLOWED_ORIGINS → 浏览器（带 Origin 头）
 * 所有请求 500；curl/协议测试无 Origin 头全绿，差点长期漏过。
 * 守卫：生产默认白名单必须覆盖全部站点真实入口。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('config.cors.allowedOrigins', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('生产环境未配置 env 时，默认白名单含全部站点真实入口（建房 500 事故回归守卫）', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'test-secret-for-config');
    vi.stubEnv('DB_PASSWORD', 'test-db-password');
    vi.stubEnv('CORS_ALLOWED_ORIGINS', '');
    const { config } = await import('../../src/config/index');
    const required = [
      'http://49.232.231.35',
      'http://49.232.231.35:90',
      'http://game.985211.icu',
      'http://game.985211.icu:90',
      'https://game.985211.icu',
    ];
    for (const origin of required) {
      expect(config.cors.allowedOrigins, `生产默认白名单缺少 ${origin}`).toContain(origin);
    }
  });

  it('配置了 CORS_ALLOWED_ORIGINS 时按逗号拆分并 trim', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'test-secret-for-config');
    vi.stubEnv('DB_PASSWORD', 'test-db-password');
    vi.stubEnv('CORS_ALLOWED_ORIGINS', ' http://a.example.com , http://b.example.com ');
    const { config } = await import('../../src/config/index');
    expect(config.cors.allowedOrigins).toEqual(['http://a.example.com', 'http://b.example.com']);
  });

  it('开发环境默认允许 localhost（vite 5173 / 后端 3002）', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { config } = await import('../../src/config/index');
    expect(config.cors.allowedOrigins).toContain('http://localhost:5173');
    expect(config.cors.allowedOrigins).toContain('http://localhost:3002');
  });
});
