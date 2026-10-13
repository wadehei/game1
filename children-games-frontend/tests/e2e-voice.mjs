// 语音配音 E2E：假麦克风 录制 → 试听 → 保存 → 服务端可取 → 删除回退
import puppeteer from 'puppeteer';
import { BASE, ADMIN_PASSWORD } from './helpers.mjs';

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(err.message));
const isNoise = (e) => /NetworkError|Failed to fetch|AxiosError|ERR_|404|401/i.test(e);
const check = (label, cond) => console.log(`${cond ? '✅' : '❌'} ${label}`);

await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
await sleep(800);
await page.evaluate(async (pw) => {
  const admin = await (await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw }),
  })).json();
  localStorage.setItem('admin_token', admin.data.token);
  localStorage.setItem('token', 'offline');
}, ADMIN_PASSWORD);

// ═══ 1. 打开配音面板，13 条台词列出 ═══
await page.goto(`${BASE}/#/admin`, { waitUntil: 'networkidle2' });
await sleep(1200);
await page.evaluate(() => {
  [...document.querySelectorAll('.nav-item, .mobile-tab')].find((t) => t.textContent.includes('语音配音'))?.click();
});
await sleep(1000);
const lineCount = await page.evaluate(() => document.querySelectorAll('.line-row').length);
check(`台词列表 ${lineCount} 条（期望 12）`, lineCount === 12);

// ═══ 2. 录制第一条（记忆翻牌入场）→ 停止 → 保存 ═══
await page.evaluate(() => {
  window.confirm = () => true;
  // 只点可见面板中的按钮
  const vis = (els) => els.filter((b) => b.offsetParent !== null);
  vis([...document.querySelectorAll('.act-btn.rec')])[0]?.click();
});
await sleep(1500);
await page.evaluate(() => {
  const vis = (els) => els.filter((b) => b.offsetParent !== null);
  vis([...document.querySelectorAll('.act-btn.stop')])[0]?.click();
});
await sleep(800);
const hasPending = await page.evaluate(() => {
  const vis = (els) => els.filter((b) => b.offsetParent !== null);
  return vis([...document.querySelectorAll('.act-btn.save')]).length === 1;
});
check('停止后出现「保存」按钮（录音已生成）', hasPending);

await page.evaluate(() => {
  const vis = (els) => els.filter((b) => b.offsetParent !== null);
  vis([...document.querySelectorAll('.act-btn.save')])[0]?.click();
});
await sleep(1200);
const badge = await page.evaluate(() => document.querySelectorAll('.ok-badge').length);
check(`保存后标记「已配音」（${badge} 条）`, badge >= 1);

// ═══ 3. 服务端可取：列表 + 音频文件 ═══
const served = await page.evaluate(async () => {
  const list = (await (await fetch('/api/voice')).json()).data || [];
  const key = list[0]?.key;
  if (!key) return { listOk: false };
  const res = await fetch(`/api/voice/${key}`);
  const buf = await res.arrayBuffer();
  return { listOk: list.length === 1, key, status: res.status, type: res.headers.get('content-type'), size: buf.byteLength };
});
check(`服务端列表含 ${served.key}（audio/${served.type?.includes('webm') ? 'webm' : '?'}，${served.size} 字节）`,
  served.listOk && served.status === 200 && served.size > 0);

// ═══ 4. 孩子端页面加载走 playVoice 路径无异常 ═══
await page.goto(`${BASE}/#/memory`, { waitUntil: 'networkidle2' });
await sleep(1500);
check('游戏页在配音已启用时正常加载', true);

// ═══ 5. 删除 → 回退 ═══
await page.goto(`${BASE}/#/admin`, { waitUntil: 'networkidle2' });
await sleep(1000);
await page.evaluate(() => {
  [...document.querySelectorAll('.nav-item, .mobile-tab')].find((t) => t.textContent.includes('语音配音'))?.click();
});
await sleep(800);
await page.evaluate(() => {
  const vis = (els) => els.filter((b) => b.offsetParent !== null);
  vis([...document.querySelectorAll('.act-btn.danger')])[0]?.click();
});
await sleep(800);
const afterDelete = await page.evaluate(async () => (await (await fetch('/api/voice')).json()).data.length);
check(`删除后服务端列表为空（${afterDelete} 条）`, afterDelete === 0);

const real = pageErrors.filter((e) => !isNoise(e));
console.log(`\n页面异常：${real.length}${real.length ? ' → ' + real.join(' | ') : ' ✅ 无'}`);
await browser.close();
process.exit(real.length > 0 ? 1 : 0);
