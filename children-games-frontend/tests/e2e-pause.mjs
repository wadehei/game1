// 暂停功能 E2E：8 个游戏逐个 点暂停 → 弹层出现 → 继续 → 弹层消失 → 无异常
import puppeteer from 'puppeteer';
import { BASE } from './helpers.mjs';

const GAMES = [
  { hash: '#/memory', name: '记忆翻牌' },
  { hash: '#/fruit', name: '接水果' },
  { hash: '#/puzzle', name: '拼图' },
  { hash: '#/balloon', name: '打气球' },
  { hash: '#/tank', name: '坦克大战' },
  { hash: '#/mole', name: '打地鼠' },
  { hash: '#/simon', name: '音乐记忆' },
  { hash: '#/math', name: '数学小怪兽' },
];

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(err.message));
const isNoise = (e) => /NetworkError|Failed to fetch|AxiosError|ERR_|401|404/i.test(e);

// 登录态
await page.goto(`${BASE}/#/profiles`, { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(800);
await page.evaluate(async () => {
  if (localStorage.getItem('token')) return;
  const profiles = await (await fetch('/api/user/profiles')).json();
  const login = await fetch('/api/user/login/family', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: (profiles.data || [])[0]?.id }),
  });
  const data = await login.json();
  localStorage.setItem('token', data.data.token);
  localStorage.setItem('userInfo', JSON.stringify(data.data.userInfo));
});

let pass = 0, fail = 0;
for (const g of GAMES) {
  await page.goto(`${BASE}/${g.hash}`, { waitUntil: 'networkidle2' });
  await sleep(1500);

  const hasBtn = !!(await page.$('.pause-btn'));
  if (!hasBtn) {
    console.log(`❌ ${g.name}：没有暂停按钮`);
    fail++;
    continue;
  }

  await page.click('.pause-btn');
  await sleep(500);
  // fixed 定位元素的 offsetParent 恒为 null，用 v-if 挂载判断
  const overlayShown = await page.evaluate(() => !!document.querySelector('.pause-overlay'));

  await page.evaluate(() => {
    [...document.querySelectorAll('.pause-overlay .btn-resume')].find((b) => b.offsetParent !== null)?.click();
  });
  await sleep(500);
  const overlayGone = await page.evaluate(() => !document.querySelector('.pause-overlay'));

  const ok = overlayShown && overlayGone;
  console.log(`${ok ? '✅' : '❌'} ${g.name}：暂停弹层${overlayShown ? '出现' : '未出现'} → 继续后${overlayGone ? '关闭' : '仍显示'}`);
  ok ? pass++ : fail++;
}

// ─── 专项：数学暂停期间计时冻结（成绩=用时，暂停必须公平） ───
await page.goto(`${BASE}/#/math`, { waitUntil: 'networkidle2' });
await sleep(2500); // 等开局引导，计时走起来
const readTimer = () =>
  page.evaluate(() => parseInt(document.querySelector('.timer-bar')?.textContent?.match(/\d+/)?.[0] || '0', 10));
const beforePause = await readTimer();
await page.click('.pause-btn');
await sleep(3000); // 暂停 3 秒
const duringPause = await readTimer();
await page.evaluate(() => {
  [...document.querySelectorAll('.pause-overlay .btn-resume')].find((b) => b.offsetParent !== null)?.click();
});
await sleep(1200);
const afterResume = await readTimer();
const frozenOk = duringPause <= beforePause + 1 && afterResume >= beforePause; // 暂停不涨，恢复后继续走
console.log(`${frozenOk ? '✅' : '❌'} 数学计时冻结：暂停前 ${beforePause}s → 暂停3秒后 ${duringPause}s（应不变）→ 恢复后 ${afterResume}s（继续走）`);
frozenOk ? pass++ : fail++;

const real = pageErrors.filter((e) => !isNoise(e));
console.log(`\n${pass} 通过 / ${fail} 失败 · 页面异常 ${real.length}${real.length ? ' → ' + real.join(' | ') : ' ✅'}`);
await browser.close();
process.exit(fail > 0 || real.length > 0 ? 1 : 0);
