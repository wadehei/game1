// 账号体系 E2E：创建角色 → 设口令 → 无/错口令被拒 → 对错锁标 → 正确口令通过 →
// 防爆破锁定 → 管理员清除口令 → 免口令登录 → 清理
import puppeteer from 'puppeteer';
import { BASE, ADMIN_PASSWORD } from './helpers.mjs';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(err.message));
const isNoise = (e) => /NetworkError|Failed to fetch|AxiosError|ERR_|404/i.test(e);
const check = (label, cond) => console.log(`${cond ? '✅' : '❌'} ${label}`);

await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
await sleep(800);
const ctx = await page.evaluate(async (pw) => {
  // 建一个测试角色并登录
  const created = await (await fetch('/api/user/login/family', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: '账号测试', avatar: '🤖' }),
  })).json();
  const admin = await (await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw }),
  })).json();
  return { uid: created.data.userInfo.id, token: created.data.token, adminToken: admin.data.token };
}, ADMIN_PASSWORD);
const api = (path, opts = {}) =>
  page.evaluate(async ({ path, opts }) => {
    const res = await fetch(path, opts);
    return { status: res.status, body: await res.json() };
  }, { path, opts });
const loginAs = (body) =>
  api('/api/user/login/family', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

check(`测试角色已创建（uid=${ctx.uid}）`, !!ctx.uid);

// ═══ 1. 设置口令 1234 ═══
{
  const r = await api('/api/user/pin', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ctx.token}` },
    body: JSON.stringify({ newPin: '1234' }),
  });
  check('设置口令成功', r.status === 200 && r.body.data.hasPin === true);
}

// ═══ 2. 无口令登录被拒 ═══
{
  const r = await loginAs({ uid: ctx.uid });
  check('无口令登录被拒（401）', r.status === 401);
}

// ═══ 3. 错误口令被拒 ═══
{
  const r = await loginAs({ uid: ctx.uid, pin: '9999' });
  check('错误口令被拒（401）', r.status === 401);
}

// ═══ 4. 成员列表带锁标 ═══
{
  const r = await api('/api/user/profiles');
  const me = (r.body.data || []).find((p) => p.id === ctx.uid);
  check('成员列表标记 hasPin', !!me?.hasPin);
}

// ═══ 5. 正确口令通过 ═══
{
  const r = await loginAs({ uid: ctx.uid, pin: '1234' });
  check('正确口令登录成功', r.status === 200);
}

// ═══ 6. 防爆破：连错 5 次后锁定 ═══
{
  for (let i = 0; i < 5; i++) {
    await loginAs({ uid: ctx.uid, pin: '0000' });
  }
  const r = await loginAs({ uid: ctx.uid, pin: '1234' });
  check(`连错 5 次后锁定（即使口令正确也 429，实际 ${r.status}）`, r.status === 429);
}

// ═══ 7. 管理员清除口令 → 免口令可登录 ═══
{
  const r = await api(`/api/admin/users/${ctx.uid}/clear-pin`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ctx.adminToken}` },
  });
  check('管理员清除口令成功', r.status === 200);
  const login = await loginAs({ uid: ctx.uid });
  check('清除后免口令登录成功', login.status === 200);
}

// ═══ 8. 修改口令需旧口令 ═══
{
  await api('/api/user/pin', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ctx.token}` },
    body: JSON.stringify({ newPin: '4321' }),
  });
  const wrongOld = await api('/api/user/pin', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ctx.token}` },
    body: JSON.stringify({ oldPin: '0000', newPin: '8888' }),
  });
  check('已设口令后，修改必须提供正确旧口令（错旧口令被拒）', wrongOld.status === 401);
  const rightOld = await api('/api/user/pin', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ctx.token}` },
    body: JSON.stringify({ oldPin: '4321', newPin: '' }),
  });
  check('旧口令正确时可清除口令', rightOld.status === 200 && rightOld.body.data.hasPin === false);
}

// ═══ 9. UI：选角色页锁标 + PIN 键盘（用全新角色，避开上面的防爆破锁） ═══
const ui = await page.evaluate(async () => {
  const created = await (await fetch('/api/user/login/family', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: '键盘测试', avatar: '🐯' }),
  })).json();
  const uid = created.data.userInfo.id;
  await fetch('/api/user/pin', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${created.data.token}` },
    body: JSON.stringify({ newPin: '2468' }),
  });
  return { uid };
});
// 页面此前已停在 /profiles（旧列表），同 URL goto 不会重载——强制刷新拉取新列表
await page.reload({ waitUntil: 'networkidle2' });
await sleep(1200);
await page.evaluate((name) => {
  [...document.querySelectorAll('.profile-card:not(.create-card)')]
    .find((c) => c.querySelector('.profile-name')?.textContent?.trim() === name)
    ?.click();
}, '键盘测试');
await sleep(500);
const padVisible = await page.evaluate(() => !!document.querySelector('.pin-pad'));
check('点击锁定角色弹出 PIN 键盘', padVisible);
await page.screenshot({ path: 'test-results/pin-pad.png' });
// 输错 → 提示；输对 → 进入大厅
for (const d of ['1', '1', '1', '1']) {
  await page.evaluate((digit) => {
    [...document.querySelectorAll('.key')].find((k) => k.textContent.trim() === digit)?.click();
  }, d);
}
await sleep(800);
const wrongTip = await page.evaluate(() => document.querySelector('.pin-error')?.textContent || '');
check(`输错口令有提示（${wrongTip}）`, /口令/.test(wrongTip));
for (const d of ['2', '4', '6', '8']) {
  await page.evaluate((digit) => {
    [...document.querySelectorAll('.key')].find((k) => k.textContent.trim() === digit)?.click();
  }, d);
}
await sleep(1200);
const enteredHome = await page.evaluate(() => !!document.querySelector('.game-card'));
check('正确口令进入大厅', enteredHome);

// ═══ 10. 清理测试角色 ═══
{
  const r = await api(`/api/admin/users/${ui.uid}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${ctx.adminToken}` },
  });
  check('UI 测试角色已清理', r.status === 200);
}
{
  const r = await api(`/api/admin/users/${ctx.uid}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${ctx.adminToken}` },
  });
  check('测试角色已清理', r.status === 200);
}

const real = pageErrors.filter((e) => !isNoise(e));
console.log(`\n页面异常：${real.length}${real.length ? ' → ' + real.join(' | ') : ' ✅ 无'}`);
await browser.close();
process.exit(real.length > 0 ? 1 : 0);
