// 记忆翻牌视觉验证：列数 ≤3 + 柔和配色截图
import puppeteer from 'puppeteer';
import { BASE, ADMIN_PASSWORD } from './helpers.mjs';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (label, cond) => console.log(`${cond ? '✅' : '❌'} ${label}`);

await page.goto(`${BASE}/#/profiles`, { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(800);
const { uid, level } = await page.evaluate(async (adminPassword) => {
  const profiles = await (await fetch('/api/user/profiles')).json();
  const uid = (profiles.data || [])[0]?.id;
  const login = await fetch('/api/user/login/family', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid }),
  });
  const data = await login.json();
  localStorage.setItem('token', data.data.token);
  localStorage.setItem('userInfo', JSON.stringify(data.data.userInfo));
  const admin = await (await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: adminPassword }),
  })).json();
  localStorage.setItem('admin_token', admin.data.token);
  const progress = await (await fetch('/api/game/progress/memory', {
    headers: { Authorization: `Bearer ${data.data.token}` },
  })).json();
  return { uid, level: progress.data?.currentLevel || 1 };
}, ADMIN_PASSWORD);
console.log(`成员 uid=${uid}，记忆翻牌当前第 ${level} 关`);

const readCols = () =>
  page.evaluate(() => {
    const board = document.querySelector('.game-board');
    const cards = document.querySelectorAll('.game-board .card').length;
    const firstRowTop = board.firstElementChild.getBoundingClientRect().top;
    let cols = 0;
    for (const c of board.children) {
      if (Math.abs(c.getBoundingClientRect().top - firstRowTop) < 2) cols++;
      else break;
    }
    return { cols, cards, boardW: board.clientWidth };
  });

// ═══ 1. 当前关（默认对数）列数 ≤3 ═══
await page.goto(`${BASE}/#/memory`, { waitUntil: 'networkidle2' });
await sleep(1800);
let info = await readCols();
check(`默认布局：${info.cards} 张 / 每行 ${info.cols} 个（≤3）`, info.cols <= 3);
await page.screenshot({ path: 'test-results/memory-soft-default.png' });

// ═══ 2. 后台覆盖 8 对（16 张）→ 应 2 列 ═══
await page.evaluate(async (lv) => {
  await fetch(`/api/admin/levels/memory/${lv}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
    body: JSON.stringify({ config: { pairs: 8 } }),
  });
}, level);
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' });
await sleep(600);
await page.goto(`${BASE}/#/memory`, { waitUntil: 'networkidle2' });
await sleep(1800);
info = await readCols();
check(`8 对（16 张）：每行 ${info.cols} 个（期望 2），图标变大`, info.cols === 2);
await page.screenshot({ path: 'test-results/memory-soft-16cards.png' });

// ═══ 3. 覆盖 3 对（6 张）→ 应 3 列 ═══
await page.evaluate(async (lv) => {
  await fetch(`/api/admin/levels/memory/${lv}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
    body: JSON.stringify({ config: { pairs: 3 } }),
  });
}, level);
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' });
await sleep(600);
await page.goto(`${BASE}/#/memory`, { waitUntil: 'networkidle2' });
await sleep(1800);
info = await readCols();
check(`3 对（6 张）：每行 ${info.cols} 个（期望 3）`, info.cols === 3);
await page.screenshot({ path: 'test-results/memory-soft-6cards.png' });

// ═══ 4. 清理覆盖 ═══
await page.evaluate(async (lv) => {
  await fetch(`/api/admin/levels/memory/${lv}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
  });
}, level);
check('已清理测试覆盖', true);

await browser.close();
