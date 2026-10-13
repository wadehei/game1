// 照片头像 E2E：上传 PNG → 保存资料 → 用户信息更新 → 静态服务 200 →
// 选角色页渲染 <img> → 非图片文件被拒 → 还原 emoji
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BASE } from './helpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 生成 64x64 纯色 PNG
const pngFile = path.join(__dirname, '..', 'test-results', 'avatar-test.png');
{
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setContent('<canvas id="c" width="64" height="64"></canvas>');
  const dataUrl = await p.evaluate(() => {
    const c = document.getElementById('c');
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#5b8def';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    ctx.arc(32, 32, 16, 0, Math.PI * 2);
    ctx.fill();
    return c.toDataURL('image/png');
  });
  fs.mkdirSync(path.dirname(pngFile), { recursive: true });
  fs.writeFileSync(pngFile, Buffer.from(dataUrl.split(',')[1], 'base64'));
  await browser.close();
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const apiCalls = [];
page.on('request', (req) => {
  if (req.url().includes('/api/user/info')) {
    apiCalls.push(`${req.method()} ${req.url().slice(-20)} body=${(req.postData() || '').slice(0, 80)}`);
  }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(err.message));
const isNoise = (e) => /NetworkError|Failed to fetch|AxiosError|ERR_|404/i.test(e);
const check = (label, cond) => console.log(`${cond ? '✅' : '❌'} ${label}`);

await page.goto(`${BASE}/#/profiles`, { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(800);
const originalAvatar = await page.evaluate(async () => {
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
  return data.data.userInfo.avatar;
});
check(`已登录（原头像：${originalAvatar}）`, !!originalAvatar || originalAvatar === '');

// ═══ 1. 个人中心上传照片 ═══
// 裸 fetch 登录只写了 localStorage；store 单例在旧页面已创建（userInfo 为空），
// reload 让 Pinia 重建后读到 userInfo
await page.goto(`${BASE}/#/user`, { waitUntil: 'networkidle2' });
await page.reload({ waitUntil: 'networkidle2' });
await sleep(1200);
const input = await page.$('.me-photo-btn input[type="file"]');
await input.uploadFile(pngFile);
await sleep(1500);
const tip = await page.evaluate(() => document.querySelector('.upload-tip')?.textContent || '');
check(`上传提示出现（${tip}）`, /已上传/.test(tip));

// ═══ 2. 保存资料 ═══
const btnState = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.save-profile-btn')].find((b) => b.textContent.includes('保存资料'));
  const input = document.querySelector('.edit-input');
  return btn ? { disabled: btn.disabled, text: btn.textContent.trim(), nickname: input?.value ?? '无输入框' } : null;
});
console.log('按钮状态:', JSON.stringify(btnState));
await page.evaluate(() => {
  [...document.querySelectorAll('.save-profile-btn')].find((b) => b.textContent.includes('保存资料'))?.click();
});
await sleep(1500);
console.log('期间 API 请求:', apiCalls.length ? apiCalls.join(' | ') : '（无 /user/info 请求）');
const info = await page.evaluate(async () => {
  const res = await fetch('/api/user/info', {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });
  return (await res.json()).data;
});
check(`资料已更新为照片头像（${info.avatar}）`, /^\/api\/avatars\//.test(info.avatar || ''));

// ═══ 3. 静态服务 ═══
const served = await page.evaluate(async (url) => {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  return { status: res.status, type: res.headers.get('content-type'), size: buf.byteLength };
}, info.avatar);
check(`头像静态服务 200（${served.type}，${served.size} 字节）`, served.status === 200 && served.type.startsWith('image/') && served.size > 0);
await page.screenshot({ path: 'test-results/avatar-uploaded.png' });

// ═══ 4. 选角色页渲染 <img> ═══
await page.goto(`${BASE}/#/profiles`, { waitUntil: 'networkidle2' });
await sleep(1200);
const imgRendered = await page.evaluate((url) =>
  !!document.querySelector(`.profile-card img[src^="${url.slice(0, url.lastIndexOf('/'))}"]`)
, info.avatar);
check('选角色页照片头像渲染为 <img>', imgRendered);

// ═══ 5. 非图片文件被拒（伪装 content-type） ═══
const rejected = await page.evaluate(async () => {
  const res = await fetch('/api/upload/avatar', {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: 'this is not an image at all',
  });
  return res.status;
});
check('伪装图片的文本被拒（400）', rejected === 400);

// ═══ 6. 还原头像 ═══
await page.evaluate(async (avatar) => {
  await fetch('/api/user/info', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
    body: JSON.stringify({ avatar }),
  });
}, originalAvatar || '😊');
check('头像已还原', true);

const real = pageErrors.filter((e) => !isNoise(e));
console.log(`\n页面异常：${real.length}${real.length ? ' → ' + real.join(' | ') : ' ✅ 无'}`);
await browser.close();
process.exit(real.length > 0 ? 1 : 0);
