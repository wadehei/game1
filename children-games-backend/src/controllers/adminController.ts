import { Request, Response } from 'express';
import { Op } from 'sequelize';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { User, GameProgress, DailyTask, AppSetting, UserPlaytime, LevelConfig } from '../models';
import { AdminRequest } from '../middleware/adminAuth';
import { success, fail, asyncHandler } from '../utils/response';
import { LEVEL_FIELDS } from './levelController';

const localDateString = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

// ─── 登录 ────────────────────────────────

/** 管理员登录：环境变量 ADMIN_PASSWORD，签发 12h 角色 JWT */
export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const { password } = req.body;
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) {
    fail(res, '未配置 ADMIN_PASSWORD，请在后端 .env 中设置', 500);
    return;
  }
  if (password !== expected) {
    fail(res, '密码不正确', 401);
    return;
  }

  const token = jwt.sign({ role: 'admin' }, config.jwt.secret, { expiresIn: '12h' });
  success(res, { token });
});

// ─── 数据看板 ────────────────────────────────

/** 看板总览 + 最近游玩动态 */
export const getOverview = asyncHandler(async (req: AdminRequest, res: Response) => {
  const today = localDateString();

  const users = await User.findAll({ attributes: ['id', 'openid', 'nickname', 'avatar', 'level', 'totalStars'] });
  const familyMembers = users.filter((u) => u.openid.startsWith('family_'));
  const totalStars = users.reduce((sum, u) => sum + u.totalStars, 0);

  const todayPlaytime = await UserPlaytime.findAll({
    where: { date: today },
    attributes: ['userId', 'seconds'],
  });
  const playtimeByUser = new Map(todayPlaytime.map((p) => [p.userId, p.seconds]));
  const todayPlaySeconds = todayPlaytime.reduce((sum, p) => sum + p.seconds, 0);

  // 最近游玩动态（进度更新时间倒序）
  const recent = await GameProgress.findAll({
    order: [['updatedAt', 'DESC']],
    limit: 20,
  });
  const userMap = new Map(users.map((u) => [u.id, u]));
  const activity = recent.map((p) => ({
    userId: p.userId,
    nickname: userMap.get(p.userId)?.nickname || '游客',
    avatar: userMap.get(p.userId)?.avatar || '',
    gameId: p.gameId,
    currentLevel: p.currentLevel,
    highScore: p.highScore,
    stars: p.stars,
    updatedAt: p.updatedAt,
  }));

  success(res, {
    familyMembers: familyMembers.length,
    guestUsers: users.length - familyMembers.length,
    totalStars,
    todayActiveUsers: todayPlaytime.length,
    todayPlaySeconds,
    members: familyMembers.map((u) => ({
      id: u.id,
      nickname: u.nickname,
      avatar: u.avatar,
      level: u.level,
      totalStars: u.totalStars,
      todaySeconds: playtimeByUser.get(u.id) || 0,
    })),
    activity,
  });
});

// ─── 角色管理 ────────────────────────────────

/** 全部用户（含游客），带游玩统计 */
export const getUsers = asyncHandler(async (req: AdminRequest, res: Response) => {
  const users = await User.findAll({
    attributes: ['id', 'openid', 'nickname', 'avatar', 'level', 'totalStars', 'createdAt'],
    order: [['createdAt', 'ASC']],
  });

  const today = localDateString();
  const todayPlaytime = await UserPlaytime.findAll({ where: { date: today } });
  const playtimeByUser = new Map(todayPlaytime.map((p) => [p.userId, p.seconds]));

  const progresses = await GameProgress.findAll({ attributes: ['userId', 'updatedAt'] });
  const lastActiveByUser = new Map<number, Date>();
  const progressCountByUser = new Map<number, number>();
  progresses.forEach((p) => {
    progressCountByUser.set(p.userId, (progressCountByUser.get(p.userId) || 0) + 1);
    const prev = lastActiveByUser.get(p.userId);
    if (!prev || (p.updatedAt && p.updatedAt > prev)) {
      lastActiveByUser.set(p.userId, p.updatedAt as Date);
    }
  });

  success(res, users.map((u) => ({
    id: u.id,
    nickname: u.nickname,
    avatar: u.avatar,
    level: u.level,
    totalStars: u.totalStars,
    isFamily: u.openid.startsWith('family_'),
    gamesPlayed: progressCountByUser.get(u.id) || 0,
    todaySeconds: playtimeByUser.get(u.id) || 0,
    lastActiveAt: lastActiveByUser.get(u.id) || null,
    createdAt: u.createdAt,
  })));
});

/** 修改成员昵称/形象 */
export const updateUser = asyncHandler(async (req: AdminRequest, res: Response) => {
  const { nickname, avatar } = req.body;

  const user = await User.findByPk(parseInt(String(req.params.id), 10));
  if (!user) {
    fail(res, '用户不存在', 404);
    return;
  }
  if (nickname && String(nickname).trim()) {
    user.nickname = String(nickname).trim().slice(0, 12);
  }
  if (avatar) {
    user.avatar = String(avatar).slice(0, 500);
  }
  await user.save();

  success(res, { id: user.id, nickname: user.nickname, avatar: user.avatar });
});

/** 重置某用户的全部游戏进度（保留角色档案） */
export const resetUserProgress = asyncHandler(async (req: AdminRequest, res: Response) => {
  const userId = parseInt(String(req.params.id), 10);

  const user = await User.findByPk(userId);
  if (!user) {
    fail(res, '用户不存在', 404);
    return;
  }

  await GameProgress.destroy({ where: { userId } });
  await DailyTask.destroy({ where: { userId } });
  user.totalStars = 0;
  user.level = 1;
  user.achievements = '[]';
  await user.save();

  success(res, { id: userId, nickname: user.nickname });
});

/** 删除用户及其全部数据（不可恢复） */
export const deleteUser = asyncHandler(async (req: AdminRequest, res: Response) => {
  const userId = parseInt(String(req.params.id), 10);

  const user = await User.findByPk(userId);
  if (!user) {
    fail(res, '用户不存在', 404);
    return;
  }

  await GameProgress.destroy({ where: { userId } });
  await DailyTask.destroy({ where: { userId } });
  await UserPlaytime.destroy({ where: { userId } });
  await user.destroy();

  success(res, { id: userId });
});

// ─── 设置（护眼策略等全局项） ────────────────────────────────

const REST_INTERVAL_KEY = 'rest_interval_minutes';

export const getSettings = asyncHandler(async (req: AdminRequest, res: Response) => {
  const row = await AppSetting.findByPk(REST_INTERVAL_KEY);
  success(res, {
    restIntervalMinutes: row ? parseInt(row.value, 10) || 20 : 20,
  });
});

/** 公开读取全局设置（客户端护眼守卫用，无需登录） */
export const getPublicSettings = asyncHandler(async (req: Request, res: Response) => {
  const row = await AppSetting.findByPk(REST_INTERVAL_KEY);
  success(res, {
    restIntervalMinutes: row ? parseInt(row.value, 10) || 20 : 20,
  });
});

export const updateSettings = asyncHandler(async (req: AdminRequest, res: Response) => {
  const { restIntervalMinutes } = req.body;
  const value = parseInt(restIntervalMinutes, 10);
  if (!Number.isFinite(value) || value < 0 || value > 120) {
    fail(res, '提醒间隔需在 0~120 分钟之间（0 为关闭）');
    return;
  }
  await AppSetting.upsert({ key: REST_INTERVAL_KEY, value: String(value) });
  success(res, { restIntervalMinutes: value });
});

// ─── 关卡难度覆盖 ────────────────────────────────

/** 列出某游戏已保存的关卡覆盖 */
export const getLevelOverrides = asyncHandler(async (req: AdminRequest, res: Response) => {
  const gameId = String(req.params.gameId || '');
  if (!LEVEL_FIELDS[gameId]) {
    fail(res, '未知的 gameId');
    return;
  }
  const rows = await LevelConfig.findAll({
    where: { gameId },
    order: [['level', 'ASC']],
  });
  success(res, rows.map((r) => ({
    level: r.level,
    config: JSON.parse(r.config),
    updatedAt: r.updatedAt,
  })));
});

/** 保存某关卡的难度覆盖（只允许各游戏白名单内的字段） */
export const saveLevelOverride = asyncHandler(async (req: AdminRequest, res: Response) => {
  const gameId = String(req.params.gameId || '');
  const level = parseInt(String(req.params.level), 10);
  const allowed = LEVEL_FIELDS[gameId];

  if (!allowed) {
    fail(res, '未知的 gameId');
    return;
  }
  if (!Number.isFinite(level) || level < 1 || level > 999) {
    fail(res, '关卡编号需在 1~999 之间');
    return;
  }

  const config = req.body?.config;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    fail(res, 'config 需为对象');
    return;
  }
  const unknownKeys = Object.keys(config).filter((k) => !allowed.includes(k));
  if (unknownKeys.length > 0) {
    fail(res, `不支持的字段: ${unknownKeys.join(', ')}（允许: ${allowed.join(', ')}）`);
    return;
  }
  if (Object.keys(config).length === 0) {
    fail(res, '至少填写一个配置项');
    return;
  }

  await LevelConfig.upsert({ gameId, level, config: JSON.stringify(config) });
  success(res, { gameId, level, config });
});

/** 删除某关卡的覆盖（恢复内置默认难度） */
export const deleteLevelOverride = asyncHandler(async (req: AdminRequest, res: Response) => {
  const gameId = String(req.params.gameId || '');
  const level = parseInt(String(req.params.level), 10);

  if (!LEVEL_FIELDS[gameId]) {
    fail(res, '未知的 gameId');
    return;
  }
  await LevelConfig.destroy({ where: { gameId, level } });
  success(res, { gameId, level });
});

// ─── 数据备份（纯 Node 导出，无外部依赖） ────────────────────────────────

const sqlEscape = (value: unknown): string => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '')}'`;
};

const BACKUP_TABLES = ['users', 'game_progress', 'daily_tasks', 'level_configs', 'app_settings', 'user_playtime'];

/** 导出全部业务数据为 .sql（数据 INSERT 语句） */
export const downloadBackup = asyncHandler(async (req: AdminRequest, res: Response) => {
  const { sequelize } = await import('../config/database');
  const lines: string[] = [
    '-- 儿童游戏乐园 数据备份',
    `-- 生成时间: ${new Date().toISOString()}`,
    'SET NAMES utf8mb4;',
    'SET FOREIGN_KEY_CHECKS = 0;',
    '',
  ];

  for (const table of BACKUP_TABLES) {
    const [rows] = await sequelize.query(`SELECT * FROM \`${table}\``) as [any[], unknown];
    lines.push(`-- ${table}（${rows.length} 行）`);
    lines.push(`DELETE FROM \`${table}\`;`);
    for (const row of rows) {
      const cols = Object.keys(row);
      const vals = cols.map((c) => sqlEscape(row[c]));
      lines.push(`INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (${vals.join(', ')});`);
    }
    lines.push('');
  }

  lines.push('SET FOREIGN_KEY_CHECKS = 1;');

  res.setHeader('Content-Type', 'application/sql; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="children_games_backup_${localDateString()}.sql"`
  );
  res.send(lines.join('\n'));
});
