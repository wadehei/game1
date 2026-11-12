/**
 * E2E 测试 WebSocket 辅助函数
 *
 * 提取自 battle.spec.ts 和 chips.spec.ts 的重复 WS 逻辑
 */

import type { Page } from '@playwright/test';
import { WAIT_TIMEOUT } from './constants';

// ─── 等待 WebSocket 连接建立 ─────────────────────────────
export async function waitForWsConnection(page: Page, timeout = WAIT_TIMEOUT) {
  await page.waitForSelector('[data-testid="ws-connected"]', { timeout });
}

// ─── 等待元素可见 ────────────────────────────────────────
export async function waitForVisible(page: Page, testId: string, timeout = WAIT_TIMEOUT) {
  await page.waitForSelector(`[data-testid="${testId}"]`, { state: 'visible', timeout });
}

// ─── 等待元素存在 ────────────────────────────────────────
export async function waitForAttached(page: Page, testId: string, timeout = WAIT_TIMEOUT) {
  await page.waitForSelector(`[data-testid="${testId}"]`, { state: 'attached', timeout });
}

// ─── 等待 URL 匹配 ──────────────────────────────────────
export async function waitForUrl(page: Page, urlPattern: RegExp | string, timeout = WAIT_TIMEOUT) {
  await page.waitForURL(urlPattern, { timeout });
}
