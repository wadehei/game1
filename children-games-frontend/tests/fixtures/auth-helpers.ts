/**
 * E2E 测试认证辅助函数
 *
 * 提取自 battle.spec.ts 和 chips.spec.ts 的重复认证逻辑
 */

import type { Page } from '@playwright/test';
import { CHIPS } from './constants';
import { mockAllBattleApis, mockAllChipsApis, type MockUserInfoOptions } from './mock-apis';

// ─── 类型定义 ────────────────────────────────────────────
interface SetupAuthOptions extends MockUserInfoOptions {
  /** 要 mock 的 API 范围，默认 'battle' */
  mockScope?: 'battle' | 'chips';
}

// ─── 设置认证并导航到页面 ────────────────────────────────
export async function setupAuthAndGoto(page: Page, path: string, options: SetupAuthOptions = {}) {
  const {
    nickname = 'E2E_TestA',
    battleChips = CHIPS.INITIAL,
    level = 1,
    mockScope = 'battle',
  } = options;

  // 根据范围 mock API
  if (mockScope === 'chips') {
    await mockAllChipsApis(page, { nickname });
  } else {
    await mockAllBattleApis(page, { nickname, battleChips, level });
  }

  // 注入 localStorage
  await page.addInitScript(
    ({ nick, chips, lvl }) => {
      localStorage.setItem('token', 'test_token');
      localStorage.setItem('last_profile_id', '1');
      localStorage.setItem(
        'userInfo',
        JSON.stringify({
          id: 1,
          nickname: nick,
          avatar: '🦊',
          level: lvl,
          battleChips: chips,
        })
      );
    },
    { nick: nickname, chips: battleChips, lvl: level }
  );

  // 导航到目标页面
  await page.goto(`/#${path}`);
  await page.waitForTimeout(1000);
}

// ─── 双用户认证设置（用于完整对战流程测试）──────────────
export async function setupDualAuth(
  contextA: Parameters<Parameters<typeof page.goto>[0]>[0] extends never ? never : any,
  contextB: Parameters<Parameters<typeof page.goto>[0]>[0] extends never ? never : any
) {
  // 用户 A
  const pageA = await contextA.newPage();
  await pageA.addInitScript(() => {
    localStorage.setItem('token', 'test_token_a');
    localStorage.setItem('last_profile_id', '1');
  });

  // 用户 B
  const pageB = await contextB.newPage();
  await pageB.addInitScript(() => {
    localStorage.setItem('token', 'test_token_b');
    localStorage.setItem('last_profile_id', '2');
  });

  return { pageA, pageB };
}
