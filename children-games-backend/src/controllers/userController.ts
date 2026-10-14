import { Request, Response } from 'express';
import { Op } from 'sequelize';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User, UserPlaytime, GameProgress, DailyTask } from '../models';
import { config } from '../config';
import { AuthRequest } from '../middleware/auth';
import { success, fail, asyncHandler } from '../utils/response';

// ─── 角色口令（PIN） ────────────────────────────────

const hashPin = (pin: string): string =>
  crypto.createHash('sha256').update(`${pin}:${config.jwt.secret}`).digest('hex');

const isValidPin = (pin: unknown): pin is string =>
  typeof pin === 'string' && /^\d{4}$/.test(pin);

// 简单防爆破：同一角色 1 分钟内错 5 次锁定 60 秒
const pinAttempts = new Map<number, { count: number; lockedUntil: number }>();

const checkThrottle = (userId: number): number | null => {
  const rec = pinAttempts.get(userId);
  if (rec && rec.lockedUntil > Date.now()) return rec.lockedUntil;
  return null;
};

const recordFail = (userId: number): void => {
  const rec = pinAttempts.get(userId) || { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= 5) {
    rec.lockedUntil = Date.now() + 60 * 1000;
    rec.count = 0;
  }
  pinAttempts.set(userId, rec);
};

const clearFails = (userId: number): void => {
  pinAttempts.delete(userId);
};

// 微信登录（后续实现）
export const wxLogin = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body;

  if (!code) {
    fail(res, '缺少 code 参数');
    return;
  }

  // TODO: 调用微信接口获取 openid
  // const openid = await getOpenidFromWechat(code);

  // 临时模拟 openid
  const openid = `mock_${Date.now()}`;

  // 查找或创建用户
  let [user, created] = await User.findOrCreate({
    where: { openid },
    defaults: {
      openid,
      nickname: '小朋友',
      avatar: '',
    },
  });

  // 生成 JWT
  const token = jwt.sign(
    { userId: user.id, openid: user.openid },
    config.jwt.secret,
    { expiresIn: '7d' }
  );

  success(res, {
    token,
    userInfo: {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      level: user.level,
      totalStars: user.totalStars,
    },
  });
});

// 测试登录（仅开发环境；线上统一走家庭角色登录）
export const testLogin = asyncHandler(async (req: Request, res: Response) => {
  if (config.nodeEnv !== 'development') {
    fail(res, '该接口仅开发环境可用', 403);
    return;
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

  const token = jwt.sign(
    { userId: user.id, openid: user.openid },
    config.jwt.secret,
    { expiresIn: '7d' }
  );

  success(res, {
    token,
    userInfo: {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      level: user.level,
      totalStars: user.totalStars,
    },
  });
});

// 家庭角色登录（家庭自用免密）：传 uid 直接登录已有成员，传 nickname+avatar 创建新成员
export const familyLogin = asyncHandler(async (req: Request, res: Response) => {
  const { uid, nickname, avatar } = req.body;

  let user = null;
  if (uid) {
    user = await User.findByPk(parseInt(uid, 10));
    if (!user) {
      fail(res, '角色不存在', 404);
      return;
    }
    // 设置了口令的角色必须校验（防止孩子互串档案/外人冒用）
    if (user.pinHash) {
      const lockedUntil = checkThrottle(user.id);
      if (lockedUntil) {
        fail(res, `口令错误次数过多，请 ${Math.ceil((lockedUntil - Date.now()) / 1000)} 秒后再试`, 429);
        return;
      }
      const pin = req.body?.pin;
      if (!isValidPin(pin) || hashPin(pin) !== user.pinHash) {
        recordFail(user.id);
        fail(res, '口令不正确', 401);
        return;
      }
      clearFails(user.id);
    }
  } else {
    if (!nickname || !String(nickname).trim()) {
      fail(res, '请填写昵称');
      return;
    }
    const openid = `family_${Date.now()}`;
    const [created] = await User.findOrCreate({
      where: { openid },
      defaults: {
        openid,
        nickname: String(nickname).trim().slice(0, 12),
        avatar: avatar || '😊',
      },
    });
    user = created;
  }

  const token = jwt.sign(
    { userId: user.id, openid: user.openid },
    config.jwt.secret,
    { expiresIn: '365d' }
  );

  success(res, {
    token,
    userInfo: {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      level: user.level,
      totalStars: user.totalStars,
    },
  });
});

// 家庭成员列表（选角色页：只展示家庭创建的角色，按总星星排序即为家庭总榜）
export const getProfiles = asyncHandler(async (req: Request, res: Response) => {
  const users = await User.findAll({
    where: { openid: { [Op.like]: 'family_%' } },
    attributes: ['id', 'nickname', 'avatar', 'level', 'totalStars', 'pinHash', 'createdAt'],
    order: [['totalStars', 'DESC']],
    limit: 20,
  });

  success(res, users.map((u) => ({
    id: u.id,
    nickname: u.nickname,
    avatar: u.avatar,
    level: u.level,
    totalStars: u.totalStars,
    hasPin: !!u.pinHash,
  })));
});

// 设置/修改/清除自己的角色口令（newPin 传空串=清除）
export const updateMyPin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findByPk(req.userId!);
  if (!user) {
    fail(res, '用户不存在', 404);
    return;
  }

  const { oldPin, newPin } = req.body || {};

  if (user.pinHash) {
    if (!isValidPin(oldPin) || hashPin(oldPin) !== user.pinHash) {
      fail(res, '当前口令不正确', 401);
      return;
    }
  }

  if (newPin === '' || newPin === undefined || newPin === null) {
    user.pinHash = null;
    await user.save();
    success(res, { hasPin: false });
    return;
  }
  if (!isValidPin(newPin)) {
    fail(res, '新口令需为 4 位数字');
    return;
  }
  user.pinHash = hashPin(newPin);
  await user.save();
  success(res, { hasPin: true });
});

// 我的生涯：个人信息 + 全游戏生涯数据 + 累计时长/局数/成就汇总
export const getMyCareer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const user = await User.findByPk(userId);
  if (!user) {
    fail(res, '用户不存在', 404);
    return;
  }

  const progresses = await GameProgress.findAll({ where: { userId } });

  // 累计游玩时长与天数
  const timeRows = await UserPlaytime.findAll({
    where: { userId },
    attributes: ['date', 'seconds'],
  });
  const playSeconds = timeRows.reduce((sum, r) => sum + r.seconds, 0);
  const playDays = timeRows.filter((r) => r.seconds > 0).length;

  // 每日任务累计奖励星
  const rewardRows = await DailyTask.findAll({
    where: { userId },
    attributes: ['taskReward'],
  });
  const rewardStars = rewardRows.reduce((sum, r) => sum + (r.taskReward || 0), 0);

  const achievements = JSON.parse(user.achievements || '[]') as string[];
  const totalPlayCount = progresses.reduce((sum, p) => sum + (p.playCount || 0), 0);
  const totalWinCount = progresses.reduce((sum, p) => sum + (p.winCount || 0), 0);

  // 最近 7 天游玩时长（含今天），趋势图用
  const secondsByDate = new Map(timeRows.map((r) => [r.date, r.seconds]));
  const last7 = [] as { date: string; label: string; seconds: number }[];
  const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
  for (let i = 6; i >= 0; i--) {
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

  success(res, {
    user: {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      level: user.level,
      totalStars: user.totalStars,
      joinedAt: user.createdAt,
    },
    totals: {
      playSeconds,
      playDays,
      playCount: totalPlayCount,
      winCount: totalWinCount,
      achievementCount: achievements.length,
      rewardStars,
    },
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
      .sort((a, b) => new Date(b.lastPlayedAt || 0).getTime() - new Date(a.lastPlayedAt || 0).getTime()),
  });
});

// 上报游玩时长（客户端心跳，供后台看板统计）
export const reportPlaytime = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const seconds = Math.max(0, Math.min(parseInt(req.body?.seconds, 10) || 0, 180));
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
    fail(res, '用户不存在', 404);
    return;
  }

  success(res, {
    id: user.id,
    nickname: user.nickname,
    avatar: user.avatar,
    avatarHistory: Array.isArray(user.avatarHistory) ? user.avatarHistory : [],
    level: user.level,
    totalStars: user.totalStars,
  });
});

// 更新用户信息
export const updateUserInfo = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { nickname, avatar } = req.body;

  const user = await User.findByPk(req.userId!);

  if (!user) {
    fail(res, '用户不存在', 404);
    return;
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
    user.avatarHistory = history.slice(0, 12);
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
