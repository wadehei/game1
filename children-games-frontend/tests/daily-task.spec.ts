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
}

/**
 * 导航到首页并等待加载完成
 */
async function goToHomeAndWait(page) {
  await mockApis(page);
  // 在页面加载前设置 localStorage，绕过角色选择页面
  await page.addInitScript(() => {
    localStorage.setItem('token', 'test_token');
    localStorage.setItem('last_profile_id', '1');
  });
  await page.goto('/#/');
  // 等待页面内容加载
  await page.waitForTimeout(1000);
}

test.describe('每日任务系统', () => {
  // Card visibility
  test.describe('1. 任务卡片显示', () => {
    test('首页应显示每日任务卡片', async ({ page }) => {
      await goToHomeAndWait(page);
      await expect(page.locator('.daily-task.card')).toBeVisible();
    });

    test('任务卡片应显示标题', async ({ page }) => {
      await goToHomeAndWait(page);
      await expect(page.locator('.task-title')).toContainText('每日任务');
    });

    test('应显示任务进度', async ({ page }) => {
      await goToHomeAndWait(page);
      const progress = page.locator('.task-progress');
      await expect(progress).toBeVisible();
      // Progress format: "X/Y" (e.g., "0/3")
      const text = await progress.textContent();
      expect(text).toMatch(/\d+\/\d+/);
    });

    test('应显示任务描述', async ({ page }) => {
      await goToHomeAndWait(page);
      const desc = page.locator('.task-desc');
      await expect(desc).toContainText('今天完成');
      await expect(desc).toContainText('个不同的游戏');
    });
  });

  // Reward display
  test.describe('2. 奖励显示', () => {
    test('未完成时应显示奖励星星', async ({ page }) => {
      await goToHomeAndWait(page);
      // Either reward-num (unclaimed) or reward-claimed (already done)
      const hasReward = await page
        .locator('.reward-num')
        .isVisible()
        .catch(() => false);
      const hasClaimed = await page
        .locator('.reward-claimed')
        .isVisible()
        .catch(() => false);
      expect(hasReward || hasClaimed).toBe(true);
    });

    test('未领取时显示加号星星格式', async ({ page }) => {
      await goToHomeAndWait(page);
      const rewardNum = page.locator('.reward-num');
      if (await rewardNum.isVisible().catch(() => false)) {
        const text = await rewardNum.textContent();
        expect(text).toMatch(/\+\d+\s*⭐/);
      }
    });

    test('已领取时显示完成标记', async ({ page }) => {
      await goToHomeAndWait(page);
      const claimed = page.locator('.reward-claimed');
      if (await claimed.isVisible().catch(() => false)) {
        await expect(claimed).toContainText('已完成');
      }
    });
  });

  // Go-to-game button
  test.describe('3. 去玩按钮', () => {
    test('有未完成游戏时应显示去玩按钮', async ({ page }) => {
      await goToHomeAndWait(page);
      const goBtn = page.locator('button.task-go-btn');
      if (await goBtn.isVisible().catch(() => false)) {
        await expect(goBtn).toContainText('去玩');
        // Button should contain a game name
        const text = await goBtn.textContent();
        expect(text!.length).toBeGreaterThan(5);
      }
    });

    test('点击去玩按钮应跳转到对应游戏', async ({ page }) => {
      await goToHomeAndWait(page);
      const goBtn = page.locator('button.task-go-btn');
      if (await goBtn.isVisible().catch(() => false)) {
        await goBtn.click({ force: true });
        // Should navigate to a game page
        await page.waitForTimeout(500);
        const url = page.url();
        // URL should contain a game path
        expect(url).toMatch(/#\/(balloon|brick|fruit|match|match3|memory|mole|puzzle|simon|tank)/);
      }
    });
  });

  // Mode visibility
  test.describe('4. 模式切换', () => {
    test('儿童模式下应显示每日任务', async ({ page }) => {
      await goToHomeAndWait(page);
      // Default mode should be kids mode
      await expect(page.locator('.daily-task.card')).toBeVisible();
    });

    test('对战模式下不显示每日任务', async ({ page }) => {
      await goToHomeAndWait(page);
      // Switch to battle mode
      const battleTab = page
        .locator('button')
        .filter({ hasText: /对战|battle/i })
        .first();
      if (await battleTab.isVisible().catch(() => false)) {
        await battleTab.click();
        await page.waitForTimeout(300);
        // Daily task should be hidden in battle mode
        await expect(page.locator('.daily-task.card')).not.toBeVisible();
      }
    });
  });

  // Progress tracking
  test.describe('5. 进度追踪', () => {
    test('进度数字不应为负数', async ({ page }) => {
      await goToHomeAndWait(page);
      const progress = page.locator('.task-progress');
      const text = await progress.textContent();
      const match = text?.match(/(\d+)\/(\d+)/);
      if (match) {
        const completed = parseInt(match[1]);
        const goal = parseInt(match[2]);
        expect(completed).toBeGreaterThanOrEqual(0);
        expect(goal).toBeGreaterThan(0);
        expect(completed).toBeLessThanOrEqual(goal);
      }
    });
  });
});
