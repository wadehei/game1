import { createRouter, createWebHashHistory } from 'vue-router';
import { storage } from '@/utils/storage';

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
    path: '/memory-3d',
    name: 'Memory3D',
    component: () => import('@/pages/memory/index3d.vue'),
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
    path: '/mole-3d',
    name: 'Mole3D',
    component: () => import('@/pages/mole/index3d.vue'),
  },
  {
    path: '/simon',
    name: 'Simon',
    component: () => import('@/pages/simon/index.vue'),
  },
  {
    path: '/simon-3d',
    name: 'Simon3D',
    component: () => import('@/pages/simon/index3d.vue'),
  },
  {
    path: '/match',
    name: 'Match',
    component: () => import('@/pages/match/index.vue'),
  },
  {
    path: '/match3',
    name: 'Match3',
    component: () => import('@/pages/match3/index.vue'),
  },
  {
    path: '/match3-3d',
    name: 'Match33D',
    component: () => import('@/pages/match3/index3d.vue'),
  },
  {
    path: '/math',
    name: 'Math',
    component: () => import('@/pages/math/index.vue'),
  },
  {
    path: '/brick',
    name: 'Brick',
    component: () => import('@/pages/brick/index.vue'),
  },
  {
    path: '/sudoku',
    name: 'Sudoku',
    component: () => import('@/pages/sudoku/index.vue'),
  },
  {
    path: '/claw',
    name: 'Claw',
    component: () => import('@/pages/claw/index.vue'),
  },
  {
    path: '/claw-3d',
    name: 'Claw3D',
    component: () => import('@/pages/claw/index3d.vue'),
  },
  {
    path: '/doudizhu',
    name: 'Doudizhu',
    component: () => import('@/pages/doudizhu/index.vue'),
  },
  {
    path: '/doudizhu-3d',
    name: 'Doudizhu3D',
    component: () => import('@/pages/doudizhu/index3d.vue'),
  },
  {
    // 已删游戏（/balloon 等）或手输错链接的兜底，回首页而不是空白
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    redirect: '/',
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

// 未登录（没有角色凭证）时先去选角色页；后台管理走独立的密码体系
// 记住了"上次是谁"（last_profile_id）且该角色未设口令时，静默重登无感恢复
router.beforeEach(async (to) => {
  if (to.path === '/admin' && !storage.getItem('admin_token')) {
    return { path: '/admin/login' };
  }
  if (to.path.startsWith('/admin') || to.path === '/profiles') {
    return true;
  }
  if (storage.getItem('token')) {
    return true;
  }
  const lastId = storage.getItem('last_profile_id');
  if (lastId) {
    try {
      const { familyLogin } = await import('@/api/user');
      await familyLogin({ uid: Number(lastId) });
      return true;
    } catch {
      // 口令角色无法静默重登（需 pin），或成员已被删除 → 去选角色页
    }
  }
  // 带上原始目标：选角登录后直接回到要去的页面（如好友分享的房间邀请链接）
  return { path: '/profiles', query: { redirect: to.fullPath } };
});

export default router;
