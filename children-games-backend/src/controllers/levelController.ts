import { Request, Response } from 'express';
import { LevelConfig } from '../models';
import { success, fail, asyncHandler } from '../utils/response';

/** 各游戏允许覆盖的配置字段（与前端 levelConfig 字段一一对应） */
export const LEVEL_FIELDS: Record<string, string[]> = {
  memory: ['pairs', 'timeLimit'],
  fruit: ['spawnRate', 'fallSpeed', 'bombChance', 'targetScore'],
  puzzle: ['gridSize', 'timeLimit'],
  balloon: ['spawnRate', 'moveSpeed', 'targetScore', 'bullets'],
  tank: ['enemyCount', 'enemySpeed', 'enemyFireRate', 'bossLevel'],
  mole: ['spawnInterval', 'upDuration', 'bunnyChance', 'timeLimit', 'targetHits'],
  simon: ['seqLength'],
  math: ['targetCorrect'],
};

/** 读取某关卡的云端覆盖配置：没有则 override 为 null（默认难度以前端内置公式为准） */
export const getLevelOverride = asyncHandler(async (req: Request, res: Response) => {
  const gameId = String(req.params.gameId || '');
  const level = parseInt(String(req.params.level), 10);

  if (!LEVEL_FIELDS[gameId] || !Number.isFinite(level) || level < 1) {
    fail(res, '参数无效');
    return;
  }

  const row = await LevelConfig.findOne({ where: { gameId, level } });
  success(res, {
    gameId,
    level,
    override: row ? JSON.parse(row.config) : null,
  });
});
