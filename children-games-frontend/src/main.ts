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
  return { app };
}

// 开发环境直接挂载
if (typeof document !== 'undefined') {
  initTheme(); // 主题（index.html 已尽早预置 data-theme，这里负责系统切换监听）
  const { app } = createApp();
  app.mount('#app');
}
