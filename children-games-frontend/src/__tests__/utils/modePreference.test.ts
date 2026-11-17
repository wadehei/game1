/**
 * 3D 模式偏好工具单测
 * 解析顺序：游戏内显式切换 > 家长中心全局默认 > 2D
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  get3dDefault,
  set3dDefault,
  getGameMode,
  setGameMode,
  maybeShow3dHint,
} from '../../utils/modePreference';

describe('modePreference', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('默认一切为 2D（方案红线：默认 2D）', () => {
    expect(get3dDefault()).toBe('2d');
    expect(getGameMode('memory')).toBe('2d');
  });

  it('家长中心全局默认生效', () => {
    set3dDefault('3d');
    expect(get3dDefault()).toBe('3d');
    expect(getGameMode('mole')).toBe('3d');
    set3dDefault('2d');
    expect(getGameMode('mole')).toBe('2d');
  });

  it('游戏内显式切换覆盖全局默认', () => {
    set3dDefault('2d');
    setGameMode('simon', '3d');
    expect(getGameMode('simon')).toBe('3d');
    expect(getGameMode('memory')).toBe('2d'); // 其他游戏不受影响
  });

  it('legacy key 兼容读取（3D 批之前的按游戏记忆）', () => {
    localStorage.setItem('gomoku_board_mode', '3d');
    expect(getGameMode('gomoku', 'gomoku_board_mode')).toBe('3d');
    // 新 key 优先于 legacy
    setGameMode('gomoku', '2d');
    expect(getGameMode('gomoku', 'gomoku_board_mode')).toBe('2d');
  });

  it('非法存储值按 2D 兜底', () => {
    localStorage.setItem('mode3d_claw', 'xyz');
    expect(getGameMode('claw')).toBe('2d');
    localStorage.setItem('mode3d_default', 'yes');
    expect(get3dDefault()).toBe('2d');
  });

  it('maybeShow3dHint 只提示一次且 3D 模式下不提示', () => {
    expect(maybeShow3dHint('memory')).toBe(true);
    expect(maybeShow3dHint('memory')).toBe(false); // 第二次不弹
    setGameMode('match3', '3d');
    expect(maybeShow3dHint('match3')).toBe(false); // 已在 3D 模式不弹
  });
});
