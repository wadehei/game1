// 儿童游戏乐园 - 端到端测试脚本
import puppeteer from 'puppeteer';

const BASE_URL = 'http://localhost:8080';
const API_URL = 'http://localhost:3001';

// 等待函数
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let browser;
let page;
let passed = 0;
let failed = 0;

// 测试函数
async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    failed++;
  }
}

// 断言函数
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runTests() {
  console.log('🧪 开始端到端测试...\n');
  console.log(`📍 前端地址：${BASE_URL}`);
  console.log(` 后端地址：${API_URL}\n`);

  // 启动浏览器
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // 1. 后端 API 测试
  console.log('🔧 后端 API 测试:');

  await test('健康检查接口', async () => {
    const response = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return res.json();
    }, `${API_URL}/api/health`);
    assert(response.status === 'ok', '健康检查失败');
  });

  await test('用户登录接口', async () => {
    const response = await page.evaluate(async (url) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: '测试用户' })
      });
      return res.json();
    }, `${API_URL}/api/user/login/test`);
    assert(response.code === 200, '登录失败');
    assert(response.data.token, '没有返回 token');
    assert(response.data.userInfo, '没有返回用户信息');
  });

  await test('关卡配置接口', async () => {
    const response = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return res.json();
    }, `${API_URL}/api/level/memory`);
    assert(response.code === 200, '获取关卡配置失败');
    assert(response.data.config, '没有返回配置');
  });

  console.log('');

  // 2. 前端页面测试
  console.log('🌐 前端页面测试:');

  await test('游戏大厅页面加载', async () => {
    await page.goto(BASE_URL);
    await page.waitForSelector('#app', { timeout: 5000 });
    const title = await page.title();
    assert(title === '儿童游戏乐园', `页面标题错误：${title}`);
  });

  await test('游戏列表显示', async () => {
    await wait(2000); // 等待 Vue 挂载完成
    const gameCount = await page.evaluate(() => {
      return document.querySelectorAll('.game-card').length;
    });
    assert(gameCount === 5, `游戏数量错误：${gameCount}`);
  });

  await test('游戏卡片点击跳转', async () => {
    const cards = await page.$$('.game-card');
    assert(cards.length > 0, '没有找到游戏卡片');
    await cards[0].click();
    await wait(1000);
    const url = page.url();
    assert(url.includes('/memory'), `跳转失败：${url}`);
  });

  console.log('');

  // 3. 游戏页面测试
  console.log('🎮 游戏页面测试:');

  await test('记忆翻牌游戏加载', async () => {
    await page.goto(`${BASE_URL}/#/memory`);
    await wait(1000);
    const hasCards = await page.evaluate(() => {
      return document.querySelectorAll('.card').length > 0;
    });
    assert(hasCards, '记忆翻牌卡片未显示');
  });

  await test('接水果游戏加载', async () => {
    await page.goto(`${BASE_URL}/#/fruit`);
    await wait(1000);
    const hasCanvas = await page.evaluate(() => {
      return document.querySelector('#fruitCanvas') !== null;
    });
    assert(hasCanvas, '接水果 Canvas 未显示');
  });

  await test('打气球游戏加载', async () => {
    await page.goto(`${BASE_URL}/#/balloon`);
    await wait(1000);
    const hasCanvas = await page.evaluate(() => {
      return document.querySelector('#balloonCanvas') !== null;
    });
    assert(hasCanvas, '打气球 Canvas 未显示');
  });

  await test('坦克大战游戏加载', async () => {
    await page.goto(`${BASE_URL}/#/tank`);
    await wait(1000);
    const hasCanvas = await page.evaluate(() => {
      return document.querySelector('#tankCanvas') !== null;
    });
    assert(hasCanvas, '坦克大战 Canvas 未显示');
  });

  await test('拼图游戏加载', async () => {
    await page.goto(`${BASE_URL}/#/puzzle`);
    await wait(1500);
    const hasPieces = await page.evaluate(() => {
      return document.querySelectorAll('.puzzle-piece').length > 0;
    });
    assert(hasPieces, '拼图块未显示');
  });

  console.log('');

  // 4. 功能测试
  console.log('️ 功能测试:');

  await test('记忆翻牌游戏交互', async () => {
    await page.goto(`${BASE_URL}/#/memory`);
    await wait(1000);
    // 点击第一张卡片
    await page.evaluate(() => {
      document.querySelectorAll('.card')[0].click();
    });
    await wait(500);
    // 检查卡片是否翻转
    const isFlipped = await page.evaluate(() => {
      return document.querySelectorAll('.card')[0].classList.contains('flipped');
    });
    assert(isFlipped, '卡片未翻转');
  });

  await test('用户中心页面', async () => {
    await page.goto(`${BASE_URL}/#/user`);
    await wait(1000);
    const hasUserInfo = await page.evaluate(() => {
      return document.querySelector('.user-card') !== null;
    });
    assert(hasUserInfo, '用户信息卡片未显示');
  });

  console.log('');

  // 5. 响应式测试
  console.log('📱 响应式测试:');

  await test('移动端适配', async () => {
    await page.setViewport({ width: 375, height: 812 });
    await page.goto(BASE_URL);
    await wait(500);
    const hasHeader = await page.evaluate(() => {
      return document.querySelector('.header') !== null;
    });
    assert(hasHeader, '移动端页面未正常显示');
  });

  console.log('');

  // 测试总结
  console.log('='.repeat(50));
  console.log('📊 测试总结:');
  console.log(`✅ 通过：${passed} 项`);
  console.log(`❌ 失败：${failed} 项`);
  console.log(`📝 总计：${passed + failed} 项`);
  console.log('='.repeat(50));

  if (failed === 0) {
    console.log('\n🎉 所有测试通过！');
  } else {
    console.log(`\n️ 有 ${failed} 项测试失败，请检查`);
  }

  await browser.close();
}

// 运行测试
runTests().catch(console.error);
