/**
 * 游戏注册表契约测试（后端侧）— shared/gameRegistry 是唯一数据源
 *
 * 后端运行时不依赖 shared 包（部署链路有意解耦），由本测试在测试期对齐：
 * GAME_RULES / LEVEL_FIELDS / ws registry 与注册表任何漂移直接红灯。
 * 历史事故：GAME_RULES 漏 match 致进度上报 400 上过生产；knownGames 曾漏 match。
 */
import { describe, expect, it } from 'vitest';
import {
  SINGLE_PLAYER_GAMES,
  SINGLE_PLAYER_GAME_IDS,
} from '../../../packages/shared/src/gameRegistry';
import { GAME_TYPES } from '../../../packages/shared/src/types/common';
import { ACHIEVEMENTS, GAME_RULES } from '../../src/services/achievementService';
import { LEVEL_FIELDS } from '../../src/controllers/levelController';
import { gameHandlers } from '../../src/ws/games/registry';

const registryIds = [...SINGLE_PLAYER_GAME_IDS];
const sorted = (arr: readonly string[]): string[] => [...arr].sort();

describe('后端游戏注册表契约（漂移即红）', () => {
  it('GAME_RULES 与注册表 id 完全一致（漏登记=进度上报 400 事故重演）', () => {
    expect(sorted(Object.keys(GAME_RULES))).toEqual(sorted(registryIds));
  });

  it('GAME_RULES 计分方向与注册表一致（lowerScoreIsBetter）', () => {
    for (const reg of SINGLE_PLAYER_GAMES) {
      expect(GAME_RULES[reg.id], `GAME_RULES 缺少 ${reg.id}`).toBeTruthy();
      expect(GAME_RULES[reg.id]?.lowerScoreIsBetter, `${reg.id} 计分方向不一致`).toBe(
        reg.lowerScoreIsBetter
      );
    }
  });

  it('LEVEL_FIELDS 与注册表 id 完全一致（难度覆盖白名单）', () => {
    expect(sorted(Object.keys(LEVEL_FIELDS))).toEqual(sorted(registryIds));
  });

  it('全能玩家成就 desc 与 GAME_RULES 数量动态一致（曾三次硬编码漂移）', () => {
    const a = ACHIEVEMENTS.find((x) => x.id === 'all_rounder');
    expect(a?.desc).toBe(`玩过全部 ${Object.keys(GAME_RULES).length} 个游戏`);
  });

  it('对战 ws registry 与 shared GAME_TYPES 完全一致', () => {
    expect(sorted(Object.keys(gameHandlers))).toEqual(sorted([...GAME_TYPES]));
  });
});
