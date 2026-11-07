import { Response } from 'express';
import { Op, fn, col, literal } from 'sequelize';
import { User, UserPlaytime, GameProgress, DailyTask } from '../models';
import { AuthRequest } from '../middleware/auth';
import { success, asyncHandler } from '../utils/response';
import { NotFoundError } from '../errors/AppError';
import { safeJsonParse } from '../utils/safeJson';
import { MAX_PLAYTIME_SECONDS, RECENT_DAYS } from '../config/constants';
import type { GameProgress as GameProgressType } from '../models';

/** 最近 N 天游玩时长趋势图数据 */
function buildLast7DaysChart(timeRows: { date: string; seconds: number }[]) {
  const secondsByDate = new Map(timeRows.map((r) => [r.date, r.seconds]));
  const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
  const last7 = [] as { date: string; label: string; seconds: number }[];
  for (let i = RECENT_DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const pad = (n: number) => String(n).padStart(2, '0');
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    last7.push({
      date: key,
      label: `周${dayNames[d.getDay()]}`,
      seconds: secondsByDate.get(key) || 0,
    });
  }
  return last7;
}

/** 生涯汇总数据 */
function computeCareerTotals(
  progresses: GameProgressType[],
  playSeconds: number,
  playDays: number,
  rewardStars: number,
  achievements: string[]
) {
  const totalPlayCount = progresses.reduce((sum, p) => sum + (p.playCount || 0), 0);
  const totalWinCount = progresses.reduce((sum, p) => sum + (p.winCount || 0), 0);

  return {
    playSeconds,
    playDays,
    playCount: totalPlayCount,
    winCount: totalWinCount,
    achievementCount: achievements.length,
    rewardStars,
  };
}

// 我的生涯：个人信息 + 全游戏生涯数据 + 累计时长/局数/成就汇总
export const getMyCareer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const user = await User.findByPk(userId);
  if (!user) {
    throw new NotFoundError('用户不存在');
  }

  // 性能优化：限制查询日期范围 + 使用 SQL 聚合减少内存占用
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RECENT_DAYS);

  const [progresses, timeRows, playAgg, rewardRows] = await Promise.all([
    GameProgress.findAll({ where: { userId } }),
    // 只查最近 N 天的时长数据（图表展示需要）
    UserPlaytime.findAll({
      where: {
        userId,
        date: { [Op.gte]: cutoffDate.toISOString().split('T')[0] },
      },
      attributes: ['date', 'seconds'],
      order: [['date', 'ASC']],
    }),
    // 汇总聚合：保持全历史口径（勿改成近 N 天，家长端"总时长/天数"以此为源）
    UserPlaytime.findOne({
      where: { userId },
      attributes: [
        [fn('SUM', col('seconds')), 'totalSeconds'],
        [fn('SUM', literal('CASE WHEN seconds > 0 THEN 1 ELSE 0 END')), 'activeDays'],
      ],
      raw: true,
    }),
    // 性能优化：使用 SQL SUM 聚合替代 findAll + JS reduce
    DailyTask.findAll({
      where: { userId },
      attributes: [[fn('SUM', col('taskReward')), 'total']],
      raw: true,
    }),
  ]);

  const agg = (playAgg ?? {}) as { totalSeconds?: string | null; activeDays?: string | null };
  const totalReward = parseInt(
    (rewardRows[0] as unknown as { total: string | null } | undefined)?.total || '0',
    10
  );

  const achievements = safeJsonParse<string[]>(user.achievements, []);
  const totals = computeCareerTotals(
    progresses,
    parseInt(agg.totalSeconds || '0', 10),
    parseInt(agg.activeDays || '0', 10),
    totalReward,
    achievements
  );
  const last7 = buildLast7DaysChart(timeRows);

  success(res, {
    user: {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      level: user.level,
      totalStars: user.totalStars,
      joinedAt: user.createdAt,
    },
    totals,
    last7,
    games: progresses
      .map((p) => ({
        gameId: p.gameId,
        currentLevel: p.currentLevel,
        stars: p.stars,
        highScore: p.highScore,
        playCount: p.playCount || 0,
        winCount: p.winCount || 0,
        lastPlayedAt: p.updatedAt,
      }))
      .sort(
        (a, b) => new Date(b.lastPlayedAt || 0).getTime() - new Date(a.lastPlayedAt || 0).getTime()
      ),
  });
});

// 上报游玩时长（客户端心跳）
export const reportPlaytime = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const seconds = Math.max(0, Math.min(parseInt(req.body?.seconds, 10) || 0, MAX_PLAYTIME_SECONDS));
  if (seconds === 0) {
    success(res, { ok: true });
    return;
  }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const [row] = await UserPlaytime.findOrCreate({
    where: { userId, date },
    defaults: { userId, date, seconds },
  });
  if (row) {
    row.seconds += seconds;
    await row.save();
  }
  success(res, { ok: true });
});

// 好友对战生涯：当前积分 + 分游戏统计 + 最近流水
export const getBattleCareer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { getCareer } = await import('../services/battleChips');
  success(res, await getCareer(req.userId!));
});
