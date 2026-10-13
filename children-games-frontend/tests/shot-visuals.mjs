// 图形优化效果截图：翻牌卡背 / 打气球（飞镖+金气球）
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:8080';
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 700, deviceScaleFactor: 2 });

// 先建/复用一个角色拿到 token，避免守卫拦截
await page.goto(`${BASE}/#/profiles`, { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 1000));
const hasToken = await page.evaluate(() => !!localStorage.getItem('token'));
if (!hasToken) {
  await page.evaluate(async () => {
    const res = await fetch('/api/user/login/family', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: '儿子', avatar: '🐯' }),
    });
    const data = await res.json();
    localStorage.setItem('token', data.data.token);
    localStorage.setItem('userInfo', JSON.stringify(data.data.userInfo));
  });
}

// 翻牌：卡背
await page.goto(`${BASE}/#/memory`, { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: 'test-results/visual-memory-back.png' });

// 打气球：点两发看飞镖，等金气球出现
await page.goto(`${BASE}/#/balloon`, { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 2500));
const canvas = await page.$('canvas');
const box = await canvas.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height - 80);
await page.mouse.click(box.x + box.width / 2 + 60, box.y + box.height - 80);
await new Promise((r) => setTimeout(r, 350));
await page.screenshot({ path: 'test-results/visual-balloon.png' });

await browser.close();
console.log('done');
