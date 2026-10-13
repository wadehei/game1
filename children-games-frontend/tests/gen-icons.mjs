// 一次性工具：把应用图标 SVG 渲染为各尺寸 PNG（PWA / iOS 添加主屏用）
// 运行：node tests/gen-icons.mjs
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#667eea"/>
      <stop offset="1" stop-color="#764ba2"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="110" fill="url(#bg)"/>
  <rect x="96" y="96" width="150" height="150" rx="38" fill="#FF6B6B"/>
  <rect x="266" y="96" width="150" height="150" rx="38" fill="#FFE66D"/>
  <rect x="96" y="266" width="150" height="150" rx="38" fill="#4ECDC4"/>
  <rect x="266" y="266" width="150" height="150" rx="38" fill="#FFD700"/>
  <circle cx="341" cy="341" r="62" fill="#fff"/>
  <text x="341" y="366" font-size="86" text-anchor="middle">⭐</text>
</svg>`;

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();

for (const size of [512, 192, 180]) {
  await page.setViewport({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0"><img src="data:image/svg+xml;base64,${Buffer.from(ICON_SVG).toString('base64')}" width="${size}" height="${size}"></body>`
  );
  await page.screenshot({ path: path.join(outDir, `icon-${size}.png`), clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`✓ icon-${size}.png`);
}

await browser.close();
