// 拼图切片对齐验证：图片宽 = 格宽×gridSize、位移 = -列×格宽（百分比定位与实际像素解耦）
import puppeteer from 'puppeteer';
import { BASE } from './helpers.mjs';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (label, cond) => console.log(`${cond ? '✅' : '❌'} ${label}`);

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
});
await page.goto(`${BASE}/#/puzzle`, { waitUntil: 'networkidle2' });
await sleep(1800);

const info = await page.evaluate(() => {
  const pieces = [...document.querySelectorAll('.puzzle-piece')];
  const gridSize = Math.round(Math.sqrt(pieces.length));
  const cell = pieces[0].getBoundingClientRect();
  // 找一个 correctPosition 在第 1 列的可见切片（correctPos%gridSize===1）
  const imgs = [...document.querySelectorAll('.piece-image')];
  const first = imgs[0];
  const imgRect = first.getBoundingClientRect();
  const styleWidth = first.style.width;
  // 用第一块（correctPosition 0，窗口应在原点）与某块的 transform 矩阵核对
  const m = new DOMMatrixReadOnly(getComputedStyle(first).transform);
  return {
    gridSize,
    cellW: cell.width,
    cellH: cell.height,
    imgW: imgRect.width,
    styleWidth,
    tx: m.m41,
    ty: m.m42,
    pieces: pieces.length,
  };
});

console.log(JSON.stringify(info, null, 2));
check(`图片宽 ${info.imgW.toFixed(1)}px ≈ 格宽 ${info.cellW.toFixed(1)}px × ${info.gridSize}`, Math.abs(info.imgW - info.cellW * info.gridSize) < 2);
check(`样式使用百分比（width=${info.styleWidth}）`, info.styleWidth === `${info.gridSize * 100}%`);

// 核心不变量：每块切片的窗口位移必须是格宽/格高的整数倍（相邻切片才能无缝对接）
// 旧实现按 300px 假设定位，位移 ÷ 真实格宽会是 1.18 这类非整数 → 边缘错位
const aligned = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('.piece-image')];
  const cell = document.querySelector('.puzzle-piece').getBoundingClientRect();
  let allAligned = true;
  const detail = [];
  for (const img of imgs) {
    const m = new DOMMatrixReadOnly(getComputedStyle(img).transform);
    const kx = Math.abs(m.m41) / cell.width;
    const ky = Math.abs(m.m42) / cell.height;
    const okX = Math.abs(kx - Math.round(kx)) < 0.02;
    const okY = Math.abs(ky - Math.round(ky)) < 0.02;
    if (!okX || !okY) allAligned = false;
    detail.push(`(${kx.toFixed(2)},${ky.toFixed(2)})`);
  }
  return { allAligned, detail: detail.join(' ') };
});
check(`全部 ${aligned.detail.split(' ').length} 块窗口对齐格边界（位移=格宽整数倍）`, aligned.allAligned);
console.log(`  位移倍数: ${aligned.detail}`);

await page.screenshot({ path: 'test-results/puzzle-slicing.png' });
await browser.close();
