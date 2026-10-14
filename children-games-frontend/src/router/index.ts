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
    path: '/feedback',
    name: 'Feedback',
    component: () => import('@/pages/feedback/index.vue'),
  },
  {
    path: '/profile',
    name: 'Profile',
    component: () => import('@/pages/profile/index.vue'),
  },
  {
    path: '/battle',
    name: 'Battle',
    component: () => import('@/pages/battle/index.vue'),
  },
  {
    path: '/battle/room/:roomId',
    name: 'BattleRoom',
    component: () => import('@/pages/battle/room.vue'),
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
// 记住了"上次是谁"（last_profile_id）且该角色未设口令时，静默重登无感恢复
router.beforeEach(async (to) => {
  if (to.path === '/admin' && !localStorage.getItem('admin_token')) {
    return { path: '/admin/login' };
  }
  if (to.path.startsWith('/admin') || to.path === '/profiles') {
    return true;
  }
  if (localStorage.getItem('token')) {
    return true;
  }
  const lastId = localStorage.getItem('last_profile_id');
  if (lastId) {
    try {
      const { familyLogin } = await import('@/api/user');
      await familyLogin({ uid: Number(lastId) });
      return true;
    } catch {
      // 口令角色无法静默重登（需 pin），或成员已被删除 → 去选角色页
    }
  }
  return { path: '/profiles' };
});

export default router;
