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

// ═══ 0. 准备：登录儿子 + 管理员 token ═══
await page.evaluate(async () => {
  const res = await fetch('/api/user/login/family', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: 16 }),
  });
  const data = await res.json();
  localStorage.setItem('token', data.data.token);
  localStorage.setItem('userInfo', JSON.stringify(data.data.userInfo));

  const admin = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'family-admin-2026' }),
  });
  const adminData = await admin.json();
  localStorage.setItem('admin_token', adminData.data.token);
});

// ═══ 1. 触发一个客户端错误（异步 throw → window error 事件） ═══
await page.evaluate(() => {
  setTimeout(() => {
    // eslint-disable-next-line no-undef
    throw new Error('E2E测试错误：这是一条故意制造的日志');
  }, 0);
});
await sleep(3000); // 等 2s 刷盘 + 上报

// ═══ 2. 后端日志接口应有这条 ═══
const logs = await page.evaluate(async () => {
  const res = await fetch('/api/admin/logs?limit=50', {
    headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
  });
  return (await res.json()).data;
});
const found = (logs || []).find((l) => l.message?.includes('E2E测试错误'));
check(`客户端错误已落盘（日志共 ${logs?.length || 0} 条，找到测试错误）`, !!found);
check(`来源标记为客户端（实际：${found?.source}）`, found?.source === 'client');

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

// ═══ 4. 清空 ═══
await page.evaluate(() => {
  window.confirm = () => true;
});
await page.evaluate(() => {
  [...document.querySelectorAll('.act-btn')].find((b) => b.textContent.includes('清空'))?.click();
});
await sleep(1000);
const afterClear = await page.evaluate(async () => {
  const res = await fetch('/api/admin/logs', {
    headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
  });
  return (await res.json()).data.length;
});
check(`清空后日志为 0 条（实际 ${afterClear}）`, afterClear === 0);

console.log(`\n页面异常：${pageErrors.length}${pageErrors.length ? ' → ' + pageErrors.join(' | ') : ' ✅ 无'}`);
await browser.close();
