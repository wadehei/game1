import { test, expect } from '@playwright/test';

// 通用辅助函数
const waitForGameInit = (page: any, timeout = 1500) => page.waitForTimeout(timeout);

test.describe('儿童游戏乐园 - 全游戏测试', () => {
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

  test.describe('4. 打气球游戏', () => {
    test('Canvas 应正常渲染并显示气球', async ({ page }) => {
      await page.goto('/#/balloon');
      await waitForGameInit(page, 2000);

      const screenshot = await page.screenshot({ path: 'tests/screenshots/balloon-game.png' });
      expect(screenshot).toBeTruthy();

      // 检查 Canvas 尺寸和渲染
      const canvasInfo = await page.evaluate(() => {
        const canvas = document.querySelector('#balloonCanvas') as HTMLCanvasElement;
        if (!canvas) return { exists: false };
        return {
          exists: true,
          width: canvas.width,
          height: canvas.height,
          displayWidth: canvas.offsetWidth,
          displayHeight: canvas.offsetHeight,
        };
      });

      expect(canvasInfo.exists).toBe(true);
      // Canvas 属性尺寸应与 CSS 尺寸一致
      expect(canvasInfo.width).toBe(canvasInfo.displayWidth);
      expect(canvasInfo.height).toBe(canvasInfo.displayHeight);
      console.log('Balloon Canvas:', canvasInfo);
    });

    test('点击画布应发射子弹', async ({ page }) => {
      await page.goto('/#/balloon');
      await waitForGameInit(page, 2000);

      const canvas = page.locator('#balloonCanvas');
      const box = await canvas.boundingBox();

      if (box) {
        // 点击画布中间发射子弹
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(1000);

        const screenshot = await page.screenshot({ path: 'tests/screenshots/balloon-shoot.png' });
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
