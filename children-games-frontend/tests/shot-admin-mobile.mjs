import { ADMIN_PASSWORD } from './helpers.mjs';
// 手机端后台截图（布局修复验证）
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
await page.goto('http://localhost:8080/#/admin/login', { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 800));
await page.type('.login-input', ADMIN_PASSWORD);
await page.click('.login-btn');
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: 'test-results/admin-mobile-fixed.png' });
// 角色管理页也来一张
await page.evaluate(() => {
  [...document.querySelectorAll('.mobile-tab')].find((t) => t.textContent.includes('角色管理'))?.click();
});
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: 'test-results/admin-mobile-members.png' });
await browser.close();
console.log('done');
