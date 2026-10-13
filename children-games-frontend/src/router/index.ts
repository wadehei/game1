import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/pages/index/index.vue'),
  },
  {
    path: '/user',
    name: 'User',
    component: () => import('@/pages/user/index.vue'),
  },
  {
    path: '/memory',
    name: 'Memory',
    component: () => import('@/pages/memory/index.vue'),
  },
  {
    path: '/fruit',
    name: 'Fruit',
    component: () => import('@/pages/fruit/index.vue'),
  },
  {
    path: '/puzzle',
    name: 'Puzzle',
    component: () => import('@/pages/puzzle/index.vue'),
  },
  {
    path: '/balloon',
    name: 'Balloon',
    component: () => import('@/pages/balloon/index.vue'),
  },
  {
    path: '/tank',
    name: 'Tank',
    component: () => import('@/pages/tank/index.vue'),
  },
  {
    path: '/mole',
    name: 'Mole',
    component: () => import('@/pages/mole/index.vue'),
  },
  {
    path: '/simon',
    name: 'Simon',
    component: () => import('@/pages/simon/index.vue'),
  },
  {
    path: '/math',
    name: 'Math',
    component: () => import('@/pages/math/index.vue'),
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
