import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import router from './router';
import App from './App.vue';

export function createApp() {
  const app = createSSRApp(App);
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);
  return { app };
}

// 开发环境直接挂载
if (typeof document !== 'undefined') {
  const { app } = createApp();
  app.mount('#app');
}
