import { storage } from './storage';

/**
 * 3D 模式偏好（方案护栏 1：默认 2D，家长可在设置里设默认）
 * 解析顺序：游戏内显式切换（按游戏记忆）> 家长中心全局默认 > 2D
 */
const DEFAULT_KEY = 'mode3d_default';

export type Mode3d = '2d' | '3d';

export const get3dDefault = (): Mode3d => (storage.getItem(DEFAULT_KEY) === '3d' ? '3d' : '2d');

export const set3dDefault = (mode: Mode3d): void => {
  storage.setItem(DEFAULT_KEY, mode);
};

/**
 * 读取某游戏当前应处的模式。
 * @param legacyKey 3D 批之前已存在的按游戏记忆 key（如 gomoku_board_mode），仅读不写，兼容老用户
 */
export const getGameMode = (gameId: string, legacyKey?: string): Mode3d => {
  const perGame =
    storage.getItem(`mode3d_${gameId}`) ?? (legacyKey ? storage.getItem(legacyKey) : null);
  if (perGame === '2d' || perGame === '3d') {
    return perGame;
  }
  return get3dDefault();
};

export const setGameMode = (gameId: string, mode: Mode3d): void => {
  storage.setItem(`mode3d_${gameId}`, mode);
};

/**
 * 首次进入 2D 版时提示一次 3D 入口（发现性：首页之外孩子/家长不知道有 3D）
 * @returns 是否真的弹了提示（供调用方测试）
 */
export const maybeShow3dHint = (gameId: string, legacyKey?: string): boolean => {
  if (getGameMode(gameId, legacyKey) === '3d') {
    return false;
  }
  const HINT_KEY = 'hint3d_shown';
  if (storage.getItem(HINT_KEY)) {
    return false;
  }
  storage.setItem(HINT_KEY, '1');
  return true;
};
