/**
 * 前端错误上报：全局异常捕获 → 后端落盘 → 后台可查
 * - window error / unhandledrejection / Vue errorHandler
 * - 同一错误 30 秒内只报一次，单次会话最多 20 条，防刷
 */

const THROTTLE_MS = 30 * 1000;
const MAX_PER_SESSION = 20;

let sessionCount = 0;
const lastReported = new Map<string, number>();

const report = (message: string, detail?: string): void => {
  try {
    if (sessionCount >= MAX_PER_SESSION) return;
    const key = message.slice(0, 120);
    const now = Date.now();
    const last = lastReported.get(key) || 0;
    if (now - last < THROTTLE_MS) return;
    lastReported.set(key, now);
    sessionCount++;

    fetch('/api/logs/client', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
      },
      body: JSON.stringify({ message, detail }),
    }).catch(() => {
      // 上报失败静默（离线时丢给下次错误再试）
    });
  } catch {
    // ignore
  }
};

/** 页面加载错误（资源加载失败、同步异常） */
const onError = (event: ErrorEvent): void => {
  report(`页面异常: ${event.message}`, `${event.filename}:${event.lineno}:${event.colno}\n${event.error?.stack || ''}`);
};

/** 未处理的 Promise 拒绝（接口异常漏接、异步报错） */
const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  // 网络类错误（后端没开/断网）太常见，不上报
  if (/NetworkError|Failed to fetch|Network request failed|ERR_/i.test(message)) return;
  report(`未处理的 Promise 拒绝: ${message}`, reason instanceof Error ? reason.stack : undefined);
};

/** 在 main.ts 中调用：安装全局监听 + Vue 错误处理 */
export const installErrorReport = (app: { config: Record<string, any> }): void => {
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  app.config.errorHandler = (err: unknown, _instance: unknown, info: string) => {
    const e = err instanceof Error ? err : new Error(String(err));
    report(`Vue 组件异常: ${e.message}`, `${info}\n${e.stack || ''}`);
    // 仍打印到控制台，方便开发
    console.error(err, info);
  };
};
