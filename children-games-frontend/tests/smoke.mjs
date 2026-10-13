// 冒烟测试：加载全部页面 + 基础交互，检查 JS 异常与 DOM 结构
// 无需后端（接口失败走离线兜底路径）。运行：npm run smoke
// 前置：先启动 dev 服务器（npm run dev，默认 8080），或用 BASE_URL 指定地址
import puppeteer from 'puppeteer';

const BASE = process.env.BASE_URL || 'http://localhost:8080';
const routes = [
  { hash: '#/', name: '首页', expect: (d) => d.gameCards >= 8, expectText: '大厅应有 8 张游戏卡片' },
  { hash: '#/memory', name: '记忆翻牌', expect: (d) => d.cards >= 4, expectText: '应有翻牌卡片' },
  { hash: '#/fruit', name: '接水果', expect: (d) => d.canvas, expectText: '应有画布' },
  { hash: '#/puzzle', name: '拼图', expect: (d) => d.pieces === 9, expectText: '应有 3×3 拼图块' },
  { hash: '#/balloon', name: '打气球', expect: (d) => d.canvas, expectText: '应有画布' },
  { hash: '#/tank', name: '坦克大战', expect: (d) => d.canvas && d.buttons === 3, expectText: '应有画布和 3 个控制按钮' },
  { hash: '#/mole', name: '打地鼠', expect: (d) => d.holes === 9, expectText: '应有 9 个地洞' },
  { hash: '#/simon', name: '音乐记忆', expect: (d) => d.pads === 4, expectText: '应有 4 个音块' },
  { hash: '#/math', name: '数学小怪兽', expect: (d) => d.optionBtns === 3, expectText: '应有 3 个选项按钮' },
];

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3 });

let pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(err.message));

// 角色路由守卫会拦截无 token 访问：在线则真登录，离线用占位 token 通过守卫（页面走离线兜底）
// 在线时复用已有"冒烟测试"角色，避免每次运行都新建账号污染成员列表
await page.goto(`${BASE}/#/profiles`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
await new Promise((resolve) => setTimeout(resolve, 800));
await page.evaluate(async () => {
  if (localStorage.getItem('token')) return;
  try {
    let uid;
    const profiles = await (await fetch('/api/user/profiles')).json();
    const existing = (profiles.data || []).find((p) => p.nickname === '冒烟测试');
    if (existing) {
      uid = existing.id;
    }
    const res = await fetch('/api/user/login/family', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(uid ? { uid } : { nickname: '冒烟测试', avatar: '🤖' }),
    });
    const data = await res.json();
    localStorage.setItem('token', data?.data?.token || 'offline-smoke');
    if (data?.data?.userInfo) {
      localStorage.setItem('userInfo', JSON.stringify(data.data.userInfo));
    }
  } catch {
    localStorage.setItem('token', 'offline-smoke');
  }
});

// 后端未启动时的网络报错属于预期噪音
const isNetworkNoise = (e) =>
  /NetworkError|Failed to fetch|Network request failed|ERR_CONNECTION|404|500|502|503|504|Request failed|AxiosError/i.test(e);

let passed = 0;
let failed = 0;

for (const r of routes) {
  pageErrors = [];
  await page.goto(`${BASE}/${r.hash}`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const info = await page.evaluate(() => ({
    cards: document.querySelectorAll('.game-board .card').length,
    pieces: document.querySelectorAll('.puzzle-piece').length,
    holes: document.querySelectorAll('.hole').length,
    pads: document.querySelectorAll('.pad').length,
    optionBtns: document.querySelectorAll('.option-btn').length,
    buttons: document.querySelectorAll('.control-btn').length,
    canvas: !!document.querySelector('canvas'),
    gameCards: document.querySelectorAll('.game-card').length,
  }));

  // 交互冒烟
  if (r.hash === '#/balloon') await page.click('canvas').catch(() => {});
  else if (r.hash === '#/tank') await page.click('.fire-btn').catch(() => {});
  else if (r.hash === '#/mole') await page.click('.hole').catch(() => {});
  else if (r.hash === '#/simon') await page.click('.pad').catch(() => {});
  else if (r.hash === '#/math') await page.click('.option-btn').catch(() => {});
  else if (r.hash === '#/memory') await page.click('.card').catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 800));

  const realErrors = pageErrors.filter((e) => !isNetworkNoise(e));
  const ok = r.expect(info) && realErrors.length === 0;
  if (ok) {
    passed++;
    console.log(`✅ ${r.name}`);
  } else {
    failed++;
    const reason = realErrors.length > 0 ? `页面异常: ${realErrors.join(' | ')}` : `不满足条件: ${r.expectText}`;
    console.log(`❌ ${r.name} — ${reason}（${JSON.stringify(info)}）`);
  }
}

await browser.close();
console.log(`\n🧪 冒烟测试完成：${passed} 通过，${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
