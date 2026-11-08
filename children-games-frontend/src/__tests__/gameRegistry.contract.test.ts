/**
 * 游戏注册表契约测试（前端侧）— shared/gameRegistry 是唯一数据源
 *
 * 任何一处漂移（漏登记/多登记/计分方向不一致/缺路由/缺难度公式）这里直接红灯。
 * 历史事故：GAME_RULES 漏 match 致进度上报 400 上过生产；成就 desc 硬编码 8/11/13 三次漂移。
 */
import { describe, expect, it } from 'vitest';
import { SINGLE_PLAYER_GAMES, SINGLE_PLAYER_GAME_IDS } from '@children-games/shared';
import { GAMES } from '@/utils/gameMeta';
import { games as CATALOG } from '@/utils/gameCatalog';
import { LEVEL_FIELD_DEFS, defaultLevelConfig } from '@/utils/levelDefaults';
import router from '@/router';

const registryIds = [...SINGLE_PLAYER_GAME_IDS];
const sorted = (arr: readonly string[]): string[] => [...arr].sort();

describe('前端游戏注册表契约（漂移即红）', () => {
  it('gameMeta.GAMES 与注册表 id 完全一致', () => {
    expect(sorted(GAMES.map((g) => g.id))).toEqual(sorted(registryIds));
  });

  it('gameMeta.GAMES 计分方向与注册表一致（lowerBetter === lowerScoreIsBetter）', () => {
    for (const reg of SINGLE_PLAYER_GAMES) {
      const meta = GAMES.find((g) => g.id === reg.id);
      expect(meta, `gameMeta 缺少 ${reg.id}`).toBeTruthy();
      expect(meta?.lowerBetter ?? false, `${reg.id} 计分方向不一致`).toBe(reg.lowerScoreIsBetter);
    }
  });

  it('gameCatalog 与注册表 id 完全一致', () => {
    expect(sorted(CATALOG.map((g) => g.id))).toEqual(sorted(registryIds));
  });

  it('levelDefaults.LEVEL_FIELD_DEFS 与注册表 id 完全一致', () => {
    expect(sorted(Object.keys(LEVEL_FIELD_DEFS))).toEqual(sorted(registryIds));
  });

  it('每个注册游戏都有难度公式（defaultLevelConfig 第 1 关可用）', () => {
    for (const id of registryIds) {
      const cfg = defaultLevelConfig(id, 1);
      expect(cfg, `${id} 缺少难度公式`).toBeTruthy();
      expect(Object.keys(cfg ?? {}).length, `${id} 难度公式为空`).toBeGreaterThan(0);
    }
  });

  it('每个注册游戏都有路由 /{id}', () => {
    const paths = new Set(router.getRoutes().map((r) => r.path));
    for (const id of registryIds) {
      expect(paths.has(`/${id}`), `路由缺少 /${id}`).toBe(true);
    }
  });

  it('注册表自身无重复 id', () => {
    expect(new Set(registryIds).size).toBe(registryIds.length);
  });
});
