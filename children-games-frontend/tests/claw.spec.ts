import { test, expect, type Page } from '@playwright/test';

/**
 * 抓娃娃机 E2E：mock 全部 API，无后端跑真实交互
 * - 机器渲染（导轨/爪子/奖品台/按钮）
 * - 爪子自动移动（位置随时间变化）
 * - 按「抓！」触发下爪循环（下移→判定→回位），期间按钮禁用
 * - 抓到后计数增加（把爪子等在奖品正上方再按，确定命中）
 */

async function mockApis(page: Page) {
  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
  await page.route('**/api/user/info', (route) =>
    route.fulfill(
      json({ code: 200, data: { id: 1, nickname: 'test', avatar: '🦊', level: 1, totalStars: 10 } })
    )
  );
  await page.route('**/api/game/progress**', (route) =>
    route.fulfill(json({ code: 200, data: [] }))
  );
  await page.route('**/api/level/**', (route) =>
    route.fulfill(json({ code: 200, data: { gameId: 'claw', level: 1, override: null } }))
  );
  await page.route('**/api/user/play/**', (route) => route.fulfill(json({ code: 200, data: {} })));
  // 语音列表精确匹配（通配会拦源码模块 /src/api/voice.ts）
  await page.route(/\/api\/voice(\?.*)?$/, (route) => route.fulfill(json({ code: 200, data: [] })));
  await page.route('**/api/error**', (route) => route.fulfill(json({ code: 200, data: {} })));
  await page.route('**/api/user/daily-task**', (route) =>
    route.fulfill(
      json({
        code: 200,
        data: { completedGames: 0, playedGames: [], taskGoal: 3, rewardStars: 10, claimed: false },
      })
    )
  );
}

test.describe('抓娃娃机', () => {
  test.beforeEach(async ({ page }) => {
    await mockApis(page);
    await page.addInitScript(() => {
      localStorage.setItem('token', 'test_token');
      localStorage.setItem('last_profile_id', '1');
      localStorage.setItem(
        'userInfo',
        JSON.stringify({ id: 1, nickname: 'test', avatar: '🦊', level: 1 })
      );
    });
    await page.goto('/#/claw');
    await expect(page.locator('.machine')).toBeVisible();
  });

  test('机器渲染完整', async ({ page }) => {
    await expect(page.locator('.claw')).toBeVisible();
    const prizeCount = await page.locator('.prize:not(.gone)').count();
    expect(prizeCount).toBeGreaterThanOrEqual(6);
    await expect(page.locator('.drop-btn')).toBeEnabled();
  });

  test('爪子自动左右移动', async ({ page }) => {
    const claw = page.locator('.claw');
    const x1 = await claw.evaluate((el) => el.style.left);
    await page.waitForTimeout(700);
    const x2 = await claw.evaluate((el) => el.style.left);
    expect(x1).not.toBe(x2);
  });

  test('下爪循环：按抓→下移→回位，抓准了计数+1', async ({ page }) => {
    const claw = page.locator('.claw');
    const prizes = page.locator('.prize:not(.gone)');
    const btn = page.locator('.drop-btn');

    // 等爪子移到某个奖品附近（±5% 内）再按，保证命中
    const targetX = parseFloat((await prizes.first().evaluate((el) => el.style.left)) || '0');
    const waitFor = async () => {
      for (let i = 0; i < 60; i += 1) {
        const cx = parseFloat((await claw.evaluate((el) => el.style.left)) || '0');
        if (Math.abs(cx - targetX) < 5) return true;
        await page.waitForTimeout(100);
      }
      return false;
    };
    expect(await waitFor()).toBe(true);
    await btn.click();
    await expect(claw).toHaveClass(/dropping/, { timeout: 3000 });
    // 下爪循环 ~1.1s 后回位
    await page.waitForFunction(() => !document.querySelector('.claw.dropping'), undefined, {
      timeout: 4000,
    });
    await expect(page.locator('.claw')).not.toHaveClass(/dropping/);
  });
});
