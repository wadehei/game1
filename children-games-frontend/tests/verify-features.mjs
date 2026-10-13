// 定向验证：离线续关 → 选关弹层；家长门禁 → 家长中心面板
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:8080';
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });

let pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(err.message));
const isNetworkNoise = (e) => /NetworkError|Failed to fetch|404|500|502|503|504|Request failed|AxiosError|ERR_CONNECTION/i.test(e);
const realErrors = () => pageErrors.filter((e) => !isNetworkNoise(e));

// ─── 1. 离线缓存续关 + 选关 ───
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' }).catch(() => {});
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('game_progress_memory', JSON.stringify({ level: 5, score: 10, stars: 3 }));
});
// hash 相同不会重载，先回大厅再进入，确保组件重新挂载
await page.goto(`${BASE}/#/memory`, { waitUntil: 'networkidle2' }).catch(() => {});
await new Promise((r) => setTimeout(r, 1500));

const headerLevel = await page.evaluate(() => document.querySelector('.header-item .value')?.textContent?.trim());
console.log(`续关到第 ${headerLevel} 关（期望 5）${headerLevel === '5' ? ' ✅' : ' ❌'}`);

// 点关卡数字 → 弹层 → − 降到 3 → 开始（"+"应禁用：不能超过已解锁关）
await page.click('.value-clickable');
await new Promise((r) => setTimeout(r, 500));
const modalVisible = await page.evaluate(() => !!document.querySelector('.level-modal'));
const plusDisabled = await page.evaluate(() => document.querySelector('.level-stepper .step-btn:last-child')?.disabled);
console.log(`选关弹层出现 ${modalVisible ? ' ✅' : ' ❌'}；"+"按钮禁用（防越级）${plusDisabled ? ' ✅' : ' ❌'}`);
await page.click('.step-btn:first-child'); // −
await page.click('.step-btn:first-child'); // −
await new Promise((r) => setTimeout(r, 200));
const selectedLevel = await page.evaluate(() => document.querySelector('.level-num')?.textContent?.trim());
console.log(`步进到第 ${selectedLevel} 关（期望 3）${selectedLevel === '3' ? ' ✅' : ' ❌'}`);
await page.click('.btn-start');
await new Promise((r) => setTimeout(r, 800));
const cardsAfterJump = await page.evaluate(() => document.querySelectorAll('.game-board .card').length);
console.log(`第 3 关有 ${cardsAfterJump} 张牌（期望 6，pairs=3）${cardsAfterJump === 6 ? ' ✅' : ' ❌'}`);

// ─── 2. 家长门禁 ───
await page.goto(`${BASE}/#/user`, { waitUntil: 'networkidle2' }).catch(() => {});
await new Promise((r) => setTimeout(r, 1200));
const items = await page.$$('.setting-item');
await items[0].click(); // 家长中心
await new Promise((r) => setTimeout(r, 500));
const gateVisible = await page.evaluate(() => !!document.querySelector('.parent-overlay'));
console.log(`家长验证弹层出现 ${gateVisible ? ' ✅' : ' ❌'}`);
const question = await page.evaluate(() => {
  const text = document.querySelector('.parent-question')?.textContent || '';
  const m = text.match(/(\d+)\s*\+\s*(\d+)/);
  return m ? parseInt(m[1]) + parseInt(m[2]) : NaN;
});
await page.type('.parent-input', String(question));
await page.click('.p-btn-confirm');
await new Promise((r) => setTimeout(r, 500));
const panelVisible = await page.evaluate(() => !!document.querySelector('.panel-row'));
const chips = await page.evaluate(() => document.querySelectorAll('.chip').length);
console.log(`家长中心面板出现（护眼间隔选项 ${chips} 个，期望 4）${panelVisible && chips === 4 ? ' ✅' : ' ❌'}`);

const errs = realErrors();
console.log(`页面异常：${errs.length}${errs.length ? ' → ' + errs.join(' | ') : ' ✅'}`);

await browser.close();
