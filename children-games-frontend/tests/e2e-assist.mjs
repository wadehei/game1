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

// 以儿子(uid=16)登录
await page.goto(`${BASE}/#/profiles`, { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(1000);
await page.evaluate(async () => {
  const res = await fetch('/api/user/login/family', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: 16 }),
  });
  const data = await res.json();
  localStorage.setItem('token', data.data.token);
  localStorage.setItem('userInfo', JSON.stringify(data.data.userInfo));
});

// ═══ 1. 无辅助：时限 90s（关卡通关过一次会降到 0 档以下限制…先清空状态） ═══
await page.evaluate(() => localStorage.removeItem('assist_16_memory'));
await page.goto(`${BASE}/#/memory`, { waitUntil: 'networkidle2' });
await sleep(1800);
const t1 = parseInt(await page.evaluate(() => document.querySelectorAll('.header-item')[1]?.querySelector('.value')?.textContent || '0'), 10);
check(`默认难度时限 ${t1}s（期望 89~90）`, t1 >= 88 && t1 <= 90);

// ═══ 2. 模拟连败：辅助档位 2 → 时限 90 × 1.6 = 144s ═══
await page.evaluate(() => localStorage.setItem('assist_16_memory', JSON.stringify({ assist: 2, streak: 0 })));
// 同 hash 不触发重载，先回大厅再进，确保组件重新挂载
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' });
await sleep(800);
await page.goto(`${BASE}/#/memory`, { waitUntil: 'networkidle2' });
await sleep(1800);
const t2 = parseInt(await page.evaluate(() => document.querySelectorAll('.header-item')[1]?.querySelector('.value')?.textContent || '0'), 10);
check(`辅助 2 档时限 ${t2}s（期望 143~144）`, t2 >= 142 && t2 <= 144);

console.log(`\n页面异常：${pageErrors.length}${pageErrors.length ? ' → ' + pageErrors.join(' | ') : ' ✅ 无'}`);
await browser.close();
