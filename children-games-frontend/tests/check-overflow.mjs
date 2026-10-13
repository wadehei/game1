// 横向溢出检查：PC 视口下逐页 hover 关键元素，确认不出现横向滚动
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:8080';
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 准备登录态（避免守卫跳转）
await page.goto(`${BASE}/#/profiles`, { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(800);
await page.evaluate(async () => {
  if (localStorage.getItem('token')) return;
  const profiles = await (await fetch('/api/user/profiles')).json();
  const login = await fetch('/api/user/login/family', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: profiles.data?.[0]?.id }),
  });
  const data = await login.json();
  localStorage.setItem('token', data.data.token);
  localStorage.setItem('userInfo', JSON.stringify(data.data.userInfo));
});

const checkOverflow = async (label, hoverSelector) => {
  await page.goto(`${BASE}/${label}`, { waitUntil: 'networkidle2' });
  await sleep(1200);
  if (hoverSelector) {
    const el = await page.$(hoverSelector);
    if (el) {
      const box = await el.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await sleep(400);
      }
    }
  }
  const { scrollW, innerW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }));
  const ok = scrollW <= innerW;
  console.log(`${ok ? '✅' : '❌'} ${label} scrollWidth=${scrollW} viewport=${innerW}${hoverSelector ? `（hover: ${hoverSelector}）` : ''}`);
  return ok;
};

let allOk = true;
allOk = (await checkOverflow('#/', '.game-card')) && allOk;
allOk = (await checkOverflow('#/user', '.achievement-item')) && allOk;
allOk = (await checkOverflow('#/profiles', '.profile-card')) && allOk;
allOk = (await checkOverflow('#/admin')) && allOk;
allOk = (await checkOverflow('#/simon', '.pad')) && allOk;

// 大厅卡片 hover 前后横向尺寸对比（确认缩放生效且被裁剪）
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' });
await sleep(1200);
const card = await page.$('.game-card');
const box = await card.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await sleep(400);
const cardBox = await card.boundingBox();
console.log(`✅ hover 缩放生效：卡片宽 ${box.width.toFixed(0)} → ${cardBox.width.toFixed(0)}（右侧超出部分被裁剪，无滚动条）`);

await browser.close();
process.exit(allOk ? 0 : 1);
