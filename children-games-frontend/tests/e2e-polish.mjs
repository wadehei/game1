// 本轮优化 E2E：音量控制 + 生涯周趋势 + 任务智能引导 + 删用户清理头像文件
import puppeteer from 'puppeteer';
import { BASE, ADMIN_PASSWORD } from './helpers.mjs';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(err.message));
const isNoise = (e) => /NetworkError|Failed to fetch|AxiosError|ERR_|404|401/i.test(e);
const check = (label, cond) => console.log(`${cond ? '✅' : '❌'} ${label}`);
let pass = 0, fail = 0;
const count = (label, cond) => { cond ? pass++ : fail++; };

await page.goto(`${BASE}/#/profiles`, { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(800);
await page.evaluate(async () => {
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

// ═══ 1. 音量：个人中心调到 30% → localStorage 持久 → TTS utterance 读取 ═══
await page.goto(`${BASE}/#/user`, { waitUntil: 'networkidle2' });
await page.reload({ waitUntil: 'networkidle2' });
await sleep(1500);
await page.evaluate(() => {
  const slider = document.querySelector('.volume-slider');
  slider.value = '30';
  slider.dispatchEvent(new Event('input'));
  window.__volAfterSet = localStorage.getItem('games_volume');
});
await sleep(300);
const stored = await page.evaluate(() => ({
  afterSet: window.__volAfterSet,
  now: localStorage.getItem('games_volume'),
}));
check(`音量持久化：设置后 ${stored.afterSet}，当前 ${stored.now}（期望 0.3）`, stored.afterSet === '0.3');

// ═══ 2. 生涯趋势图渲染 ═══
const trend = await page.evaluate(() => ({
  bars: document.querySelectorAll('.trend-col').length,
  fills: [...document.querySelectorAll('.trend-bar')].map((b) => parseInt(b.style.height) || 0),
}));
check(`周趋势图 ${trend.bars} 根柱（期望 7）`, trend.bars === 7);
check(`趋势柱有高度渲染`, trend.fills.some((h) => h > 0) || trend.fills.every((h) => h === 4));

// ═══ 3. 任务智能引导：跳到今天没玩过的游戏 ═══
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' });
await sleep(1200);
const goBtn = await page.evaluate(() => {
  const btn = document.querySelector('.task-go-btn');
  return btn ? btn.textContent.trim() : null;
});
check(`任务引导按钮出现（${goBtn}）`, !!goBtn && /去玩/.test(goBtn));
await page.evaluate(() => document.querySelector('.task-go-btn')?.click());
await sleep(1000);
const jumped = await page.evaluate(() => location.hash);
check(`点击跳转到游戏页（${jumped}）`, /^#\/(memory|fruit|puzzle|balloon|tank|mole|simon|math)$/.test(jumped));

// ═══ 4. 删除用户清理其照片头像文件 ═══
// 上传一张头像到一个临时用户 → 绑定到资料 → 删用户 → 静态服务应 404
const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const uploadAndDelete = await page.evaluate(async (png, pw) => {
  const mk = await (await fetch('/api/user/login/family', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: '清理测试' + Date.now() % 10000, avatar: '🤖' }),
  })).json();
  const token = mk.data.token;
  const uid = mk.data.userInfo.id;
  const admin = await (await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw }),
  })).json();
  const adminToken = admin.data.token;

  const bin = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
  const up = await (await fetch('/api/upload/avatar', {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${adminToken}` },
    body: bin,
  })).json();
  await fetch('/api/user/info', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ avatar: up.data.url }),
  });
  await fetch(`/api/admin/users/${uid}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const res = await fetch(up.data.url);
  return { status: res.status, url: up.data.url };
}, pngB64, ADMIN_PASSWORD);
check(`删除用户后其头像文件已清理（${uploadAndDelete.url} → ${uploadAndDelete.status}）`, uploadAndDelete.status === 404);

const real = pageErrors.filter((e) => !isNoise(e));
console.log(`\n页面异常：${real.length}${real.length ? ' → ' + real.join(' | ') : ' ✅ 无'}`);
await browser.close();
process.exit(fail > 0 || real.length > 0 ? 1 : 0);
