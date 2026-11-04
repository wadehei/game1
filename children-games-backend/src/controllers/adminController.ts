/**
 * adminController — barrel re-export 兼容层
 *
 * 实际逻辑已拆分到以下子模块：
 * - adminAuthController    — 认证（登录/登出）
 * - adminUserController    — 用户管理
 * - adminSettingsController — 设置/看板/关卡配置
 * - adminQuizController    — 题库管理
 * - adminSystemController  — 系统运维（日志/备份）
 *
 * 路由文件仍从本文件 import，无需修改。
 */

export { adminLogin, adminLogout } from './adminAuthController';

export {
  getUsers,
  updateUser,
  adjustUserChips,
  resetUserProgress,
  deleteUser,
  clearUserPin,
} from './adminUserController';

export {
  getOverview,
  getSettings,
  getPublicSettings,
  updateSettings,
  getLevelOverrides,
  saveLevelOverride,
  deleteLevelOverride,
} from './adminSettingsController';

export { quizList, quizCreate, quizUpdate, quizDelete, quizImport } from './adminQuizController';

export {
  getErrorLogs,
  clearErrorLogs,
  downloadBackup,
  listAutoBackups,
} from './adminSystemController';
