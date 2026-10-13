import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import router from './router';
import App from './App.vue';
import { installErrorReport } from './utils/errorReport';

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
  const { app } = createApp();
  app.mount('#app');
}
