import { Request, Response } from 'express';
import { LevelConfig } from '../models';
import { success, asyncHandler } from '../utils/response';

// 获取关卡配置
export const getLevelConfig = asyncHandler(async (req: Request, res: Response) => {
  const { gameId } = req.params;
  const level = parseInt(req.query.level as string) || 1;
  const gameIdStr = gameId as string;

  const config = await LevelConfig.findOne({
    where: { gameId: gameIdStr, level },
  });

  if (!config) {
    // 返回默认配置
    const defaultConfig = getDefaultLevelConfig(gameIdStr, level);
    success(res, defaultConfig);
    return;
  }

  success(res, {
    gameId: config.gameId,
    level: config.level,
    config: JSON.parse(config.config),
  });
});

// 默认关卡配置
function getDefaultLevelConfig(gameId: string, level: number) {
  const configs: Record<string, any> = {
    memory: {
      pairs: Math.min(2 + Math.floor(level / 3), 8),
      timeLimit: 60,
    },
    fruit: {
      speed: 2 + level * 0.2,
      bombRate: Math.min(0.05 + level * 0.01, 0.2),
      targetScore: 50 + level * 20,
    },
    puzzle: {
      gridSize: Math.min(3 + Math.floor(level / 5), 5),
      timeLimit: 120,
    },
    balloon: {
      spawnRate: Math.max(1000 - level * 20, 400),
      moveSpeed: 1 + level * 0.1,
      targetScore: 100 + level * 30,
    },
    tank: {
      enemyCount: 3 + level,
      enemySpeed: 1 + level * 0.15,
      bossLevel: level % 5 === 0,
    },
  };

  return {
    gameId,
    level,
    config: configs[gameId] || {},
  };
}
