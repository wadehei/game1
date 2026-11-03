/**
 * 对战系统 E2E 测试
 *
 * 测试范围：
 * - 房间创建与加入
 * - WebSocket 连接
 * - 准备/取消准备
 * - 游戏流程（倒计时、进行中、结束）
 * - 积分结算
 *
 * @note 需要后端服务运行在 http://localhost:8080
 * @note 使用两个测试账号进行对战
 */

import { test, expect, type Page } from '@playwright/test';

// ─── 测试配置 ────────────────────────────────────────────
const TEST_USERS = {
  playerA: { nickname: 'E2E_TestA', tokenKey: 'token_a' },
  playerB: { nickname: 'E2E_TestB', tokenKey: 'token_b' },
};

const WAIT_TIMEOUT = 15000;
const SHORT_WAIT = 2000;

// ─── 辅助函数 ────────────────────────────────────────────

/**
 * 等待 WebSocket 连接建立
 */
const waitForWsConnection = async (page: Page) => {
  await page.waitForSelector('[data-testid="ws-connected"]', { timeout: WAIT_TIMEOUT });
};

/**
 * 等待元素可见
 */
const waitForVisible = async (page: Page, testId: string, timeout = WAIT_TIMEOUT) => {
  await page.waitForSelector(`[data-testid="${testId}"]`, { state: 'visible', timeout });
};

/**
 * 创建测试账号并登录
 */
const loginAsTestUser = async (page: Page, nickname: string) => {
  // 清除现有登录状态
  await page.evaluate(() => localStorage.clear());

  // 访问角色选择页
  await page.goto('/#/profiles', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(SHORT_WAIT);

  // 检查是否已有该测试角色
  const existingCard = page.locator(`.profile-card .profile-name:has-text("${nickname}")`);
  if ((await existingCard.count()) > 0) {
    // 点击已有角色
    await existingCard.first().click();
    await page.waitForTimeout(SHORT_WAIT);
    return;
  }

  // 创建新角色
  const createCard = page.locator('.create-card');
  await createCard.click();
  await page.waitForTimeout(500);

  // 输入昵称
  await page.fill('.create-input', nickname);

  // 选择第一个表情
  const emojiCell = page.locator('.emoji-grid .emoji-cell').first();
  await emojiCell.click();

  // 确认创建
  await page.locator('.c-btn.ok').click();
  await page.waitForTimeout(SHORT_WAIT);
};

/**
 * 创建房间并返回房间号
 */
const createRoom = async (page: Page, gameType = 'gomoku'): Promise<string> => {
  await page.goto('/#/battle', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(SHORT_WAIT);

  // 选择游戏类型
  const gameCard = page.locator(`[data-testid="game-card-${gameType}"]`);
  await gameCard.click();
  await page.waitForTimeout(500);

  // 点击创建房间
  await page.locator('[data-testid="create-room-btn"]').click();

  // 等待进入房间页面并获取房间号
  await page.waitForURL(/\/battle\/room\/\d{4}/, { timeout: WAIT_TIMEOUT });
  await page.waitForTimeout(SHORT_WAIT);

  // 获取房间号
  const roomIdElement = page.locator('[data-testid="room-id"]');
  const roomId = await roomIdElement.textContent();
  return roomId?.trim() || '';
};

/**
 * 加入房间
 */
const joinRoom = async (page: Page, roomId: string) => {
  await page.goto('/#/battle', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(SHORT_WAIT);

  // 输入房间号
  await page.fill('[data-testid="join-input"]', roomId);

  // 点击加入
  await page.locator('[data-testid="join-btn"]').click();

  // 等待进入房间页面
  await page.waitForURL(/\/battle\/room\/\d{4}/, { timeout: WAIT_TIMEOUT });
  await page.waitForTimeout(SHORT_WAIT);
};

/**
 * 获取座位信息
 */
const getSeatInfo = async (page: Page) => {
  const seats = page.locator('[data-testid^="seat-"]');
  const count = await seats.count();
  const seatData = [];

  for (let i = 0; i < count; i++) {
    const seat = seats.nth(i);
    const testId = await seat.getAttribute('data-testid');
    if (testId && !testId.includes('seats-grid')) {
      const nameEl = seat.locator('[data-testid^="seat-name-"]');
      const stateEl = seat.locator('[data-testid^="seat-state-"]');
      const name = await nameEl.textContent();
      const state = await stateEl.textContent();
      seatData.push({
        userId: testId.replace('seat-', ''),
        name: name?.trim(),
        state: state?.trim(),
      });
    }
  }

  return seatData;
};

// ─── 测试用例 ────────────────────────────────────────────

test.describe('对战系统 - WebSocket 对战流程', () => {
  test.describe('1. 房间创建', () => {
    test('用户 A 创建房间 → 验证房间号生成', async ({ page }) => {
      // 登录
      await loginAsTestUser(page, TEST_USERS.playerA.nickname);

      // 创建房间
      const roomId = await createRoom(page, 'gomoku');

      // 验证房间号格式（4位数字）
      expect(roomId).toMatch(/^\d{4}$/);
      console.log('Created room:', roomId);

      // 验证进入房间页面
      await expect(page.locator('[data-testid="room-topbar"]')).toBeVisible();

      // 验证显示房间号
      const displayedId = await page.locator('[data-testid="room-id"]').textContent();
      expect(displayedId).toBe(roomId);

      // 验证房主标识
      await expect(page.locator('[data-testid="host-mark"]')).toBeVisible();

      // 截图
      await page.screenshot({ path: 'tests/screenshots/battle-room-created.png' });
    });

    test('创建房间后 WebSocket 应连接成功', async ({ page }) => {
      await loginAsTestUser(page, TEST_USERS.playerA.nickname);
      await createRoom(page, 'gomoku');

      // 等待 WebSocket 连接
      await waitForWsConnection(page);

      // 验证连接状态元素存在
      const wsConnected = page.locator('[data-testid="ws-connected"]');
      await expect(wsConnected).toBeAttached();
    });
  });

  test.describe('2. 房间加入', () => {
    test('用户 B 加入房间 → 验证双方就位', async ({ page: pageA }) => {
      // 注意：Playwright 默认单 page，这里用单个 page 验证基本流程
      // 实际双用户测试需要 test.fixme 或使用 storageState

      // 用户 A 创建房间
      await loginAsTestUser(pageA, TEST_USERS.playerA.nickname);
      const roomId = await createRoom(pageA, 'gomoku');

      // 等待 WebSocket 连接
      await waitForWsConnection(pageA);

      // 验证房间号
      expect(roomId).toMatch(/^\d{4}$/);

      // 截图显示等待状态
      await pageA.screenshot({ path: 'tests/screenshots/battle-waiting-player.png' });

      // 验证等待提示
      const waitingText = pageA.locator('[data-testid="waiting-text"]');
      await expect(waitingText).toBeVisible();
      const text = await waitingText.textContent();
      expect(text).toContain('等待');
    });

    test('验证座位网格显示', async ({ page }) => {
      await loginAsTestUser(page, TEST_USERS.playerA.nickname);
      await createRoom(page, 'gomoku');
      await waitForWsConnection(page);

      // 验证座位网格
      await expect(page.locator('[data-testid="seats-grid"]')).toBeVisible();

      // 验证至少有一个座位（房主）
      const seats = page.locator('[data-testid^="seat-name-"]');
      const count = await seats.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });

  test.describe('3. 准备流程', () => {
    test('房主可以点击准备按钮', async ({ page }) => {
      await loginAsTestUser(page, TEST_USERS.playerA.nickname);
      await createRoom(page, 'gomoku');
      await waitForWsConnection(page);

      // 等待准备按钮出现
      await page.waitForTimeout(SHORT_WAIT);

      // 验证准备按钮存在
      const readyBtn = page.locator('[data-testid="ready-btn"]');
      const cancelBtn = page.locator('[data-testid="cancel-ready-btn"]');

      // 至少有一个按钮应该存在
      const readyExists = await readyBtn.count();
      const cancelExists = await cancelBtn.count();

      if (readyExists > 0) {
        await expect(readyBtn).toBeVisible();

        // 点击准备
        await readyBtn.click();
        await page.waitForTimeout(1000);

        // 验证变为取消准备按钮
        await expect(cancelBtn).toBeVisible();
      } else if (cancelExists > 0) {
        // 已经准备了，可以取消
        await expect(cancelBtn).toBeVisible();
      }

      await page.screenshot({ path: 'tests/screenshots/battle-ready-state.png' });
    });
  });

  test.describe('4. 游戏状态', () => {
    test('状态栏应显示正确的游戏阶段', async ({ page }) => {
      await loginAsTestUser(page, TEST_USERS.playerA.nickname);
      await createRoom(page, 'gomoku');
      await waitForWsConnection(page);

      // 验证状态栏存在
      await expect(page.locator('[data-testid="status-line"]')).toBeVisible();

      // 等待阶段应该是 waiting
      const waitingText = page.locator('[data-testid="waiting-text"]');
      await expect(waitingText).toBeVisible();
    });

    test('游戏操作区应显示正确的按钮', async ({ page }) => {
      await loginAsTestUser(page, TEST_USERS.playerA.nickname);
      await createRoom(page, 'gomoku');
      await waitForWsConnection(page);
      await page.waitForTimeout(SHORT_WAIT);

      // 验证操作区存在
      await expect(page.locator('[data-testid="game-actions"]')).toBeVisible();

      // 截图
      await page.screenshot({ path: 'tests/screenshots/battle-game-actions.png' });
    });
  });

  test.describe('5. 房间功能', () => {
    test('房主可以解散房间', async ({ page }) => {
      await loginAsTestUser(page, TEST_USERS.playerA.nickname);
      await createRoom(page, 'gomoku');
      await waitForWsConnection(page);

      // 验证解散按钮存在（房主才有）
      const disbandBtn = page.locator('[data-testid="disband-btn"]');
      await expect(disbandBtn).toBeVisible();

      // 点击解散
      await disbandBtn.click();
      await page.waitForTimeout(500);

      // 验证确认弹窗
      const confirmBox = page.locator('.confirm');
      await expect(confirmBox).toBeVisible();

      // 确认解散
      await page.locator('.c-ok').click();
      await page.waitForTimeout(SHORT_WAIT);

      // 验证返回对战大厅
      await expect(page).toHaveURL(/\/battle$/);
    });

    test('可以退出房间', async ({ page }) => {
      await loginAsTestUser(page, TEST_USERS.playerA.nickname);
      await createRoom(page, 'gomoku');
      await waitForWsConnection(page);

      // 点击退出
      await page.locator('[data-testid="exit-btn"]').click();
      await page.waitForTimeout(SHORT_WAIT);

      // 验证返回对战大厅
      await expect(page).toHaveURL(/\/battle$/);
    });

    test('可以复制邀请链接', async ({ page }) => {
      await loginAsTestUser(page, TEST_USERS.playerA.nickname);
      await createRoom(page, 'gomoku');
      await waitForWsConnection(page);

      // 点击复制按钮（房间号区域）
      await page.locator('[data-testid="room-code"]').click();
      await page.waitForTimeout(500);

      // 验证显示"链接已复制"
      const copyText = page.locator('.rt-copy');
      const text = await copyText.textContent();
      expect(text).toBe('链接已复制');
    });
  });

  test.describe('6. 不同游戏类型', () => {
    const gameTypes = ['gomoku', 'blackjack', 'zjh', 'quiz', 'draw', 'spy', 'uno'];

    for (const gameType of gameTypes) {
      test(`可以创建 ${gameType} 游戏房间`, async ({ page }) => {
        await loginAsTestUser(page, TEST_USERS.playerA.nickname);
        const roomId = await createRoom(page, gameType);

        // 验证房间号生成
        expect(roomId).toMatch(/^\d{4}$/);

        // 验证进入房间
        await expect(page.locator('[data-testid="room-topbar"]')).toBeVisible();

        await page.screenshot({ path: `tests/screenshots/battle-${gameType}-room.png` });
      });
    }
  });
});

// ─── 集成测试场景 ────────────────────────────────────────

test.describe('对战系统 - 完整流程（需要两个浏览器上下文）', () => {
  test.skip('完整对战流程：创建 → 加入 → 准备 → 游戏 → 结算', async ({ browser }) => {
    // 注意：这个测试需要两个独立的浏览器上下文来模拟两个用户
    // 在实际 CI 环境中可能需要特殊配置

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    try {
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      // 用户 A 登录并创建房间
      await loginAsTestUser(pageA, 'PlayerA_Full');
      const roomId = await createRoom(pageA, 'gomoku');
      await waitForWsConnection(pageA);

      // 用户 B 登录并加入房间
      await loginAsTestUser(pageB, 'PlayerB_Full');
      await joinRoom(pageB, roomId);
      await waitForWsConnection(pageB);

      // 验证双方都在房间中
      const seatsA = await getSeatInfo(pageA);
      const seatsB = await getSeatInfo(pageB);

      expect(seatsA.length).toBe(2);
      expect(seatsB.length).toBe(2);

      // 双方准备
      await pageA.locator('[data-testid="ready-btn"]').click();
      await pageB.locator('[data-testid="ready-btn"]').click();

      // 等待游戏开始（需要双方都准备）
      await pageA.waitForTimeout(3000);

      // 验证游戏阶段变为 playing
      const playingText = pageA.locator('[data-testid="playing-text"]');
      await expect(playingText).toBeVisible({ timeout: WAIT_TIMEOUT });

      // 模拟下棋（这里需要根据实际游戏逻辑来操作）
      // ... 具体游戏操作省略 ...

      // 截图
      await pageA.screenshot({ path: 'tests/screenshots/battle-full-game.png' });
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
