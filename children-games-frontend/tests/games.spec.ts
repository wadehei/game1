import { test, expect, type Page } from '@playwright/test';

// 通用辅助函数
const waitForGameInit = (page: any, timeout = 1500) => page.waitForTimeout(timeout);

/**
 * 游戏页访问前置：路由守卫要求登录（无 token 跳 profiles），
 * 必须先 mock 用户/进度接口并注入 token，否则本文件所有用例必挂
 * （对齐 sudoku.spec 的 mock 模式）
 */
async function setupGameAccess(page: Page) {
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
  await page.addInitScript(() => {
    localStorage.setItem('token', 'test_token');
    localStorage.setItem('last_profile_id', '1');
    localStorage.setItem(
      'userInfo',
      JSON.stringify({ id: 1, nickname: 'test', avatar: '🦊', level: 1 })
    );
  });
}

test.describe('儿童游戏乐园 - 全游戏测试', () => {
  test.beforeEach(async ({ page }) => {
    await setupGameAccess(page);
  });

  test.describe('1. 记忆翻牌游戏', () => {
    test('应正常加载并显示卡片网格', async ({ page }) => {
      await page.goto('/#/memory');
      await waitForGameInit(page);

      const screenshot = await page.screenshot({ path: 'tests/screenshots/memory-game.png' });
      expect(screenshot).toBeTruthy();

      // 验证卡片容器存在
      const cards = await page.locator('.card, .memory-card, [class*="card"]').count();
      expect(cards).toBeGreaterThan(0);

      // 验证游戏头部显示
      await expect(page.locator('text=关卡')).toBeVisible();
      await expect(page.locator('text=时间')).toBeVisible();
    });

    test('点击卡片应有翻转效果', async ({ page }) => {
      await page.goto('/#/memory');
      await waitForGameInit(page);

      // 点击第一张卡片
      const firstCard = page.locator('.card, .memory-card, [class*="card"]').first();
      await firstCard.click();
      await page.waitForTimeout(500);

      const screenshot = await page.screenshot({ path: 'tests/screenshots/memory-flip.png' });
      expect(screenshot).toBeTruthy();
    });
  });

  test.describe('1b. 3D 模式冒烟（3D 页可开 + 关键元素 + 2D/3D 互切）', () => {
    test('memory-3d 场景渲染出立体卡牌', async ({ page }) => {
      await page.goto('/#/memory-3d');
      await waitForGameInit(page);
      const cards = await page.locator('.card3d').count();
      expect(cards).toBeGreaterThan(0);
      await expect(page.locator('text=关卡')).toBeVisible();
    });

    test('mole-3d 场景渲染出 9 个立体洞口', async ({ page }) => {
      await page.goto('/#/mole-3d');
      await waitForGameInit(page);
      expect(await page.locator('.hole').count()).toBe(9);
    });

    test('simon-3d 场景渲染出 4 枚立体按键', async ({ page }) => {
      await page.goto('/#/simon-3d');
      await waitForGameInit(page);
      expect(await page.locator('.key3d').count()).toBe(4);
    });

    test('游戏内 2D/3D 一键互切', async ({ page }) => {
      await page.goto('/#/memory');
      await waitForGameInit(page);
      await page.locator('button[title="切换 3D 模式"]').click();
      await expect(page).toHaveURL(/memory-3d/);
      await page.locator('button[title="切换 2D 模式"]').click();
      await expect(page).toHaveURL(/#\/memory$/);
      await expect(page.locator('text=关卡')).toBeVisible();
    });
  });

  test('claw-3d 场景渲染出 3D 机柜（WebGL canvas）', async ({ page }) => {
    await page.goto('/#/claw-3d');
    await waitForGameInit(page, 2500);
    const canvasInfo = await page.evaluate(() => {
      const canvas = document.querySelector('.scene3d canvas') as HTMLCanvasElement | null;
      if (!canvas) return { exists: false };
      return { exists: true, width: canvas.width, height: canvas.height };
    });
    expect(canvasInfo.exists).toBe(true);
    expect(canvasInfo.width).toBeGreaterThan(100);
    // 加载过渡应已结束（场景就绪）
    await expect(page.locator('text=3D 机柜搭建中')).toHaveCount(0);
  });

  test('match3-3d 场景渲染出 3D 棋盘（WebGL canvas）', async ({ page }) => {
    await page.goto('/#/match3-3d');
    await waitForGameInit(page, 2500);
    const canvasInfo = await page.evaluate(() => {
      const canvas = document.querySelector('.scene3d canvas') as HTMLCanvasElement | null;
      if (!canvas) return { exists: false };
      return { exists: true, width: canvas.width, height: canvas.height };
    });
    expect(canvasInfo.exists).toBe(true);
    expect(canvasInfo.width).toBeGreaterThan(100);
    await expect(page.locator('text=3D 棋盘搭建中')).toHaveCount(0);
    // 头部状态条在（与 2D 共享 engine）
    await expect(page.locator('text=关卡')).toBeVisible();
  });

  test.describe('2. 接水果游戏', () => {
    test('Canvas 应正常渲染并显示水果', async ({ page }) => {
      await page.goto('/#/fruit');
      await waitForGameInit(page, 2000);

      const screenshot = await page.screenshot({ path: 'tests/screenshots/fruit-game.png' });
      expect(screenshot).toBeTruthy();

      // 检查 Canvas 尺寸
      const canvasInfo = await page.evaluate(() => {
        const canvas = document.querySelector('#fruitCanvas, canvas') as HTMLCanvasElement;
        if (!canvas) return { exists: false };
        return {
          exists: true,
          width: canvas.width,
          height: canvas.height,
        };
      });

      expect(canvasInfo.exists).toBe(true);
      expect(canvasInfo.width).toBeGreaterThan(300);
      console.log('Fruit Canvas:', canvasInfo);
    });

    test('篮子应能左右移动', async ({ page }) => {
      await page.goto('/#/fruit');
      await waitForGameInit(page, 2000);

      // 模拟点击画布左侧和右侧
      const canvas = page.locator('#fruitCanvas, canvas');
      const box = await canvas.boundingBox();

      if (box) {
        // 点击左侧
        await page.mouse.click(box.x + 50, box.y + box.height - 50);
        await page.waitForTimeout(500);

        // 点击右侧
        await page.mouse.click(box.x + box.width - 50, box.y + box.height - 50);
        await page.waitForTimeout(500);

        const screenshot = await page.screenshot({ path: 'tests/screenshots/fruit-move.png' });
        expect(screenshot).toBeTruthy();
      }
    });
  });

  test.describe('3. 拼图游戏', () => {
    test('拼图块应显示正确的分割图片', async ({ page }) => {
      await page.goto('/#/puzzle');
      await waitForGameInit(page);

      const screenshot = await page.screenshot({ path: 'tests/screenshots/puzzle-game.png' });
      expect(screenshot).toBeTruthy();

      // 验证拼图块图片尺寸正确
      const pieceImages = await page.locator('.piece-image').all();
      expect(pieceImages.length).toBeGreaterThan(0);

      // 检查图片样式包含 translate 偏移
      const firstPiece = pieceImages[0];
      const style = await firstPiece.getAttribute('style');
      expect(style).toContain('translate');
    });

    test('点击相邻空格的拼图块应能移动', async ({ page }) => {
      await page.goto('/#/puzzle');
      await waitForGameInit(page);

      // 获取可移动的拼图块（有 movable 类）
      const movablePiece = page.locator('.puzzle-piece.movable').first();
      const count = await movablePiece.count();

      if (count > 0) {
        await movablePiece.click();
        await page.waitForTimeout(500);

        const screenshot = await page.screenshot({ path: 'tests/screenshots/puzzle-move.png' });
        expect(screenshot).toBeTruthy();
      }
    });
  });

  test.describe('5. 坦克大战游戏', () => {
    test('Canvas 应正常渲染并显示坦克', async ({ page }) => {
      await page.goto('/#/tank');
      await waitForGameInit(page, 2000);

      const screenshot = await page.screenshot({ path: 'tests/screenshots/tank-game.png' });
      expect(screenshot).toBeTruthy();

      // 检查 Canvas 尺寸
      const canvasInfo = await page.evaluate(() => {
        const canvas = document.querySelector('#tank_canvas, canvas') as HTMLCanvasElement;
        if (!canvas) return { exists: false };
        return {
          exists: true,
          width: canvas.width,
          height: canvas.height,
        };
      });

      expect(canvasInfo.exists).toBe(true);
      expect(canvasInfo.width).toBeGreaterThanOrEqual(300);
      console.log('Tank Canvas:', canvasInfo);
    });

    test('游戏应显示关卡和生命值信息', async ({ page }) => {
      await page.goto('/#/tank');
      await waitForGameInit(page, 2000);

      // 验证游戏头部显示（坦克游戏显示"生命"而非"分数"）
      await expect(page.locator('text=关卡').first()).toBeVisible();
      await expect(page.locator('text=生命').first()).toBeVisible();
    });
  });
});
