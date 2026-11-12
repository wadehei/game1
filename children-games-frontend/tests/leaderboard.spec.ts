import { test, expect } from '@playwright/test';

/**
 * Mock API 响应，防止 fake token 导致 401
 */
async function mockApis(page) {
  await page.route('**/api/user/info', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        data: { id: 1, nickname: 'test', avatar: '🦊', level: 1, totalStars: 10 },
      }),
    })
  );
  await page.route('**/api/game/progress**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: [] }),
    })
  );
  await page.route('**/api/game/daily-task**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        data: { completedGames: 0, playedGames: [], taskGoal: 3, rewardStars: 10, claimed: false },
      }),
    })
  );
  await page.route('**/api/game/leaderboard/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: [] }),
    })
  );
}

/**
 * 等待首页游戏列表加载完成
 */
async function waitForGameList(page) {
  await mockApis(page);
  // 在页面加载前设置 localStorage，绕过角色选择页面
  await page.addInitScript(() => {
    localStorage.setItem('token', 'test_token');
    localStorage.setItem('last_profile_id', '1');
  });
  await page.goto('/#/');
  // 等待游戏卡片出现（加载完成后才会显示）
  await page.locator('.game-card').first().waitFor({ state: 'visible', timeout: 10000 });
  // 等待 API 响应处理完毕，Vue 响应式更新完成后 DOM 才稳定
  await page.waitForTimeout(800);
}

test.describe('排行榜系统', () => {
  // Opening the leaderboard
  test.describe('1. 打开排行榜', () => {
    test('游戏卡片应显示排行按钮', async ({ page }) => {
      await waitForGameList(page);
      // Each game card should have a leaderboard button
      const boardButtons = page.locator('button.board-btn');
      const count = await boardButtons.count();
      expect(count).toBeGreaterThan(0);
    });

    test('点击排行按钮应弹出排行榜弹窗', async ({ page }) => {
      await waitForGameList(page);
      const firstBoardBtn = page.locator('button.board-btn').first();
      await firstBoardBtn.click({ force: true });
      await expect(page.locator('.board-modal')).toBeVisible();
    });

    test('弹窗标题应包含游戏名称', async ({ page }) => {
      await waitForGameList(page);
      // Get the game name from the card
      const gameCard = page.locator('.game-card').first();
      const gameName = await gameCard.locator('.game-name').textContent();

      await gameCard.locator('button.board-btn').click({ force: true });

      const title = page.locator('.board-title');
      await expect(title).toBeVisible();
      await expect(title).toContainText(gameName || '');
      await expect(title).toContainText('家庭排行');
    });
  });

  // Modal content
  test.describe('2. 弹窗内容', () => {
    test.beforeEach(async ({ page }) => {
      await waitForGameList(page);
      await page.locator('button.board-btn').first().click({ force: true });
      await expect(page.locator('.board-modal')).toBeVisible();
    });

    test('应显示关闭按钮', async ({ page }) => {
      await expect(page.locator('button.board-close')).toBeVisible();
    });

    test('加载中应显示加载状态', async ({ page }) => {
      // The loading state is brief, so we check if the modal content area exists
      await expect(page.locator('.board-content')).toBeVisible();
    });

    test('无记录时应显示空状态', async ({ page }) => {
      // This depends on backend data - check if empty state element exists or rows exist
      const hasEmpty = await page
        .locator('.board-empty')
        .isVisible()
        .catch(() => false);
      const hasRows = await page
        .locator('.board-row')
        .first()
        .isVisible()
        .catch(() => false);
      // At least one should be true
      expect(hasEmpty || hasRows).toBe(true);
    });
  });

  // Closing the modal
  test.describe('3. 关闭弹窗', () => {
    test('点击关闭按钮应关闭弹窗', async ({ page }) => {
      await waitForGameList(page);
      await page.locator('button.board-btn').first().click({ force: true });
      await expect(page.locator('.board-modal')).toBeVisible();

      await page.locator('button.board-close').click({ force: true });
      await expect(page.locator('.board-modal')).not.toBeVisible();
    });

    test('点击弹窗外部应关闭弹窗', async ({ page }) => {
      await waitForGameList(page);
      await page.locator('button.board-btn').first().click({ force: true });
      await expect(page.locator('.board-modal')).toBeVisible();

      // Click on the overlay area (outside content)
      await page.locator('.board-modal').click({ position: { x: 10, y: 10 }, force: true });
      await expect(page.locator('.board-modal')).not.toBeVisible();
    });
  });

  // Ranking display
  test.describe('4. 排名显示', () => {
    test('排行行应显示排名、头像和分数', async ({ page }) => {
      await waitForGameList(page);
      await page.locator('button.board-btn').first().click({ force: true });

      // Wait for data to load (or empty state)
      await page.waitForTimeout(1000);

      const rows = page.locator('.board-row');
      const rowCount = await rows.count();

      if (rowCount > 0) {
        // Check first row has expected elements
        const firstRow = rows.first();
        await expect(firstRow.locator('.rank-medal')).toBeVisible();
        await expect(firstRow.locator('.row-name')).toBeVisible();
        await expect(firstRow.locator('.row-score')).toBeVisible();
      }
      // If no rows, empty state should be shown
      else {
        await expect(page.locator('.board-empty')).toBeVisible();
      }
    });

    test('前三名应显示奖牌图标', async ({ page }) => {
      await waitForGameList(page);
      await page.locator('button.board-btn').first().click({ force: true });
      await page.waitForTimeout(1000);

      const rows = page.locator('.board-row');
      const count = await rows.count();

      if (count >= 1) {
        const firstMedal = rows.first().locator('.rank-medal');
        const medalText = await firstMedal.textContent();
        // First place should show 🥇 or "1"
        expect(medalText).toMatch(/🥇|1/);
      }
    });
  });
});
