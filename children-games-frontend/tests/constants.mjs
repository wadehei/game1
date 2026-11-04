// E2E 测试常量定义

// ─── 视口尺寸 ─────────────────────────────────────────

export const VIEWPORTS = {
  MOBILE: { width: 390, height: 844 },
  DESKTOP: { width: 1280, height: 800 },
};

// ─── 等待时间 ─────────────────────────────────────────

export const WAIT_TIMES = {
  SHORT: 300,
  MEDIUM: 800,
  LONG: 1500,
  PAGE_LOAD: 1800,
};

// ─── 游戏路由 ─────────────────────────────────────────

export const GAME_ROUTES = [
  { hash: '#/memory', name: '记忆翻牌' },
  { hash: '#/fruit', name: '接水果' },
  { hash: '#/puzzle', name: '拼图' },
  { hash: '#/balloon', name: '打气球' },
  { hash: '#/tank', name: '坦克大战' },
  { hash: '#/mole', name: '打地鼠' },
  { hash: '#/simon', name: '音乐记忆' },
  { hash: '#/math', name: '数学小怪兽' },
];

// ─── 噪音过滤模式 ─────────────────────────────────────

export const NOISE_PATTERNS =
  /NetworkError|Failed to fetch|AxiosError|ERR_|404|401|ResizeObserver|Script error/i;

// ─── 超时配置 ─────────────────────────────────────────

export const TIMEOUTS = {
  NAVIGATION: 30000,
  ELEMENT: 10000,
  WS_CONNECT: 5000,
};

// ─── 测试用户 ─────────────────────────────────────────

export const TEST_USERS = {
  ADMIN: { role: 'admin', passwordKey: 'ADMIN_PASSWORD' },
  PLAYER: { role: 'player', uid: 1 },
};
