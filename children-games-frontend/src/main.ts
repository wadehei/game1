import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import router from './router';
import App from './App.vue';
import { installErrorReport } from './utils/errorReport';
import { initTheme } from './utils/theme';
import './styles/dark.css';

export function createApp() {
  const app = createSSRApp(App);
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);
  installErrorReport(app);
  // Sentry 放在 errorReport 之后：Vue errorHandler 由 Sentry 接管
  // （installErrorReport 的 window 监听仍生效，Sentry 额外上报云端）
  // 延迟初始化 Sentry：生产环境下等浏览器空闲时再加载，减少首屏关键路径
  if (import.meta.env.PROD) {
    const idleCallback =
      window.requestIdleCallback || ((cb: IdleRequestCallback) => setTimeout(cb, 1));
    idleCallback(() => {
      import('./utils/sentry').then(({ initSentry }) => {
        initSentry(app, router);
      });
    });
  } else {
    // 开发环境仍然同步初始化，方便调试
    import('./utils/sentry').then(({ initSentry }) => {
      initSentry(app, router);
    });
  }
  return { app };
}

// 开发环境直接挂载
if (typeof document !== 'undefined') {
  initTheme(); // 主题（index.html 已尽早预置 data-theme，这里负责系统切换监听）
  const { app } = createApp();
  app.mount('#app');
}
