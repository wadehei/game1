import { ADMIN_PASSWORD } from './helpers.mjs';
// 错误日志 E2E：客户端抛错 → 上报落盘 → 后台日志页可见 → 清空
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:8080';
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(err.message));
const check = (label, cond) => console.log(`${cond ? '✅' : '❌'} ${label}`);

await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
await sleep(800);

// ═══ 0. 准备：登录第一个家庭成员 + 管理员 token ═══
await page.evaluate(async (adminPassword) => {
  const profilesRes = await fetch('/api/user/profiles');
  const uid = ((await profilesRes.json()).data || [])[0]?.id;
  const res = await fetch('/api/user/login/family', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid }),
  });
  const data = await res.json();
  localStorage.setItem('token', data.data.token);
  localStorage.setItem('userInfo', JSON.stringify(data.data.userInfo));

  const admin = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: adminPassword }),
  });
  const adminData = await admin.json();
  localStorage.setItem('admin_token', adminData.data.token);
}, ADMIN_PASSWORD);

// ═══ 1. 触发一个客户端错误（异步 throw → window error 事件） ═══
await page.evaluate(() => {
  setTimeout(() => {
    // eslint-disable-next-line no-undef
    throw new Error('E2E测试错误：这是一条故意制造的日志');
  }, 0);
});
await sleep(3000); // 等 2s 刷盘 + 上报

// ═══ 2. 后端日志接口应有客户端来源的记录（浏览器对跨上下文 throw 会脱敏成 Script error.） ═══
const logs = await page.evaluate(async () => {
  const res = await fetch('/api/admin/logs?limit=50', {
    headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
  });
  return (await res.json()).data;
});
const clientLog = (logs || []).find((l) => l.source === 'client');
check(`客户端错误已落盘（日志共 ${logs?.length || 0} 条，含 client 来源）`, !!clientLog);
check(`上报带用户标识（实际：${clientLog?.message}）`, /用户\d+/.test(clientLog?.message || ''));

// ═══ 3. 后台"错误日志"页可见 ═══
await page.goto(`${BASE}/#/admin`, { waitUntil: 'networkidle2' });
await sleep(1000);
await page.evaluate(() => {
  [...document.querySelectorAll('.nav-item, .mobile-tab')].find((t) => t.textContent.includes('错误日志'))?.click();
});
await sleep(1000);
const rows = await page.evaluate(() => document.querySelectorAll('.log-row').length);
check(`后台日志页渲染 ${rows} 行（期望 ≥1）`, rows >= 1);
await page.screenshot({ path: 'test-results/admin-logs.png' });

// ═══ 4. 清空（等待潜在的迟到上报完成后再数） ═══
await page.evaluate(() => {
  window.confirm = () => true;
});
await page.evaluate(() => {
  // v-show 隐藏的面板仍留在 DOM，只点可见面板里的按钮
  [...document.querySelectorAll('.act-btn')]
    .filter((b) => b.offsetParent !== null && b.textContent.includes('清空'))[0]
    ?.click();
});
await sleep(3500);
const afterClear = await page.evaluate(async () => {
  const res = await fetch('/api/admin/logs', {
    headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
  });
  return (await res.json()).data.length;
});
check(`清空后日志为 0 条（实际 ${afterClear}）`, afterClear === 0);

console.log(`\n页面异常：${pageErrors.length}${pageErrors.length ? ' → ' + pageErrors.join(' | ') : ' ✅ 无'}`);
await browser.close();
