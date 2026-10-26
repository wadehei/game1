import { Request, Response } from 'express';
import { Op } from 'sequelize';
import bcrypt from 'bcrypt';
import { User, UserPlaytime, GameProgress, DailyTask } from '../models';
import { config } from '../config';
import { AuthRequest } from '../middleware/auth';
import { success, asyncHandler } from '../utils/response';
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  TooManyRequestsError,
} from '../errors/AppError';
import { safeJsonParse } from '../utils/safeJson';
import { generateUserToken, toUserInfo } from '../utils/auth';
import {
  MAX_PLAYTIME_SECONDS,
  AVATAR_HISTORY_LIMIT,
  RECENT_DAYS,
  NICKNAME_MAX_LENGTH,
  AVATAR_MAX_LENGTH,
} from '../config/constants';

// ─── 角色口令（PIN） ────────────────────────────────

const PIN_HASH_ROUNDS = 12;
const hashPin = async (pin: string): Promise<string> => bcrypt.hash(pin, PIN_HASH_ROUNDS);

const verifyPin = async (pin: string, hash: string): Promise<boolean> => bcrypt.compare(pin, hash);

const isValidPin = (pin: unknown): pin is string => typeof pin === 'string' && /^\d{4}$/.test(pin);

// 防爆破：同一角色 1 分钟内错 5 次锁定 60 秒，递增惩罚
const pinAttempts = new Map<number, { count: number; lockedUntil: number }>();

// 定期清理过期条目，防止内存泄漏（每 2 分钟扫描一次）
setInterval(() => {
  const now = Date.now();
  for (const [uid, rec] of pinAttempts) {
    // 锁定已过期 → 清除（不论 count 多少，过期即删，防止内存泄漏）
    if (rec.lockedUntil < now) {
      pinAttempts.delete(uid);
    }
  }
}, 120_000).unref(); // .unref() 不阻止进程退出

const checkThrottle = (userId: number): number | null => {
  const rec = pinAttempts.get(userId);
  if (rec && rec.lockedUntil > Date.now()) return rec.lockedUntil;
  return null;
};

const recordFail = (userId: number): void => {
  const rec = pinAttempts.get(userId) || { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= 5) {
    // 递增锁定：5次→60s，10次→5min，15次→30min
    const lockDuration = rec.count >= 15 ? 30 * 60_000 : rec.count >= 10 ? 5 * 60_000 : 60_000;
    rec.lockedUntil = Date.now() + lockDuration;
    rec.count = 0;
  }
  pinAttempts.set(userId, rec);
};

const clearFails = (userId: number): void => {
  pinAttempts.delete(userId);
};

// 微信登录（后续实现）
export const wxLogin = asyncHandler(async (req: Request, res: Response) => {
  // 生产环境不允许 mock 登录，防止批量创建虚假账号
  if (config.nodeEnv !== 'development') {
    throw new BadRequestError('微信登录尚未接入');
  }

  const { code } = req.body;

  if (!code) throw new BadRequestError('缺少 code 参数');

  // TODO: 调用微信接口获取 openid
  // const openid = await getOpenidFromWechat(code);

  // 临时模拟 openid
  const openid = `mock_${Date.now()}`;

  // 查找或创建用户
  const [user, created] = await User.findOrCreate({
    where: { openid },
    defaults: {
      openid,
      nickname: '小朋友',
      avatar: '',
    },
  });

  // 生成 JWT
  const token = generateUserToken(user);

  success(res, { token, userInfo: toUserInfo(user) });
});

// 测试登录（仅开发环境；线上统一走家庭角色登录）
export const testLogin = asyncHandler(async (req: Request, res: Response) => {
  if (config.nodeEnv !== 'development') {
    throw new ForbiddenError('该接口仅开发环境可用');
  }

  const { nickname } = req.body;

  const openid = `test_${Date.now()}`;

  const [user] = await User.findOrCreate({
    where: { openid },
    defaults: {
      openid,
      nickname: nickname || '测试用户',
      avatar: '',
    },
  });

  const token = generateUserToken(user);

  success(res, { token, userInfo: toUserInfo(user) });
});

// 家庭角色登录（家庭自用免密）：传 uid 直接登录已有成员，传 nickname+avatar 创建新成员
export const familyLogin = asyncHandler(async (req: Request, res: Response) => {
  const { uid, nickname, avatar } = req.body;

  let user = null;
  if (uid) {
    user = await User.findByPk(parseInt(uid, 10));
    if (!user) {
      throw new NotFoundError('角色不存在');
    }
    // 设置了口令的角色必须校验（防止孩子互串档案/外人冒用）
    if (user.pinHash) {
      const lockedUntil = checkThrottle(user.id);
      if (lockedUntil) {
        throw new TooManyRequestsError(
          `口令错误次数过多，请 ${Math.ceil((lockedUntil - Date.now()) / 1000)} 秒后再试`
        );
      }
      const pin = req.body?.pin;
      if (!isValidPin(pin) || !(await verifyPin(pin, user.pinHash))) {
        recordFail(user.id);
        throw new UnauthorizedError('口令不正确');
      }
      clearFails(user.id);
    }
  } else {
    if (!nickname || !String(nickname).trim()) {
      throw new BadRequestError('请填写昵称');
    }
    const openid = `family_${Date.now()}`;
    const [created] = await User.findOrCreate({
      where: { openid },
      defaults: {
        openid,
        nickname: String(nickname).trim().slice(0, NICKNAME_MAX_LENGTH),
        avatar: avatar || '😊',
      },
    });
    user = created;
  }

  const token = generateUserToken(user, '365d');

  success(res, { token, userInfo: toUserInfo(user) });
});

// 家庭成员列表（选角色页：只展示家庭创建的角色，按总星星排序即为家庭总榜）
export const getProfiles = asyncHandler(async (req: Request, res: Response) => {
  const users = await User.findAll({
    where: { openid: { [Op.like]: 'family_%' } },
    attributes: ['id', 'nickname', 'avatar', 'level', 'totalStars', 'pinHash', 'createdAt'],
    order: [['totalStars', 'DESC']],
    limit: 100,
  });

  success(
    res,
    users.map((u) => ({
      id: u.id,
      nickname: u.nickname,
      avatar: u.avatar,
      level: u.level,
      totalStars: u.totalStars,
      hasPin: !!u.pinHash,
    }))
  );
});

// 设置/修改/清除自己的角色口令（newPin 传空串=清除）
export const updateMyPin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findByPk(req.userId!);
  if (!user) {
    throw new NotFoundError('用户不存在');
  }

  const { oldPin, newPin } = req.body || {};

  if (user.pinHash) {
    // 复用 familyLogin 的防爆破机制，防止 4 位 PIN 被穷举
    const lockedUntil = checkThrottle(user.id);
    if (lockedUntil) {
      throw new TooManyRequestsError(
        `口令错误次数过多，请 ${Math.ceil((lockedUntil - Date.now()) / 1000)} 秒后再试`
      );
    }
    if (!isValidPin(oldPin) || !(await verifyPin(oldPin, user.pinHash))) {
      recordFail(user.id);
      throw new UnauthorizedError('当前口令不正确');
    }
    clearFails(user.id);
  }

  if (newPin === '' || newPin === undefined || newPin === null) {
    user.pinHash = null;
    await user.save();
    success(res, { hasPin: false });
    return;
  }
  if (!isValidPin(newPin)) {
    throw new BadRequestError('新口令需为 4 位数字');
  }
  user.pinHash = await hashPin(newPin);
  await user.save();
  success(res, { hasPin: true });
});

// ─── getMyCareer 子函数 ────────────────────────────────

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
  progresses: any[],
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

  // 三条独立查询并行执行
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

// 上报游玩时长（客户端心跳，供后台看板统计）
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

// 获取用户信息
export const getUserInfo = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findByPk(req.userId!);

  if (!user) {
    throw new NotFoundError('用户不存在');
  }

  success(res, {
    id: user.id,
    nickname: user.nickname,
    avatar: user.avatar,
    avatarHistory: Array.isArray(user.avatarHistory) ? user.avatarHistory : [],
    level: user.level,
    totalStars: user.totalStars,
    battleChips: user.battleChips ?? 1000,
  });
});

// 好友对战生涯：当前积分 + 分游戏统计 + 最近流水
export const getBattleCareer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { getCareer } = await import('../services/battleChips');
  success(res, await getCareer(req.userId!));
});

// 更新用户信息
export const updateUserInfo = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { nickname, avatar } = req.body;

  const user = await User.findByPk(req.userId!);

  if (!user) {
    throw new NotFoundError('用户不存在');
  }

  if (nickname) user.nickname = nickname;
  let avatarChanged = false;
  if (avatar && avatar !== user.avatar) {
    // 头像历史：新旧头像都保留（emoji 与照片 URL 一视同仁），最多 12 个
    const history: string[] = Array.isArray(user.avatarHistory) ? [...user.avatarHistory] : [];
    if (user.avatar && !history.includes(user.avatar)) history.unshift(user.avatar);
    const idx = history.indexOf(avatar);
    if (idx !== -1) history.splice(idx, 1);
    history.unshift(avatar);
    user.avatarHistory = history.slice(0, AVATAR_HISTORY_LIMIT);
    user.avatar = avatar;
    avatarChanged = true;
  }

  await user.save();

  success(res, {
    id: user.id,
    nickname: user.nickname,
    avatar: user.avatar,
    ...(avatarChanged ? { avatarHistory: user.avatarHistory } : {}),
  });
});
