import { ADMIN_PASSWORD } from './helpers.mjs';
// 关卡配置 E2E：后台设覆盖 → 游戏页生效 → 删除恢复默认 + 后台面板截图
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:8080';
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(err.message));
const check = (label, cond) => console.log(`${cond ? '✅' : '❌'} ${label}`);

// 页面先加载一次拿到源（fetch 用相对路径）
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
await sleep(800);

// API 便捷封装（带 admin token）
const adminApi = (method, path, body) => page.evaluate(async ({ method, path, body }) => {
  const res = await fetch(`/api/admin${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}, { method, path, body });

// ═══ 0. 管理员登录（走 UI，覆盖登录流程） ═══
await page.goto(`${BASE}/#/admin/login`, { waitUntil: 'networkidle2' });
await sleep(800);
await page.type('.login-input', ADMIN_PASSWORD);
await page.click('.login-btn');
await sleep(1200);
check('管理员登录进入后台', !!(await page.$('.admin-body')));

// ═══ 1. 设置覆盖：记忆第 1 关 → 时限 130 秒、3 对牌 ═══
{
  const res = await adminApi('PUT', '/levels/memory/1', { config: { timeLimit: 130, pairs: 3 } });
  check('保存关卡覆盖接口成功', res.status === 200);
}

// ═══ 2. 游戏页生效验证 ═══
// 种角色 token（假 token 会走离线兜底，游戏照常进）
const seedToken = () => page.evaluate(() => localStorage.setItem('token', 'offline'));
await seedToken();
await page.goto(`${BASE}/#/memory`, { waitUntil: 'networkidle2' });
await sleep(1800);
{
  const state = await page.evaluate(() => ({
    time: parseInt(document.querySelectorAll('.header-item')[1]?.querySelector('.value')?.textContent || '0', 10),
    cards: document.querySelectorAll('.game-board .card').length,
  }));
  check(`时限覆盖生效：显示 ${state.time}s（期望 129~130）`, state.time >= 128 && state.time <= 130);
  check(`对数覆盖生效：${state.cards} 张牌（期望 6 = 3 对）`, state.cards === 6);
  await page.screenshot({ path: 'test-results/levels-override-active.png' });
}

// ═══ 3. 后台面板展示覆盖列表 ═══
await page.goto(`${BASE}/#/admin`, { waitUntil: 'networkidle2' });
await sleep(1000);
await page.evaluate(() => {
  [...document.querySelectorAll('.mobile-tab, .nav-item')].find((t) => t.textContent.includes('难度配置'))?.click();
});
await sleep(1200);
await page.evaluate(() => {
  [...document.querySelectorAll('.chip')].find((c) => c.textContent.includes('记忆翻牌'))?.click();
});
await sleep(800);
{
  const rows = await page.evaluate(() => [...document.querySelectorAll('.override-row')].map((r) => r.textContent.trim().replace(/\s+/g, ' ')));
  check(`面板显示覆盖列表：${rows[0] || ''}`, rows.length === 1 && rows[0].includes('第 1 关'));
  await page.screenshot({ path: 'test-results/admin-levels-panel.png' });
}

// ═══ 4. 删除覆盖 → 游戏页恢复默认 ═══
{
  const res = await adminApi('DELETE', '/levels/memory/1');
  check('删除覆盖接口成功', res.status === 200);
}
await seedToken();
await page.goto(`${BASE}/#/memory`, { waitUntil: 'networkidle2' });
await sleep(1800);
{
  const state = await page.evaluate(() => ({
    time: parseInt(document.querySelectorAll('.header-item')[1]?.querySelector('.value')?.textContent || '0', 10),
    cards: document.querySelectorAll('.game-board .card').length,
  }));
  check(`恢复默认：显示 ${state.time}s（期望 89~90）`, state.time >= 88 && state.time <= 90);
  check(`恢复默认：${state.cards} 张牌（期望 4 = 2 对）`, state.cards === 4);
}

console.log(`\n页面异常：${pageErrors.length}${pageErrors.length ? ' → ' + pageErrors.join(' | ') : ' ✅ 无'}`);
await browser.close();
