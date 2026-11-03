import * as Sentry from '@sentry/node';

/**
 * 初始化 Sentry 错误监控（后端）
 *
 * - DSN 从 SENTRY_DSN 环境变量读取；未配置时跳过初始化（开发环境可静默启动）
 * - 集成：Http（出站请求追踪）、Express（路由上下文）
 * - 仅在 NODE_ENV=production 时启用 10% traces，避免本地噪音
 *
 * 注意：错误处理中间件需在所有路由之后单独调用 Sentry.setupExpressErrorHandler(app)
 */
export const initSentry = (): void => {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    // 未配置 DSN：静默跳过，不污染控制台
    return;
  }

  const environment = process.env.NODE_ENV || 'development';
  const isProduction = environment === 'production';

  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: isProduction ? 0.1 : 0,
    integrations: [Sentry.httpIntegration(), Sentry.expressIntegration()],
  });
};

export { Sentry };
