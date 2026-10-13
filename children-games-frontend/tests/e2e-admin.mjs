// 管理后台 E2E：密码登录 → 看板 → 角色编辑 → 护眼策略 → 备份 → 双端截图
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:8080';
const PASSWORD = 'family-admin-2026';
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(err.message));
const check = (label, cond) => console.log(`${cond ? '✅' : '❌'} ${label}`);

// ═══ 1. 未登录访问 /admin → 跳登录页 ═══
await page.goto(`${BASE}/#/admin`, { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(1000);
check('未登录跳到管理员登录页', !!(await page.$('.login-card')));

// ═══ 2. 错误密码 ═══
await page.type('.login-input', 'wrong-password');
await page.click('.login-btn');
await sleep(800);
check('错误密码提示报错', !!(await page.$('.login-error')));

// ═══ 3. 正确密码 → 看板 ═══
await page.evaluate(() => {
  const input = document.querySelector('.login-input');
  input.value = '';
});
await page.type('.login-input', PASSWORD);
await page.click('.login-btn');
await sleep(1500);
{
  const stats = await page.evaluate(() =>
    [...document.querySelectorAll('.stat-card')].map((c) => c.textContent.trim().replace(/\s+/g, ' '))
  );
  check(`看板加载，指标卡 ${stats.length} 张（期望 4）`, stats.length === 4);
  check('成员星星条已渲染', (await page.$$('.bar-row')).length >= 1);
  check('最近动态已渲染', (await page.$$('.activity-row')).length >= 1);
  await page.screenshot({ path: 'test-results/admin-pc-dashboard.png' });
}

// ═══ 4. 角色管理：编辑后还原 ═══
await page.click('.nav-item:nth-child(2)');
await sleep(1000);
const before = await page.evaluate(() => document.querySelector('.member-name')?.childNodes[0]?.textContent?.trim());
check(`角色列表加载（首个：${before}）`, !!before);
// 编辑第一个成员：加个标记再还原
await page.click('.member-card .act-btn'); // 编辑
await sleep(300);
await page.evaluate(() => {
  const input = document.querySelector('.edit-input');
  input.value = '';
});
await page.type('.edit-input', '临时名');
await page.click('.act-btn.save');
await sleep(1000);
const renamed = await page.evaluate(() => document.querySelector('.member-name')?.childNodes[0]?.textContent?.trim());
check(`改名生效（→ ${renamed}）`, renamed === '临时名');
await page.click('.member-card .act-btn'); // 再编辑
await sleep(300);
await page.evaluate(() => {
  const input = document.querySelector('.edit-input');
  input.value = '';
});
await page.type('.edit-input', before);
await page.click('.act-btn.save');
await sleep(1000);
const restored = await page.evaluate(() => document.querySelector('.member-name')?.childNodes[0]?.textContent?.trim());
check(`名字已还原（${restored}）`, restored === before);
await page.screenshot({ path: 'test-results/admin-pc-members.png' });

// ═══ 5. 护眼策略：改 15 分钟 → 验证公开接口 → 改回 20 ═══
await page.click('.nav-item:nth-child(3)');
await sleep(800);
await page.evaluate(() => {
  [...document.querySelectorAll('.chip')].find((c) => c.textContent.includes('15 分钟'))?.click();
});
await page.click('.save-btn');
await sleep(800);
const pub = await (await fetch(`${BASE}/api/settings/public`)).json();
check(`策略已保存（公开接口返回 ${pub.data.restIntervalMinutes} 分钟，期望 15）`, pub.data.restIntervalMinutes === 15);
await page.evaluate(() => {
  [...document.querySelectorAll('.chip')].find((c) => c.textContent.includes('20 分钟'))?.click();
});
await page.click('.save-btn');
await sleep(800);

// ═══ 6. 备份下载（验证接口 200 + 内容是 SQL） ═══
const backupOk = await page.evaluate(async () => {
  const res = await fetch('/api/admin/backup', {
    headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
  });
  const text = await res.text();
  return res.status === 200 && text.includes('INSERT INTO') && text.includes('-- 儿童游戏乐园 数据备份');
});
check('备份导出为有效 SQL', backupOk);

// ═══ 7. 手机端截图 ═══
await page.setViewport({ width: 390, height: 844 });
await page.goto(`${BASE}/#/admin`, { waitUntil: 'networkidle2' });
await sleep(1200);
await page.screenshot({ path: 'test-results/admin-mobile.png' });

console.log(`\n页面异常：${pageErrors.length}${pageErrors.length ? ' → ' + pageErrors.join(' | ') : ' ✅ 无'}`);
await browser.close();
