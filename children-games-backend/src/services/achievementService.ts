import { Op, Transaction } from 'sequelize';
import { sequelize } from '../config/database';
import { GameProgress, User, DailyTask } from '../models';

// ─── 成就系统 ────────────────────────────────────────
// 判定只依赖用户当前进度数据，随时可幂等重算
export interface AchievementDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  check: (ctx: {
    totalStars: number;
    levels: Record<string, number>;
    distinctGames: number;
    dailyRewardClaimed: boolean;
  }) => boolean;
}

// 游戏白名单与计分规则（翻牌/拼图步数越少越好）
export const GAME_RULES: Record<string, { lowerScoreIsBetter: boolean }> = {
  memory: { lowerScoreIsBetter: true },
  puzzle: { lowerScoreIsBetter: true },
  fruit: { lowerScoreIsBetter: false },
  balloon: { lowerScoreIsBetter: false },
  tank: { lowerScoreIsBetter: false },
  mole: { lowerScoreIsBetter: false },
  simon: { lowerScoreIsBetter: false },
  // 数学小怪兽的成绩是通关用时（秒），越快越好
  math: { lowerScoreIsBetter: true },
  // 消消乐的成绩是通关用掉的步数，越少越好
  match3: { lowerScoreIsBetter: true },
  // 打砖块的成绩是砖块得分，越高越好
  brick: { lowerScoreIsBetter: false },
};

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_win', name: '初次通关', icon: '🎮', desc: '完成任意一关', check: (c) => c.totalStars > 0 },
  { id: 'star_10', name: '星星收集者', icon: '⭐', desc: '累计获得 10 颗星', check: (c) => c.totalStars >= 10 },
  { id: 'star_30', name: '闪闪发光', icon: '🌟', desc: '累计获得 30 颗星', check: (c) => c.totalStars >= 30 },
  { id: 'star_60', name: '星星传奇', icon: '💫', desc: '累计获得 60 颗星', check: (c) => c.totalStars >= 60 },
  { id: 'memory_master', name: '记忆大师', icon: '🧠', desc: '记忆翻牌通关第 10 关', check: (c) => (c.levels.memory || 0) >= 10 },
  { id: 'sharp_shooter', name: '神枪手', icon: '🎯', desc: '坦克大战通关第 10 关', check: (c) => (c.levels.tank || 0) >= 10 },
  { id: 'math_talent', name: '数学小达人', icon: '➕', desc: '数学小怪兽通关第 10 关', check: (c) => (c.levels.math || 0) >= 10 },
  { id: 'all_rounder', name: '全能玩家', icon: '🏅', desc: '玩过全部 11 个游戏', check: (c) => c.distinctGames >= Object.keys(GAME_RULES).length },
  { id: 'daily_done', name: '任务达成', icon: '📅', desc: '完成一次每日任务', check: (c) => c.dailyRewardClaimed },
];

export const evaluateAchievements = async (
  userId: number,
  t?: Transaction,
): Promise<AchievementDef[]> => {
  // 并行执行 3 次查询，减少总耗时从 T1+T2+T3 → max(T1,T2,T3)
  const [allProgress, rewardRows, user] = await Promise.all([
    GameProgress.findAll({ where: { userId }, transaction: t }),
    DailyTask.findAll({
      where: { userId },
      attributes: [[sequelize.fn('SUM', sequelize.col('taskReward')), 'rewardTotal']],
      raw: true,
      transaction: t,
    }),
    User.findByPk(userId, { transaction: t }),
  ]);

  const levels: Record<string, number> = {};
  allProgress.forEach((p) => {
    levels[p.gameId] = Math.max(levels[p.gameId] || 0, p.currentLevel);
  });

  const dailyRewardClaimed =
    (parseInt((rewardRows[0] as any)?.rewardTotal, 10) || 0) > 0;
  const totalStars = user?.totalStars || 0;
  const ctx = { totalStars, levels, distinctGames: allProgress.length, dailyRewardClaimed };

  return ACHIEVEMENTS.filter((def) => def.check(ctx));
};
