// 把所有 SVG 资源渲染到一张对照图上，供视觉检查
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imgDir = path.join(__dirname, '..', 'src', 'static', 'images', 'games');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.svg') ? [p] : [];
  });
}

const svgs = walk(imgDir);
const cells = svgs.map((p) => {
  const rel = path.relative(imgDir, p);
  const label = rel.replace(/\.svg$/, '');
  const b64 = fs.readFileSync(p).toString('base64');
  return `<div class="cell"><img src="data:image/svg+xml;base64,${b64}"/><span>${label}</span></div>`;
});

const cols = 6;
const html = `<html><head><style>
  body { margin: 0; background: #2b2b2b; font-family: sans-serif; display: grid; grid-template-columns: repeat(${cols}, 130px); gap: 8px; padding: 10px; }
  .cell { background: #fff; border-radius: 8px; padding: 6px; text-align: center; }
  img { width: 100px; height: 100px; object-fit: contain; }
  span { display: block; font-size: 9px; color: #444; margin-top: 2px; word-break: break-all; }
</style></head><body>${cells.join('')}</body></html>`;

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const rows = Math.ceil(svgs.length / cols);
await page.setViewport({ width: cols * 130 + 20, height: rows * 150 + 20 });
await page.setContent(html);
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: path.join(__dirname, '..', 'test-results', 'svg-contact-sheet.png'), fullPage: true });
console.log(`共 ${svgs.length} 个 SVG，已输出 test-results/svg-contact-sheet.png`);
await browser.close();
