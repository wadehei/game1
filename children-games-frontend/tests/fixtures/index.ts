/**
 * E2E 测试 fixtures 索引
 *
 * 提供统一的导入入口
 */

// 常量
export {
  WAIT_TIMEOUT,
  SHORT_WAIT,
  TEST_USERS,
  CHIPS,
  GAME_TYPES,
  type GameType,
  type TestUser,
} from './constants';

// Mock API
export {
  mockUserInfo,
  mockGameProgress,
  mockBattleCareer,
  mockDailyRelief,
  mockAllBattleApis,
  mockAllChipsApis,
  type MockUserInfoOptions,
  type MockBattleCareerOptions,
  type MockDailyReliefOptions,
} from './mock-apis';

// 认证辅助
export { setupAuthAndGoto, setupDualAuth } from './auth-helpers';

// WebSocket 辅助
export { waitForWsConnection, waitForVisible, waitForAttached, waitForUrl } from './ws-helpers';
