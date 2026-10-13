// 记住我 E2E：无口令角色 token 失效后自动重登恢复；口令角色去选角色页；坏档案引导重选
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

await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
await sleep(800);

// 准备：创建两个干净角色（甲：无口令；乙：有口令）+ 管理员 token（唯一命名，可重复运行）
const RUN = String(Date.now()).slice(-6);
const ctx = await page.evaluate(async ({ pw, run }) => {
  const mk = async (nickname, avatar, pin) => {
    const login = await (await fetch('/api/user/login/family', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, avatar }),
    })).json();
    const uid = login.data.userInfo.id;
    const token = login.data.token;
    if (pin) {
      await fetch('/api/user/pin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPin: pin }),
      });
    }
    const admin = await (await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    })).json();
    return { uid, token, adminToken: admin.data.token };
  };
  const jia = await mk('甲测试' + run, '🐰', null);
  const yi = await mk('乙测试' + run, '🐼', '2468');
  return { jia, yi, adminToken: jia.adminToken, run };
}, { pw: ADMIN_PASSWORD, run: RUN });

// ═══ 1. 无口令角色：清掉凭证后访问首页 → 自动静默重登（无需手选） ═══
await page.evaluate((r) => {
  window.__RUN = r;
}, RUN);
await page.evaluate((uid) => {
  localStorage.setItem('last_profile_id', String(uid));
  localStorage.removeItem('token');
  localStorage.removeItem('userInfo');
}, ctx.jia.uid);
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' });
await sleep(1800);
{
  const state = await page.evaluate(() => ({
    hasToken: !!localStorage.getItem('token'),
    nickname: localStorage.getItem('userInfo') ? JSON.parse(localStorage.getItem('userInfo')).nickname : null,
    gameCards: document.querySelectorAll('.game-card').length,
  }));
  check(`无口令角色无感恢复：自动重登为「${state.nickname}」`, state.hasToken && state.nickname === '甲测试' + RUN && state.gameCards === 8);
}

// ═══ 2. 口令角色：清掉凭证后 → 选角色页（带锁标，不会静默绕过） ═══
await page.evaluate((uid) => {
  localStorage.setItem('last_profile_id', String(uid));
  localStorage.removeItem('token');
  localStorage.removeItem('userInfo');
}, ctx.yi.uid);
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' });
await sleep(1500);
{
  const onProfiles = await page.evaluate(() => !!document.querySelector('.profiles-page'));
  const yiCard = await page.evaluate((uid) => {
    const card = [...document.querySelectorAll('.profile-card')].find((c) =>
      c.querySelector('.profile-name')?.textContent?.trim() === '乙测试' + window.__RUN
    );
    return card ? { lock: !!card.querySelector('.lock-badge'), last: !!card.querySelector('.last-used-badge') } : null;
  }, ctx.yi.uid);
  check('口令角色被引导到选角色页（不会被静默绕过）', onProfiles);
  check(`乙测试卡片带 🔒 与「上次是你」标记`, yiCard?.lock && yiCard?.last);
  await page.screenshot({ path: 'test-results/profiles-last-used.png' });
}

// ═══ 3. 坏档案（角色已被删除的凭证）→ 首页自动清档案并引导重选 ═══
await page.evaluate(({ uid, token }) => {
  localStorage.setItem('last_profile_id', String(uid));
  localStorage.setItem('token', token);
  localStorage.setItem('userInfo', JSON.stringify({ id: uid, nickname: '甲测试' }));
}, { uid: ctx.jia.uid, token: ctx.jia.token });
const deleteResult = await page.evaluate(async (adminToken, uid) => {
  const res = await fetch(`/api/admin/users/${uid}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  return { status: res.status, body: (await res.text()).slice(0, 100) };
}, ctx.adminToken, ctx.jia.uid);
console.log('  DELETE 响应:', JSON.stringify(deleteResult));
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' });
await sleep(1500);
{
  const state = await page.evaluate(() => ({
    onProfiles: !!document.querySelector('.profiles-page'),
    onHome: !!document.querySelector('.home-page'),
    tokenCleared: !localStorage.getItem('token'),
    url: location.hash,
    nickname: document.querySelector('.nickname')?.textContent?.trim() || null,
  }));
  console.log('  坏档案状态:', JSON.stringify(state));
  check('坏档案（角色已删除）自动清凭证并引导重选', state.onProfiles && state.tokenCleared);
}

// ═══ 4. 清理 ═══
await page.evaluate(async (adminToken, uid) => {
  await fetch(`/api/admin/users/${uid}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
}, ctx.adminToken, ctx.yi.uid);
const real = pageErrors.filter((e) => !isNoise2(e));
function isNoise2(e) { return /NetworkError|Failed to fetch|AxiosError|ERR_|404|401/i.test(e); }
console.log(`\n页面异常：${real.length}${real.length ? ' → ' + real.join(' | ') : ' ✅ 无'}`);
await browser.close();
process.exit(real.length > 0 ? 1 : 0);
