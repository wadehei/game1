/**
 * E2E 测试通用 Mock API 函数
 *
 * 提取自 battle.spec.ts 和 chips.spec.ts 的重复 mock 逻辑
 */

import type { Page } from '@playwright/test';
import { CHIPS, type TestUser } from './constants';

// ─── Mock 选项类型 ───────────────────────────────────────
export interface MockUserInfoOptions {
  nickname?: string;
  battleChips?: number;
  level?: number;
}

export interface MockBattleCareerOptions {
  chips?: number;
  games?: unknown[];
  recent?: unknown[];
}

export interface MockDailyReliefOptions {
  claimed?: boolean;
  chips?: number;
}

// ─── 用户信息 Mock ───────────────────────────────────────
export async function mockUserInfo(page: Page, options: MockUserInfoOptions = {}) {
  const { nickname = 'E2E_TestA', battleChips = CHIPS.INITIAL, level = 1 } = options;

  await page.route('**/api/user/info', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        data: {
          id: 1,
          nickname,
          avatar: '🦊',
          level,
          totalStars: 10,
          battleChips,
        },
      }),
    })
  );
}

// ─── 游戏进度 Mock ───────────────────────────────────────
export async function mockGameProgress(page: Page) {
  await page.route('**/api/game/progress**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: [] }),
    })
  );
}

// ─── 对战生涯 Mock ───────────────────────────────────────
export async function mockBattleCareer(page: Page, options: MockBattleCareerOptions = {}) {
  const { chips = CHIPS.INITIAL, games = [], recent = [] } = options;

  await page.route('**/api/user/battle/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        data: { chips, games, recent },
      }),
    })
  );
}

// ─── 每日救济金 Mock ─────────────────────────────────────
export async function mockDailyRelief(page: Page, options: MockDailyReliefOptions = {}) {
  const { claimed = false, chips = CHIPS.DAILY_RELIEF } = options;

  await page.route('**/api/user/daily-relief**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        data: { claimed, chips },
      }),
    })
  );
}

// ─── 组合 Mock 函数 ──────────────────────────────────────
export async function mockAllBattleApis(page: Page, options: MockUserInfoOptions = {}) {
  await mockUserInfo(page, options);
  await mockGameProgress(page);
  await mockBattleCareer(page, { chips: options.battleChips });
}

export async function mockAllChipsApis(page: Page, user: TestUser) {
  await mockUserInfo(page, { nickname: user.nickname });
  await mockGameProgress(page);
  await mockBattleCareer(page);
  await mockDailyRelief(page);
}
