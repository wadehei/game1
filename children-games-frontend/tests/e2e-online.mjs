// 端到端效果验证（后端在线）：登录 → 通关 → 星星/成就/每日任务落库 → 连升两关 → 续关 → 选关
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:8080';
const shot = (name) => `test-results/e2e-${name}.png`;
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(err.message));
const realErrors = () => pageErrors.filter((e) => !/NetworkError|404|500|Request failed|AxiosError|ERR_/i.test(e));
const check = (label, cond) => console.log(`${cond ? '✅' : '❌'} ${label}`);

// 从 DOM 读取卡片动物并按配对点击，直接通关
const winMemoryLevel = async () => {
  await sleep(1200);
  const pairs = await page.evaluate(() => {
    const byAnimal = {};
    document.querySelectorAll('.game-board .card').forEach((card, i) => {
      const src = card.querySelector('.card-image')?.getAttribute('src') || '';
      const animal = src.match(/([a-z]+)\.svg/i)?.[1] || `unknown${i}`;
      (byAnimal[animal] = byAnimal[animal] || []).push(i);
    });
    return Object.values(byAnimal);
  });
  for (const [a, b] of pairs) {
    await page.click(`.game-board .card:nth-child(${a + 1})`);
    await page.click(`.game-board .card:nth-child(${b + 1})`);
    await sleep(500);
  }
  await sleep(1000);
  return page.evaluate(() => ({
    modal: !!document.querySelector('.result-modal'),
    title: document.querySelector('.result-title')?.textContent?.trim(),
  }));
};

// ─── 1. 首页：游客登录 ───
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(2000);
const home1 = await page.evaluate(() => ({
  nickname: document.querySelector('.nickname')?.textContent?.trim(),
  stars: document.querySelector('.star-num')?.textContent?.trim(),
  cards: document.querySelectorAll('.game-card').length,
  daily: document.querySelector('.task-progress')?.textContent?.trim(),
}));
console.log('── 首页 ──');
check(`游客登录「${home1.nickname}」· 等级徽章`, home1.nickname === '小朋友');
check(`游戏卡片 ${home1.cards} 张`, home1.cards === 8);
check(`每日任务 ${home1.daily}`, home1.daily === '0/3');
await page.screenshot({ path: shot('home') });

// ─── 2. 通关第 1 关 ───
await page.goto(`${BASE}/#/memory`, { waitUntil: 'networkidle2' });
const r1 = await winMemoryLevel();
console.log('── 通关第 1 关 ──');
check(`结算弹窗「${r1.title}」`, r1.modal && /恭喜/.test(r1.title));
await sleep(400);
const toast = await page.evaluate(() => document.querySelector('.achievement-toast')?.textContent?.replace(/\s+/g, ' ')?.trim() || '');
check(`成就提示「${toast}」（期望 初次通关）`, /初次通关/.test(toast));
await page.screenshot({ path: shot('toast') });

// ─── 3. 首页落库验证 ───
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' });
await sleep(2000);
const home2 = await page.evaluate(() => ({
  stars: document.querySelector('.star-num')?.textContent?.trim(),
  card1Text: document.querySelector('.game-card .progress-text')?.textContent?.trim(),
  daily: document.querySelector('.task-progress')?.textContent?.trim(),
}));
console.log('── 数据落库 ──');
check(`总星星 ${home2.stars}（期望 ≥1，接口实时刷新）`, parseInt(home2.stars) >= 1);
check(`卡片「${home2.card1Text}」（关卡 1/20 · 最快 2 步）`, home2.card1Text === '关卡 1/20 · 最快 2 步');
check(`每日任务 ${home2.daily}`, home2.daily === '1/3');
await page.screenshot({ path: shot('home-after-lv1') });

// ─── 4. 续关第 1 关 → 下一关 → 通关第 2 关 ───
await page.goto(`${BASE}/#/memory`, { waitUntil: 'networkidle2' });
const resumed = await page.evaluate(() => document.querySelector('.header-item .value')?.textContent?.trim());
console.log('── 连续通关 ──');
check(`续关第 ${resumed} 关（最近通关关，设计行为）`, resumed === '1');
const r2 = await winMemoryLevel();
check(`再通关：${r2.title}`, r2.modal);
await page.click('.btn-next'); // 下一关
await sleep(1500);
const nowLevel = await page.evaluate(() => document.querySelector('.header-item .value')?.textContent?.trim());
check(`推进到第 ${nowLevel} 关`, nowLevel === '2');
const r3 = await winMemoryLevel();
check(`通关第 2 关：${r3.title}`, r3.modal);

// ─── 5. 第 2 关已解锁 ───
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' });
await sleep(2000);
const card1 = await page.evaluate(() => document.querySelector('.game-card .progress-text')?.textContent?.trim());
console.log('── 关卡推进 ──');
check(`卡片「${card1}」（应含 关卡 2/20）`, (card1 || '').startsWith('关卡 2/20'));
await page.goto(`${BASE}/#/memory`, { waitUntil: 'networkidle2' });
await sleep(1500);
await page.click('.value-clickable');
await sleep(400);
const sel = await page.evaluate(() => ({
  hint: document.querySelector('.level-hint')?.textContent?.trim(),
  selected: document.querySelector('.level-num')?.textContent?.trim(),
  plusDisabled: document.querySelector('.level-stepper .step-btn:last-child')?.disabled,
}));
check(`选关范围「${sel.hint}」· 当前 ${sel.selected} · "+"禁用`, /1 ~ 2/.test(sel.hint || '') && sel.selected === '2' && sel.plusDisabled);
await page.screenshot({ path: shot('level-select') });

console.log(`\n页面异常：${realErrors().length}${realErrors().length ? ' → ' + realErrors().join(' | ') : ' ✅ 无'}`);
await browser.close();
