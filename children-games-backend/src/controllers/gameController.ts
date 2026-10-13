import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import { GameProgress, User, DailyTask } from '../models';
import { AuthRequest } from '../middleware/auth';
import { success, fail, asyncHandler } from '../utils/response';

// 游戏白名单与计分规则（翻牌/拼图步数越少越好）
const GAME_RULES: Record<string, { lowerScoreIsBetter: boolean }> = {
  memory: { lowerScoreIsBetter: true },
  puzzle: { lowerScoreIsBetter: true },
  fruit: { lowerScoreIsBetter: false },
  balloon: { lowerScoreIsBetter: false },
  tank: { lowerScoreIsBetter: false },
  mole: { lowerScoreIsBetter: false },
  simon: { lowerScoreIsBetter: false },
  // 数学小怪兽的成绩是通关用时（秒），越快越好
  math: { lowerScoreIsBetter: true },
};

// 每 15 颗星升一级
const LEVEL_STAR_THRESHOLD = 15;
// 每日任务：完成 N 个不同游戏，奖励 M 颗星
const DAILY_TASK_GOAL = 3;
const DAILY_TASK_REWARD = 10;

// ─── 成就系统 ────────────────────────────────────────
// 判定只依赖用户当前进度数据，随时可幂等重算
interface AchievementDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  check: (ctx: { totalStars: number; levels: Record<string, number>; distinctGames: number; dailyRewardClaimed: boolean }) => boolean;
}

const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_win', name: '初次通关', icon: '🎮', desc: '完成任意一关', check: (c) => c.totalStars > 0 },
  { id: 'star_10', name: '星星收集者', icon: '⭐', desc: '累计获得 10 颗星', check: (c) => c.totalStars >= 10 },
  { id: 'star_30', name: '闪闪发光', icon: '🌟', desc: '累计获得 30 颗星', check: (c) => c.totalStars >= 30 },
  { id: 'star_60', name: '星星传奇', icon: '💫', desc: '累计获得 60 颗星', check: (c) => c.totalStars >= 60 },
  { id: 'memory_master', name: '记忆大师', icon: '🧠', desc: '记忆翻牌通关第 10 关', check: (c) => (c.levels.memory || 0) >= 10 },
  { id: 'sharp_shooter', name: '神枪手', icon: '🎯', desc: '坦克大战通关第 10 关', check: (c) => (c.levels.tank || 0) >= 10 },
  { id: 'math_talent', name: '数学小达人', icon: '➕', desc: '数学小怪兽通关第 10 关', check: (c) => (c.levels.math || 0) >= 10 },
  { id: 'all_rounder', name: '全能玩家', icon: '🏅', desc: '玩过全部 8 个游戏', check: (c) => c.distinctGames >= Object.keys(GAME_RULES).length },
  { id: 'daily_done', name: '任务达成', icon: '📅', desc: '完成一次每日任务', check: (c) => c.dailyRewardClaimed },
];

const evaluateAchievements = async (userId: number): Promise<AchievementDef[]> => {
  const allProgress = await GameProgress.findAll({ where: { userId } });
  const levels: Record<string, number> = {};
  allProgress.forEach((p) => { levels[p.gameId] = Math.max(levels[p.gameId] || 0, p.currentLevel); });

  const rewardRows = await DailyTask.findAll({
    where: { userId },
    attributes: [[sequelize.fn('SUM', sequelize.col('taskReward')), 'rewardTotal']],
    raw: true,
  });
  const dailyRewardClaimed = (parseInt((rewardRows[0] as any)?.rewardTotal, 10) || 0) > 0;

  const user = await User.findByPk(userId);
  const totalStars = user?.totalStars || 0;
  const ctx = { totalStars, levels, distinctGames: allProgress.length, dailyRewardClaimed };

  return ACHIEVEMENTS.filter((def) => def.check(ctx));
};

const parseLevelStars = (raw: string | null): Record<string, number> => {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const localDateString = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

// 统计今天玩过的不同游戏数（按进度更新时间）
const countTodayPlayedGames = async (userId: number): Promise<Set<string>> => {
  const todayStart = new Date(`${localDateString()}T00:00:00`);
  const rows = await GameProgress.findAll({
    where: { userId, updatedAt: { [Op.gte]: todayStart } },
    attributes: ['gameId'],
  });
  return new Set(rows.map((p) => p.gameId));
};

// 获取用户所有游戏进度
export const getAllProgress = asyncHandler(async (req: AuthRequest, res: Response) => {
  const progressList = await GameProgress.findAll({
    where: { userId: req.userId! },
  });

  const result = progressList.map(p => ({
    gameId: p.gameId,
    currentLevel: p.currentLevel,
    highScore: p.highScore,
    stars: p.stars,
    levelStars: parseLevelStars(p.levelStars),
    achievements: JSON.parse(p.achievements || '[]'),
  }));

  success(res, result);
});

// 获取单个游戏进度
export const getGameProgress = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;

  const progress = await GameProgress.findOne({
    where: { userId: req.userId!, gameId },
  });

  if (!progress) {
    // 返回默认进度
    success(res, {
      gameId,
      currentLevel: 1,
      highScore: 0,
      stars: 0,
      levelStars: {},
      achievements: [],
    });
    return;
  }

  success(res, {
    gameId: progress.gameId,
    currentLevel: progress.currentLevel,
    highScore: progress.highScore,
    stars: progress.stars,
    levelStars: parseLevelStars(progress.levelStars),
    achievements: JSON.parse(progress.achievements || '[]'),
  });
});

// 更新游戏进度
export const updateGameProgress = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const { level, score, stars, achievements } = req.body;

  const rule = GAME_RULES[gameId as string];
  if (!rule) {
    fail(res, '未知的 gameId');
    return;
  }

  const levelNum = parseInt(level, 10);
  if (!Number.isFinite(levelNum) || levelNum < 1) {
    fail(res, 'level 参数无效');
    return;
  }

  const userId = req.userId!;
  const scoreNum = Number(score) || 0;
  // 本次本关星级（1-3）
  const starsNum = Math.max(0, Math.min(parseInt(stars, 10) || 0, 3));

  // 查找或创建进度
  const [progress, created] = await GameProgress.findOrCreate({
    where: { userId, gameId: gameId as string },
    defaults: {
      userId,
      gameId: gameId as string,
      currentLevel: levelNum,
      highScore: scoreNum,
      stars: starsNum,
      levelStars: JSON.stringify({ [String(levelNum)]: starsNum }),
      achievements: JSON.stringify(achievements || []),
      playCount: 1,
      winCount: 1,
    },
  });

  if (!created) {
    // 生涯统计：每局通关计一次局数与胜局
    progress.playCount += 1;
    progress.winCount += 1;
    // 每关保留历史最佳星级
    const levelStars = parseLevelStars(progress.levelStars);
    // 兼容旧数据：把原有单一最高星级迁移到当时的关卡上
    if (Object.keys(levelStars).length === 0 && progress.stars > 0) {
      levelStars[String(progress.currentLevel)] = progress.stars;
    }
    if (starsNum > (levelStars[String(levelNum)] || 0)) {
      levelStars[String(levelNum)] = starsNum;
    }
    progress.levelStars = JSON.stringify(levelStars);
    progress.stars = Object.values(levelStars).reduce((sum, s) => sum + s, 0);

    if (levelNum > progress.currentLevel) {
      progress.currentLevel = levelNum;
    }
    if (rule.lowerScoreIsBetter) {
      // 步数类成绩越小越好（highScore=0 表示还没记录过）
      if (scoreNum > 0 && (progress.highScore === 0 || scoreNum < progress.highScore)) {
        progress.highScore = scoreNum;
      }
    } else if (scoreNum > progress.highScore) {
      progress.highScore = scoreNum;
    }
    if (achievements) {
      const existing = JSON.parse(progress.achievements || '[]');
      progress.achievements = JSON.stringify([...new Set([...existing, ...achievements])]);
    }

    await progress.save();
  }

  // 更新用户总星星数和等级
  const user = await User.findByPk(userId);
  if (user) {
    const allProgress = await GameProgress.findAll({ where: { userId } });
    const gameStars = allProgress.reduce((sum, p) => sum + p.stars, 0);

    // 每日任务：达成目标后自动发放一次奖励
    const playedGames = await countTodayPlayedGames(userId);
    const today = localDateString();
    const [dailyTask] = await DailyTask.findOrCreate({
      where: { userId, date: today },
      defaults: { userId, date: today, completedGames: playedGames.size, taskReward: 0 },
    });
    dailyTask.completedGames = playedGames.size;
    if (playedGames.size >= DAILY_TASK_GOAL && dailyTask.taskReward === 0) {
      dailyTask.taskReward = DAILY_TASK_REWARD;
    }
    await dailyTask.save();

    // 历史累计的每日任务奖励，避免重算时被覆盖
    const rewardRows = await DailyTask.findAll({
      where: { userId },
      attributes: [[sequelize.fn('SUM', sequelize.col('taskReward')), 'rewardTotal']],
      raw: true,
    });
    const rewardTotal = parseInt((rewardRows[0] as any)?.rewardTotal, 10) || 0;

    user.totalStars = gameStars + rewardTotal;
    user.level = Math.floor(user.totalStars / LEVEL_STAR_THRESHOLD) + 1;
    await user.save();
  }

  // 成就判定：本次新解锁的随响应返回，前端弹提示
  let newAchievements: { id: string; name: string; icon: string }[] = [];
  if (user) {
    const unlockedDefs = await evaluateAchievements(userId);
    const owned = JSON.parse(user.achievements || '[]') as string[];
    const fresh = unlockedDefs.filter((def) => !owned.includes(def.id));
    if (fresh.length > 0) {
      owned.push(...fresh.map((def) => def.id));
      user.achievements = JSON.stringify(owned);
      await user.save();
      newAchievements = fresh.map(({ id, name, icon }) => ({ id, name, icon }));
    }
  }

  success(res, {
    gameId: progress.gameId,
    currentLevel: progress.currentLevel,
    highScore: progress.highScore,
    stars: progress.stars,
    levelStars: parseLevelStars(progress.levelStars),
    totalStars: user?.totalStars || 0,
    level: user?.level || 1,
    newAchievements,
  });
});

// 获取成就列表（含实时解锁状态）
export const getAchievements = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const user = await User.findByPk(userId);
  const owned = JSON.parse(user?.achievements || '[]') as string[];
  const unlockedDefs = await evaluateAchievements(userId);
  const unlockedIds = new Set(unlockedDefs.map((def) => def.id));

  success(res, ACHIEVEMENTS.map(({ id, name, icon, desc }) => ({
    id,
    name,
    icon,
    desc,
    unlocked: owned.includes(id) || unlockedIds.has(id),
  })));
});

// 上报一局游玩（失败结算时调用，胜局在 updateGameProgress 里已计入）
export const recordPlay = asyncHandler(async (req: AuthRequest, res: Response) => {
  const gameId = String(req.params.gameId || '');
  if (!GAME_RULES[gameId]) {
    fail(res, '未知的 gameId');
    return;
  }
  const userId = req.userId!;
  const [progress] = await GameProgress.findOrCreate({
    where: { userId, gameId },
    defaults: { userId, gameId, playCount: 0, winCount: 0 } as any,
  });
  if (progress) {
    progress.playCount += 1;
    await progress.save();
  }
  success(res, { ok: true });
});

// 获取今日任务进度
export const getDailyTask = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const today = localDateString();
  const playedGames = await countTodayPlayedGames(userId);
  const dailyTask = await DailyTask.findOne({ where: { userId, date: today } });

  success(res, {
    completedGames: playedGames.size,
    taskGoal: DAILY_TASK_GOAL,
    rewardStars: DAILY_TASK_REWARD,
    claimed: (dailyTask?.taskReward || 0) > 0,
  });
});

// 获取排行榜（按各游戏计分方向排序：步数/用时类少者在前）
export const getLeaderboard = asyncHandler(async (req: Request, res: Response) => {
  const { gameId } = req.params;

  const rule = GAME_RULES[gameId as string];
  if (!rule) {
    fail(res, '未知的 gameId');
    return;
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 50, 1), 100);

  // 只比家庭角色（排除历史游客数据）
  const familyUsers = await User.findAll({
    where: { openid: { [Op.like]: 'family_%' } },
    attributes: ['id'],
  });
  const familyIds = familyUsers.map((u) => u.id);
  if (familyIds.length === 0) {
    success(res, []);
    return;
  }

  const progressList = await GameProgress.findAll({
    where: { gameId, highScore: { [Op.gt]: 0 }, userId: { [Op.in]: familyIds } },
    order: [['highScore', rule.lowerScoreIsBetter ? 'ASC' : 'DESC']],
    limit,
  });

  const userIds = progressList.map(p => p.userId);
  const users = await User.findAll({
    where: { id: { [Op.in]: userIds } },
  });

  const userMap = new Map(users.map(u => [u.id, u]));

  const leaderboard = progressList.map((p, index) => ({
    rank: index + 1,
    userId: p.userId,
    nickname: userMap.get(p.userId)?.nickname || '匿名',
    avatar: userMap.get(p.userId)?.avatar || '',
    highScore: p.highScore,
    level: p.currentLevel,
  }));

  success(res, leaderboard);
});
