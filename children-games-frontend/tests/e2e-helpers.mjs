// E2E 测试公共函数库
import puppeteer from 'puppeteer';
import { BASE, ADMIN_PASSWORD } from './helpers.mjs';
import { VIEWPORTS, WAIT_TIMES, NOISE_PATTERNS, TIMEOUTS } from './constants.mjs';

export { BASE, ADMIN_PASSWORD, VIEWPORTS, WAIT_TIMES, NOISE_PATTERNS, TIMEOUTS };

// ─── 等待函数 ─────────────────────────────────────────

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── 浏览器初始化 ─────────────────────────────────────

export async function createBrowser(viewport = VIEWPORTS.MOBILE) {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  return { browser, page };
}

// ─── 错误收集 ─────────────────────────────────────────

export function setupErrorCollector(page, noisePattern = NOISE_PATTERNS) {
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  const isNoise = (msg) => noisePattern.test(msg);
  const realErrors = () => pageErrors.filter((e) => !isNoise(e));

  return { pageErrors, isNoise, realErrors };
}

// ─── 检查器 ───────────────────────────────────────────

export function createChecker() {
  let pass = 0;
  let fail = 0;

  return {
    check: (label, cond) => {
      cond ? pass++ : fail++;
      console.log(`${cond ? '✅' : '❌'} ${label}`);
      return cond;
    },
    summary: () => {
      console.log(`\n${pass} 通过 / ${fail} 失败`);
      return { pass, fail };
    },
    pass,
    fail,
  };
}

// ─── 导航 ─────────────────────────────────────────────

export async function navigateTo(page, path, waitMs = WAIT_TIMES.MEDIUM) {
  await page.goto(`${BASE}${path}`, {
    waitUntil: 'networkidle2',
    timeout: TIMEOUTS.NAVIGATION,
  });
  await sleep(waitMs);
}

// ─── 用户登录 ─────────────────────────────────────────

export async function loginAsUser(page, uid = null) {
  return page.evaluate(async (targetUid) => {
    const res = await fetch('/api/user/profiles');
    const profiles = (await res.json()).data;
    const uid = targetUid || profiles[0]?.id;
    const login = await fetch('/api/user/login/family', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid }),
    });
    const data = await login.json();
    localStorage.setItem('token', data.data.token);
    localStorage.setItem('userInfo', JSON.stringify(data.data.userInfo));
    return uid;
  }, uid);
}

export async function loginAsAdmin(page, password = ADMIN_PASSWORD) {
  return page.evaluate(async (pw) => {
    const admin = await (
      await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
    ).json();
    localStorage.setItem('admin_token', admin.data.token);
    return admin.data.token;
  }, password);
}

// ─── API 封装 ─────────────────────────────────────────

export function createApiHelper(page) {
  return (path, opts = {}) =>
    page.evaluate(
      async ({ path, opts }) => {
        const res = await fetch(path, opts);
        return { status: res.status, body: await res.json() };
      },
      { path, opts }
    );
}

export function createAdminApiHelper(page) {
  return async (path, opts = {}) => {
    const token = await page.evaluate(() => localStorage.getItem('admin_token'));
    return page.evaluate(
      async ({ path, opts, token }) => {
        const res = await fetch(path, {
          ...opts,
          headers: {
            ...opts.headers,
            Authorization: `Bearer ${token}`,
          },
        });
        return { status: res.status, body: await res.json().catch(() => null) };
      },
      { path, opts, token }
    );
  };
}

// ─── 创建/删除测试用户 ───────────────────────────────

export async function createTestUser(page, nickname, avatar, pin = null) {
  return page.evaluate(async ({ nickname, avatar, pin }) => {
    const login = await (
      await fetch('/api/user/login/family', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, avatar }),
      })
    ).json();
    const uid = login.data.userInfo.id;
    const token = login.data.token;
    if (pin) {
      await fetch('/api/user/pin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPin: pin }),
      });
    }
    return { uid, token };
  }, { nickname, avatar, pin });
}

export async function deleteTestUser(page, uid, adminToken) {
  return page.evaluate(async ({ uid, adminToken }) => {
    await fetch(`/api/admin/users/${uid}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  }, { uid, adminToken });
}

// ─── 截图辅助 ─────────────────────────────────────────

export const shot = (name) => `test-results/e2e-${name}.png`;

// ─── 等待元素 ─────────────────────────────────────────

export async function waitForSelector(page, selector, timeout = TIMEOUTS.ELEMENT) {
  return page.waitForSelector(selector, { timeout });
}

export async function waitForVisible(page, selector, timeout = TIMEOUTS.ELEMENT) {
  await page.waitForSelector(selector, { visible: true, timeout });
}

// ─── 等待 WebSocket 连接 ─────────────────────────────

export async function waitForWsConnection(page, timeout = TIMEOUTS.WS_CONNECT) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const connected = await page.evaluate(() => {
      return !!document.querySelector('[data-ws-connected="true"]');
    });
    if (connected) return true;
    await sleep(100);
  }
  return false;
}

// ─── 结束测试 ─────────────────────────────────────────

export async function cleanup(browser, pageErrors, isNoise = NOISE_PATTERNS.test.bind(NOISE_PATTERNS)) {
  const real = pageErrors.filter((e) => !isNoise(e));
  console.log(
    `\n页面异常：${real.length}${real.length ? ' → ' + real.join(' | ') : ' ✅ 无'}`
  );
  await browser.close();
  process.exit(real.length > 0 ? 1 : 0);
}

// ─── localStorage 操作 ───────────────────────────────

export async function getLocalStorage(page, key) {
  return page.evaluate((key) => localStorage.getItem(key), key);
}

export async function setLocalStorage(page, key, value) {
  return page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key, value }
  );
}

export async function removeLocalStorage(page, key) {
  return page.evaluate((key) => localStorage.removeItem(key), key);
}

// ─── 执行 JavaScript ─────────────────────────────────

export async function evaluate(page, fn, ...args) {
  return page.evaluate(fn, ...args);
}
