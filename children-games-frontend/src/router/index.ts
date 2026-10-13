import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/pages/index/index.vue'),
  },
  {
    path: '/profiles',
    name: 'Profiles',
    component: () => import('@/pages/profiles/index.vue'),
  },
  {
    path: '/admin',
    name: 'Admin',
    component: () => import('@/pages/admin/index.vue'),
  },
  {
    path: '/admin/login',
    name: 'AdminLogin',
    component: () => import('@/pages/admin/AdminLogin.vue'),
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

// 未登录（没有角色凭证）时先去选角色页；后台管理走独立的密码体系
router.beforeEach((to) => {
  if (to.path === '/admin' && !localStorage.getItem('admin_token')) {
    return { path: '/admin/login' };
  }
  if (to.path.startsWith('/admin') || to.path === '/profiles') {
    return true;
  }
  const hasToken = !!localStorage.getItem('token');
  if (!hasToken) {
    return { path: '/profiles' };
  }
});

export default router;
