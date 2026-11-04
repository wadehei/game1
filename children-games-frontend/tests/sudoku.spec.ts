import { test, expect, type Page } from '@playwright/test';

/**
 * 动物数独 E2E：mock 全部 API，无后端跑真实交互
 * - 盘面渲染（4×4、含预填格、符号盘 4 键）
 * - 放置/冲突标红/擦除
 * - 测试内自解谜盘 → 全填对 → 通关弹窗（星级/进度保存被 mock 接住）
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
    route.fulfill(json({ code: 200, data: { gameId: 'sudoku', level: 1, override: null } }))
  );
  await page.route('**/api/user/play/**', (route) => route.fulfill(json({ code: 200, data: {} })));
  // 精确匹配 /api/voice（勿用 ** 通配：会误伤源码模块 /src/api/voice.ts 导致整图白屏）
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

async function injectAuth(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'test_token');
    localStorage.setItem('last_profile_id', '1');
    localStorage.setItem(
      'userInfo',
      JSON.stringify({ id: 1, nickname: 'test', avatar: '🦊', level: 1 })
    );
  });
}

/** 从 DOM 读盘面并在测试内解 4×4（胜利判定=填满且无冲突，任意合法解均可） */
async function solveBoard(page: Page): Promise<number[][]> {
  const size = 4;
  const cells = page.locator('.sudoku-board .cell');
  const board: number[][] = [];
  for (let i = 0; i < size * size; i += 1) {
    const text = await cells.nth(i).textContent();
    board.push(0);
    void text;
  }
  // 给定格的动物 → 值映射：按符号盘顺序
  const palette = page.locator('.symbol-palette .palette-btn .palette-emoji');
  const symbols: string[] = [];
  for (let i = 0; i < (await palette.count()); i += 1)
    symbols.push((await palette.nth(i).textContent()) || '');
  const valOf = (emoji: string): number => symbols.indexOf(emoji) + 1;

  const given: number[] = [];
  for (let i = 0; i < size * size; i += 1) {
    const text = (await cells.nth(i).textContent()) || '';
    given.push(text.trim() ? valOf(text.trim()) : 0);
  }

  // 回溯解 4×4（2×2 宫）
  const fits = (g: number[], idx: number, v: number): boolean => {
    const r = Math.floor(idx / size);
    const c = idx % size;
    for (let k = 0; k < size; k += 1) {
      if (g[r * size + k] === v || g[k * size + c] === v) return false;
    }
    const r0 = Math.floor(r / 2) * 2;
    const c0 = Math.floor(c / 2) * 2;
    for (let i = 0; i < 2; i += 1)
      for (let j = 0; j < 2; j += 1) if (g[(r0 + i) * size + c0 + j] === v) return false;
    return true;
  };
  const g = [...given];
  const search = (idx: number): boolean => {
    if (idx >= size * size) return true;
    if (g[idx] !== 0) return search(idx + 1);
    for (let v = 1; v <= size; v += 1) {
      if (!fits(g, idx, v)) continue;
      g[idx] = v;
      if (search(idx + 1)) return true;
      g[idx] = 0;
    }
    return false;
  };
  expect(search(0)).toBe(true);
  return g;
}

test.describe('动物数独', () => {
  test.beforeEach(async ({ page }) => {
    await mockApis(page);
    await injectAuth(page);
    await page.goto('/#/sudoku');
    await expect(page.locator('.sudoku-board')).toBeVisible();
  });

  test('渲染 4×4 盘面与 4 键符号盘', async ({ page }) => {
    await expect(page.locator('.sudoku-board .cell')).toHaveCount(16);
    const givenCount = await page.locator('.sudoku-board .cell.given').count();
    expect(givenCount).toBeGreaterThanOrEqual(9); // 第 1 关预填 ≥9
    await expect(page.locator('.symbol-palette .palette-btn')).toHaveCount(4);
  });

  test('放置与冲突标红', async ({ page }) => {
    const cells = page.locator('.sudoku-board .cell');
    // 找一个空格
    let emptyIdx = -1;
    for (let i = 0; i < 16; i += 1) {
      if ((await cells.nth(i).getAttribute('class'))?.includes('given')) continue;
      emptyIdx = i;
      break;
    }
    expect(emptyIdx).toBeGreaterThanOrEqual(0);
    await cells.nth(emptyIdx).click();
    await expect(cells.nth(emptyIdx)).toHaveClass(/selected/);

    // 放一个与同行给定值重复的符号（若有同行 given；4×4 首关必有）
    const row = Math.floor(emptyIdx / 4);
    const col = emptyIdx % 4;
    let conflictVal = -1;
    for (let c = 0; c < 4; c += 1) {
      if (c === col) continue;
      const cls = (await cells.nth(row * 4 + c).getAttribute('class')) || '';
      if (!cls.includes('given')) continue;
      const text = ((await cells.nth(row * 4 + c).textContent()) || '').trim();
      if (text) {
        const palette = page.locator('.symbol-palette .palette-btn .palette-emoji');
        for (let p = 0; p < (await palette.count()); p += 1) {
          if ((await palette.nth(p).textContent())?.trim() === text) conflictVal = p;
        }
      }
    }
    if (conflictVal >= 0) {
      await page.locator('.symbol-palette .palette-btn').nth(conflictVal).click();
      await expect(cells.nth(emptyIdx)).toHaveClass(/conflict|wrong/);
      // 擦除：再点同一符号
      await page.locator('.symbol-palette .palette-btn').nth(conflictVal).click();
      await expect(cells.nth(emptyIdx)).not.toHaveText(/\S/);
    }
  });

  test('完整通关流程', async ({ page }) => {
    const solution = await solveBoard(page);
    const palette = page.locator('.symbol-palette .palette-btn');
    const paletteSymbols: string[] = [];
    const emojis = page.locator('.symbol-palette .palette-btn .palette-emoji');
    for (let i = 0; i < (await emojis.count()); i += 1) {
      paletteSymbols.push(((await emojis.nth(i).textContent()) || '').trim());
    }
    const cells = page.locator('.sudoku-board .cell');
    for (let idx = 0; idx < 16; idx += 1) {
      const cls = (await cells.nth(idx).getAttribute('class')) || '';
      if (cls.includes('given')) continue;
      await cells.nth(idx).click();
      await palette.nth(solution[idx] - 1).click();
    }
    await expect(page.getByText('数独完成啦！')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/用时 \d+ 秒/)).toBeVisible();
  });
});
