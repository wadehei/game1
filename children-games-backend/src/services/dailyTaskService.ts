import { Op, Transaction } from 'sequelize';
import { sequelize } from '../config/database';
import { GameProgress, DailyTask } from '../models';
import { formatDate } from '../utils/date';

// 每 15 颗星升一级
export const LEVEL_STAR_THRESHOLD = 15;

// 每日任务：完成 N 个不同游戏，奖励 M 颗星
export const DAILY_TASK_GOAL = 3;
export const DAILY_TASK_REWARD = 10;

export const localDateString = (): string => formatDate();

// 统计今天玩过的不同游戏数（按进度更新时间）
export const countTodayPlayedGames = async (
  userId: number,
  t?: Transaction,
): Promise<Set<string>> => {
  const todayStart = new Date(`${localDateString()}T00:00:00`);
  const rows = await GameProgress.findAll({
    where: { userId, updatedAt: { [Op.gte]: todayStart } },
    attributes: ['gameId'],
    transaction: t,
  });
  return new Set(rows.map((p) => p.gameId));
};

// 获取或创建今日任务记录，并自动发放奖励
export const updateDailyTask = async (
  userId: number,
  playedGames: Set<string>,
  t: Transaction,
): Promise<DailyTask> => {
  const today = localDateString();
  const [dailyTask] = await DailyTask.findOrCreate({
    where: { userId, date: today },
    defaults: { userId, date: today, completedGames: playedGames.size, taskReward: 0 },
    transaction: t,
  });
  dailyTask.completedGames = playedGames.size;
  if (playedGames.size >= DAILY_TASK_GOAL && dailyTask.taskReward === 0) {
    dailyTask.taskReward = DAILY_TASK_REWARD;
  }
  await dailyTask.save({ transaction: t });
  return dailyTask;
};

// 获取历史累计的每日任务奖励总和
export const getTotalDailyReward = async (
  userId: number,
  t?: Transaction,
): Promise<number> => {
  const rewardRows = await DailyTask.findAll({
    where: { userId },
    attributes: [[sequelize.fn('SUM', sequelize.col('taskReward')), 'rewardTotal']],
    raw: true,
    transaction: t,
  });
  return parseInt((rewardRows[0] as any)?.rewardTotal, 10) || 0;
};
