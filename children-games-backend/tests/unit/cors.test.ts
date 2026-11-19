/**
 * CORS 白名单配置单测
 * 回归背景（2026-11-17 生产建房 500 事故）：92eb7d0 引入生产严格 CORS 白名单，
 * 但生产默认值是空数组且 .env 未配置 CORS_ALLOWED_ORIGINS → 浏览器（带 Origin 头）
 * 所有请求 500；curl/协议测试无 Origin 头全绿，差点长期漏过。
 *
 * 安全优化（2026-11-19）：移除硬编码 IP 白名单，生产环境必须通过环境变量配置。
 * 未配置时返回空数组（安全优先，拒绝所有跨域请求）。
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

  it('生产环境未配置 env 时，默认白名单为空（安全优先，必须通过环境变量配置）', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'test-secret-for-config');
    vi.stubEnv('DB_PASSWORD', 'test-db-password');
    vi.stubEnv('CORS_ALLOWED_ORIGINS', '');
    // fail-fast：未配置必须在 import（启动）时抛错，而不是上线后浏览器全员 500
    await expect(import('../../src/config/index')).rejects.toThrow(/CORS_ALLOWED_ORIGINS/);
  });

  it('生产已配置 CORS_ALLOWED_ORIGINS 时正常启动且白名单生效', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'test-secret-for-config');
    vi.stubEnv('DB_PASSWORD', 'test-db-password');
    vi.stubEnv('CORS_ALLOWED_ORIGINS', 'http://example.com');
    const { config } = await import('../../src/config/index');
    expect(config.cors.allowedOrigins).toEqual(['http://example.com']);
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
