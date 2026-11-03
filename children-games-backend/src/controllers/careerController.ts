import { Response } from 'express';
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
  timeRows: { seconds: number }[],
  rewardRows: { taskReward: number | null }[],
  achievements: string[]
) {
  const playSeconds = timeRows.reduce((sum, r) => sum + r.seconds, 0);
  const playDays = timeRows.filter((r) => r.seconds > 0).length;
  const rewardStars = rewardRows.reduce((sum, r) => sum + (r.taskReward || 0), 0);
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

  const [progresses, timeRows, rewardRows] = await Promise.all([
    GameProgress.findAll({ where: { userId } }),
    UserPlaytime.findAll({ where: { userId }, attributes: ['date', 'seconds'] }),
    DailyTask.findAll({ where: { userId }, attributes: ['taskReward'] }),
  ]);

  const achievements = safeJsonParse<string[]>(user.achievements, []);
  const totals = computeCareerTotals(progresses, timeRows, rewardRows, achievements);
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
