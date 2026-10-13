// 难度自适应 E2E：以儿子身份种辅助档位 → 记忆翻牌时限应放大（90s × 1.6 = 144s）
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:8080';
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(err.message));
const check = (label, cond) => console.log(`${cond ? '✅' : '❌'} ${label}`);

// 以第一个家庭成员登录（uid 动态获取，不依赖具体测试数据）
await page.goto(`${BASE}/#/profiles`, { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(1000);
const loginUid = await page.evaluate(async () => {
  const res = await fetch('/api/user/profiles');
  const profiles = (await res.json()).data;
  const uid = profiles[0]?.id;
  const login = await fetch('/api/user/login/family', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid }),
  });
  const data = await login.json();
  localStorage.setItem('token', data.data.token);
  localStorage.setItem('userInfo', JSON.stringify(data.data.userInfo));
  return uid;
});
check(`已登录成员 uid=${loginUid}`, !!loginUid);

// ═══ 1. 无辅助：读当前关的基础时限 ═══
await page.evaluate((uid) => localStorage.removeItem(`assist_${uid}_memory`), loginUid);
await page.goto(`${BASE}/#/memory`, { waitUntil: 'networkidle2' });
await sleep(1800);
const t1 = parseInt(await page.evaluate(() => document.querySelectorAll('.header-item')[1]?.querySelector('.value')?.textContent || '0'), 10);
check(`当前关基础时限 ${t1}s（含 1 秒倒计时）`, t1 > 10);

// ═══ 2. 模拟连败：辅助档位 2 → 时限 = 基础 × 1.6 ═══
await page.evaluate((uid) => localStorage.setItem(`assist_${uid}_memory`, JSON.stringify({ assist: 2, streak: 0 })), loginUid);
// 同 hash 不触发重载，先回大厅再进，确保组件重新挂载
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' });
await sleep(800);
await page.goto(`${BASE}/#/memory`, { waitUntil: 'networkidle2' });
await sleep(1800);
const t2 = parseInt(await page.evaluate(() => document.querySelectorAll('.header-item')[1]?.querySelector('.value')?.textContent || '0'), 10);
const expected = Math.round((t1 + 1) * 1.6); // 补回倒计时的 1 秒
check(`辅助 2 档时限 ${t2}s（期望 ${expected}s 附近，倍率 1.6）`, Math.abs(t2 - expected) <= 2);

console.log(`\n页面异常：${pageErrors.length}${pageErrors.length ? ' → ' + pageErrors.join(' | ') : ' ✅ 无'}`);
await browser.close();
