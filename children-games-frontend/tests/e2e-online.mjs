// 端到端效果验证（后端在线）：角色创建 → 妈妈/儿子数学对战 → 计时上榜 → 排行榜排序 → 切换角色
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:8080';
const shot = (name) => `test-results/e2e-${name}.png`;
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(err.message));
const realErrors = () => pageErrors.filter((e) => !/NetworkError|404|500|Request failed|AxiosError|ERR_/i.test(e));
const check = (label, cond) => console.log(`${cond ? '✅' : '❌'} ${label}`);

// 创建（或复用已有同名）角色并进入大厅
const createProfile = async (nickname, emojiIndex = 0) => {
  await page.goto(`${BASE}/#/profiles`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1200);
  const existing = await page.evaluate((name) => {
    const cards = [...document.querySelectorAll('.profile-card:not(.create-card)')];
    const found = cards.find((c) => c.querySelector('.profile-name')?.textContent?.trim() === name);
    if (!found) return false;
    found.click();
    return true;
  }, nickname);
  if (existing) {
    await sleep(1500);
    return;
  }
  await page.click('.create-card');
  await sleep(400);
  await page.type('.create-input', nickname);
  await page.click(`.emoji-grid .emoji-cell:nth-child(${emojiIndex + 1})`);
  await page.click('.c-btn.ok');
  await sleep(1500);
};

// 通关数学：数苹果 → 点对应选项，答对 8 题即胜
const answerMathOnce = async () => {
  const info = await page.evaluate(() => {
    const group = document.querySelector('.apple-group');
    const apples = group ? group.querySelectorAll('.apple').length : 0;
    const btns = [...document.querySelectorAll('.option-btn')];
    const idx = btns.findIndex((b) => parseInt(b.textContent, 10) === apples);
    return { idx: idx >= 0 ? idx : 0 };
  });
  await page.click(`.option-btn:nth-child(${info.idx + 1})`);
  await sleep(900);
};

const winMath = async () => {
  await page.goto(`${BASE}/#/math`, { waitUntil: 'networkidle2' });
  await sleep(1500);
  for (let i = 0; i < 8; i++) {
    await answerMathOnce();
  }
  await sleep(800);
  return page.evaluate(() => ({
    modal: !!document.querySelector('.result-modal'),
    info: document.querySelector('.result-info')?.textContent?.trim(),
  }));
};

// 打开某游戏的排行榜并返回行数据
const openBoard = async (cardIndex) => {
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' });
  await sleep(1800);
  await page.click(`.game-card:nth-child(${cardIndex}) .board-btn`);
  await sleep(1000);
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.board-row')].map((r) => ({
      name: r.querySelector('.row-name')?.textContent?.trim(),
      score: r.querySelector('.row-score')?.textContent?.trim(),
    }))
  );
  await page.screenshot({ path: shot(`board-${cardIndex}`) });
  await page.click('.board-close');
  await sleep(300);
  return rows;
};

// ═══ 1. 未登录访问首页 → 跳选角色页 ═══
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
await sleep(1000);
await page.evaluate(() => localStorage.clear());
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' }).catch(() => {});
await sleep(1200);
{
  const onProfiles = await page.evaluate(() => !!document.querySelector('.profiles-page'));
  check('未登录访问首页自动跳到选角色页', onProfiles);
}
await page.screenshot({ path: shot('profiles') });

// ═══ 2. 创建妈妈角色 ═══
await createProfile('妈妈', 10); // 👑
{
  const info = await page.evaluate(() => ({
    nickname: document.querySelector('.nickname')?.textContent?.trim(),
    avatar: document.querySelector('.player-avatar')?.textContent?.trim(),
    cards: document.querySelectorAll('.game-card').length,
  }));
  check(`妈妈进入大厅：「${info.nickname}」角色 ${info.avatar}（期望 👑）`, info.nickname === '妈妈' && info.avatar === '👑');
  check(`大厅 ${info.cards} 张游戏卡片`, info.cards === 8);
}
await page.screenshot({ path: shot('home-mom') });

// ═══ 3. 妈妈玩数学并计时上榜 ═══
{
  const r = await winMath();
  check(`妈妈通关数学：${r.info}（含用时）`, r.modal && /用时 \d+ 秒/.test(r.info || ''));
  await page.screenshot({ path: shot('math-win') });
  const rows = await openBoard(8); // 第 8 张卡片 = 数学小怪兽
  check(`数学排行榜含妈妈（${rows.length} 行，仅家庭角色）`, rows.length >= 1 && rows.every((r) => ['妈妈', '儿子'].includes(r.name)) && rows.some((r) => r.name === '妈妈'));
  check(`成绩格式「${rows.find((r) => r.name === '妈妈')?.score}」（期望 最快 X 秒）`, /最快 \d+ 秒/.test(rows.find((r) => r.name === '妈妈')?.score || ''));
}

// ═══ 4. 切换到儿子 ═══
await page.goto(`${BASE}/#/profiles`, { waitUntil: 'networkidle2' });
await sleep(1200);
await createProfile('儿子', 7); // 🐯
{
  const info = await page.evaluate(() => ({
    nickname: document.querySelector('.nickname')?.textContent?.trim(),
  }));
  check(`切换到儿子：「${info.nickname}」`, info.nickname === '儿子');
}

// ═══ 5. 儿子也玩数学 → 排行榜两人 ═══
{
  await winMath();
  const rows = await openBoard(8);
  check(`数学排行榜 ${rows.length} 行（期望 2）`, rows.length === 2);
  const names = rows.map((r) => r.name).join('、');
  const scores = rows.map((r) => parseInt((r.score || '').match(/\d+/)?.[0] || '0', 10));
  check(`按用时升序：${names}（${scores.join('秒,')}秒）`, rows.length === 2 && scores[0] <= scores[1]);
}
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' });
await sleep(1800);
await page.screenshot({ path: shot('home-son') });

console.log(`\n页面异常：${realErrors().length}${realErrors().length ? ' → ' + realErrors().join(' | ') : ' ✅ 无'}`);
await browser.close();
