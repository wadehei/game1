// 生涯功能 E2E：接口结构 → 局数上报累加 → UI 生涯总览/游戏卡渲染
import puppeteer from 'puppeteer';
import { BASE } from './helpers.mjs';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(err.message));
const isNoise = (e) => /NetworkError|Failed to fetch|AxiosError|ERR_|404/i.test(e);
const check = (label, cond) => console.log(`${cond ? '✅' : '❌'} ${label}`);

await page.goto(`${BASE}/#/profiles`, { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(800);
await page.evaluate(async () => {
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
});

const career = await page.evaluate(async () =>
  (await (await fetch('/api/user/career', {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  })).json()).data
);
check(`生涯返回用户信息（${career.user.nickname}，Lv.${career.user.level}）`, !!career.user?.nickname);
check(`生涯汇总字段齐全（局数${career.totals.playCount} 胜${career.totals.winCount} 时长${career.totals.playSeconds}s 天数${career.totals.playDays}）`,
  typeof career.totals?.playCount === 'number' && typeof career.totals?.playSeconds === 'number');
check(`游戏生涯 ${career.games.length} 条（含局数字段）`, career.games.length > 0 && career.games.every((g) => typeof g.playCount === 'number'));

// 上报一局失败 → 该游戏 playCount +1
const target = career.games[0];
await page.evaluate(async (gameId) => {
  await fetch(`/api/user/play/${gameId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });
}, target.gameId);
const after = await page.evaluate(async () =>
  (await (await fetch('/api/user/career', {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  })).json()).data
);
const afterGame = after.games.find((g) => g.gameId === target.gameId);
check(`失败局上报：${target.gameId} 局数 ${target.playCount} → ${afterGame.playCount}（+1，胜局不变 ${afterGame.winCount}）`,
  afterGame.playCount === target.playCount + 1 && afterGame.winCount === target.winCount);

// UI 渲染
await page.goto(`${BASE}/#/user`, { waitUntil: 'networkidle2' });
await page.reload({ waitUntil: 'networkidle2' });
await sleep(1500);
const ui = await page.evaluate(() => ({
  overview: document.querySelectorAll('.ov-item').length,
  rows: document.querySelectorAll('.career-row').length,
  firstRow: document.querySelector('.career-row')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 90),
}));
check(`生涯总览 ${ui.overview} 项（期望 6）`, ui.overview === 6);
check(`游戏生涯卡 ${ui.rows} 张`, ui.rows >= 1);
console.log(`  首卡：${ui.firstRow}`);
await page.screenshot({ path: 'test-results/career.png', fullPage: true });

const real = pageErrors.filter((e) => !isNoise(e));
console.log(`\n页面异常：${real.length}${real.length ? ' → ' + real.join(' | ') : ' ✅ 无'}`);
await browser.close();
process.exit(real.length > 0 ? 1 : 0);
