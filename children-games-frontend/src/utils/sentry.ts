import * as Sentry from '@sentry/vue';
import type { App } from 'vue';
import type { Router } from 'vue-router';

/**
 * 初始化 Sentry 错误监控（前端）
 *
 * - DSN 从 VITE_SENTRY_DSN 环境变量读取；未配置时跳过初始化
 * - 集成：browserTracingIntegration（路由变更自动追踪）
 * - 仅在 VITE_SENTRY_DSN 非空时启用，开发环境可留空
 */
export const initSentry = (app: App, router: Router): void => {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    return;
  }

  Sentry.init({
    app,
    dsn,
    environment: import.meta.env.PROD ? 'production' : 'development',
    integrations: [Sentry.browserTracingIntegration({ router })],
    // 生产环境 10% 性能追踪，开发环境关闭
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 0,
  });

  // Vue 组件异常统一上报 Sentry
  // 与 installErrorReport 并存：errorReport 上报到自建后端落盘，Sentry 上报到云端监控
  app.config.errorHandler = (err: unknown, _instance: unknown, info: string) => {
    Sentry.captureException(err, { extra: { info } });
  };
};

export { Sentry };
