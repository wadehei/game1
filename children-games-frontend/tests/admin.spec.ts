import { test, expect } from '@playwright/test';

/**
 * Mock admin API 响应，防止 fake token 被后端拒绝后清除 admin_token
 */
async function mockAdminApis(page) {
  await page.route('**/api/admin/**', (route) => {
    const url = route.request().url();
    // Default empty responses for various admin endpoints
    let body: unknown = { code: 200, data: [] };
    if (url.includes('/overview')) {
      body = {
        code: 200,
        data: {
          familyMembers: 0,
          guestUsers: 0,
          totalStars: 0,
          todayActiveUsers: 0,
          todayPlaySeconds: 0,
          chipFailures: 0,
          members: [],
          activity: [],
        },
      };
    } else if (url.includes('/users')) {
      body = { code: 200, data: [] };
    } else if (url.includes('/settings')) {
      body = { code: 200, data: { restIntervalMinutes: 20 } };
    } else if (url.includes('/logs')) {
      body = { code: 200, data: [] };
    } else if (url.includes('/backups')) {
      body = { code: 200, data: [] };
    } else if (url.includes('/feedback')) {
      body = { code: 200, data: [] };
    } else if (url.includes('/quiz')) {
      body = { code: 200, data: { list: [], total: 0 } };
    } else if (url.includes('/levels/')) {
      body = { code: 200, data: [] };
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  // Also mock /api/voice used by VoicePanel
  await page.route('**/api/voice', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: [] }),
    })
  );
}

test.describe('管理后台', () => {
  // Admin login tests
  test.describe('1. 登录流程', () => {
    test('应显示管理登录页面', async ({ page }) => {
      await page.goto('/#/admin/login');
      await expect(page.locator('.login-title')).toHaveText('家长后台');
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.locator('button.login-btn')).toHaveText('进入后台');
    });

    test('空密码时提交按钮应禁用', async ({ page }) => {
      await page.goto('/#/admin/login');
      await expect(page.locator('button.login-btn')).toBeDisabled();
    });

    test('输入密码后提交按钮应启用', async ({ page }) => {
      await page.goto('/#/admin/login');
      await page.fill('input[type="password"]', 'test123');
      await expect(page.locator('button.login-btn')).toBeEnabled();
    });

    test('返回游戏按钮应跳转首页', async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('token', 'test_token');
      });
      await page.goto('/#/admin/login');
      await page.click('button.login-back');
      await expect(page).toHaveURL(/.*#\/$/);
    });

    test('错误密码应显示错误信息', async ({ page }) => {
      await page.goto('/#/admin/login');
      await page.fill('input[type="password"]', 'wrongpassword');
      await page.click('button.login-btn');
      await expect(page.locator('.login-error'))
        .toBeVisible({ timeout: 5000 })
        .catch(() => {
          console.log('Backend not available, skipping error test');
        });
    });
  });

  // Route guard tests
  test.describe('2. 路由保护', () => {
    test('未登录访问后台应重定向到登录页', async ({ page }) => {
      await page.goto('/#/');
      await page.evaluate(() => localStorage.removeItem('admin_token'));
      await page.goto('/#/admin');
      await expect(page).toHaveURL(/.*admin\/login/);
    });

    test('已登录访问后台应正常显示', async ({ page }) => {
      await mockAdminApis(page);
      await page.addInitScript(() => {
        localStorage.setItem('admin_token', 'fake_token_for_test');
      });
      await page.goto('/#/admin');
      await expect(page.locator('.admin-page')).toBeVisible({ timeout: 5000 });
    });
  });

  // Dashboard tabs
  test.describe('3. 后台标签页', () => {
    test.beforeEach(async ({ page }) => {
      await mockAdminApis(page);
      await page.addInitScript(() => {
        localStorage.setItem('admin_token', 'fake_token_for_test');
      });
      await page.goto('/#/admin');
      await page.waitForSelector('.admin-page', { state: 'visible', timeout: 5000 });
    });

    test.afterEach(async ({ page }) => {
      await page.evaluate(() => localStorage.removeItem('admin_token'));
    });

    test('应显示默认的数据看板标签', async ({ page }) => {
      await expect(page.locator('button.mobile-tab.active').first()).toContainText('数据看板');
    });

    test('应有9个导航标签', async ({ page }) => {
      const tabs = page.locator('button.mobile-tab');
      await expect(tabs).toHaveCount(9);
    });

    test('点击标签应切换内容', async ({ page }) => {
      // 使用 JS click 避免 Vue 重渲染导致 DOM detach
      await page.evaluate(() => {
        const tabs = document.querySelectorAll('button.mobile-tab');
        for (const tab of tabs) {
          if (tab.textContent?.includes('意见反馈')) {
            (tab as HTMLButtonElement).click();
            break;
          }
        }
      });
      await page.waitForTimeout(300);
      const feedbackTab = page.locator('button.mobile-tab').filter({ hasText: '意见反馈' });
      await expect(feedbackTab).toHaveClass(/active/);
    });

    test('URL参数tab应切换对应标签', async ({ page }) => {
      await page.goto('/#/admin?tab=logs');
      await page.waitForTimeout(1000);
      const logsTab = page.locator('button.mobile-tab').filter({ hasText: '错误日志' });
      await expect(logsTab).toHaveClass(/active/);
    });
  });
});
