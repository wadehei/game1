import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { User, GameProgress, UserPlaytime, AppSetting, LevelConfig } from '../models';
import { AdminRequest } from '../middleware/adminAuth';
import { success, asyncHandler } from '../utils/response';
import { BadRequestError } from '../errors/AppError';
import { LEVEL_FIELDS } from './levelController';
import { readRecentErrors } from '../utils/logger';
import { safeJsonParse } from '../utils/safeJson';
import { formatDate } from '../utils/date';
import {
  DEFAULT_REST_INTERVAL_MINUTES,
  MAX_REST_INTERVAL_MINUTES,
  MAX_LEVEL_NUMBER,
} from '../config/constants';

// ─── 数据看板 ────────────────────────────────

/** 看板总览 + 最近游玩动态 */
export const getOverview = asyncHandler(async (req: AdminRequest, res: Response) => {
  const today = formatDate();

  // 使用聚合查询代替全量加载，避免内存溢出
  const [familyUsers, todayPlaytime, recent, totalUserCount, totalStarsResult] = await Promise.all([
    // 只查询家庭成员（用于详细列表展示）
    User.findAll({
      where: { openid: { [Op.like]: 'family_%' } },
      attributes: ['id', 'nickname', 'avatar', 'level', 'totalStars'],
    }),
    // 今日游玩时长（按日期过滤，数据量有限）
    UserPlaytime.findAll({ where: { date: today }, attributes: ['userId', 'seconds'] }),
    // 最近游玩动态（已限制 20 条）
    GameProgress.findAll({ order: [['updatedAt', 'DESC']], limit: 20 }),
    // 用户总数（聚合查询）
    User.count(),
    // 总星星数（聚合查询）
    User.sum('totalStars') as Promise<number>,
  ]);

  const totalStars = totalStarsResult || 0;

  // 积分入账失败告警（applyChipDelta 重试仍失败的记录，见错误日志 source=chips）
  const chipFailures = readRecentErrors(500).filter((e) => e.source === 'chips').length;

  const playtimeByUser = new Map(todayPlaytime.map((p) => [p.userId, p.seconds]));
  const todayPlaySeconds = todayPlaytime.reduce((sum, p) => sum + p.seconds, 0);
  const userMap = new Map(familyUsers.map((u) => [u.id, u]));

  // 构建最近游玩动态（需要查询用户信息）
  const activityUserIds = [...new Set(recent.map((p) => p.userId))];
  const activityUsers =
    activityUserIds.length > 0
      ? await User.findAll({
          where: { id: activityUserIds },
          attributes: ['id', 'nickname', 'avatar'],
        })
      : [];
  const activityUserMap = new Map(activityUsers.map((u) => [u.id, u]));
  const activity = recent.map((p) => ({
    userId: p.userId,
    nickname: activityUserMap.get(p.userId)?.nickname || '游客',
    avatar: activityUserMap.get(p.userId)?.avatar || '',
    gameId: p.gameId,
    currentLevel: p.currentLevel,
    highScore: p.highScore,
    stars: p.stars,
    updatedAt: p.updatedAt,
  }));

  success(res, {
    familyMembers: familyUsers.length,
    guestUsers: totalUserCount - familyUsers.length,
    totalStars,
    todayActiveUsers: todayPlaytime.length,
    todayPlaySeconds,
    chipFailures,
    members: familyUsers.map((u) => ({
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

// ─── 设置（护眼策略等全局项） ────────────────────────────────

const REST_INTERVAL_KEY = 'rest_interval_minutes';

export const getSettings = asyncHandler(async (req: AdminRequest, res: Response) => {
  const row = await AppSetting.findByPk(REST_INTERVAL_KEY);
  success(res, {
    restIntervalMinutes: row
      ? parseInt(row.value, 10) || DEFAULT_REST_INTERVAL_MINUTES
      : DEFAULT_REST_INTERVAL_MINUTES,
  });
});

/** 公开读取全局设置（客户端护眼守卫用，无需登录） */
export const getPublicSettings = asyncHandler(async (req: Request, res: Response) => {
  const row = await AppSetting.findByPk(REST_INTERVAL_KEY);
  success(res, {
    restIntervalMinutes: row
      ? parseInt(row.value, 10) || DEFAULT_REST_INTERVAL_MINUTES
      : DEFAULT_REST_INTERVAL_MINUTES,
  });
});

export const updateSettings = asyncHandler(async (req: AdminRequest, res: Response) => {
  const { restIntervalMinutes } = req.body;
  const value = parseInt(restIntervalMinutes, 10);
  if (!Number.isFinite(value) || value < 0 || value > MAX_REST_INTERVAL_MINUTES) {
    throw new BadRequestError(`提醒间隔需在 0~${MAX_REST_INTERVAL_MINUTES} 分钟之间（0 为关闭）`);
  }
  await AppSetting.upsert({ key: REST_INTERVAL_KEY, value: String(value) });
  success(res, { restIntervalMinutes: value });
});

// ─── 关卡难度覆盖 ────────────────────────────────

/** 列出某游戏已保存的关卡覆盖 */
export const getLevelOverrides = asyncHandler(async (req: AdminRequest, res: Response) => {
  const gameId = String(req.params.gameId || '');
  if (!LEVEL_FIELDS[gameId]) {
    throw new BadRequestError('未知的 gameId');
  }
  const rows = await LevelConfig.findAll({
    where: { gameId },
    order: [['level', 'ASC']],
  });
  success(
    res,
    rows.map((r) => ({
      level: r.level,
      config: safeJsonParse(r.config, {}),
      updatedAt: r.updatedAt,
    }))
  );
});

/** 保存某关卡的难度覆盖（只允许各游戏白名单内的字段） */
export const saveLevelOverride = asyncHandler(async (req: AdminRequest, res: Response) => {
  const gameId = String(req.params.gameId || '');
  const level = parseInt(String(req.params.levelNumber ?? req.params.level), 10);
  const allowed = LEVEL_FIELDS[gameId];

  if (!allowed) {
    throw new BadRequestError('未知的 gameId');
  }
  if (!Number.isFinite(level) || level < 1 || level > MAX_LEVEL_NUMBER) {
    throw new BadRequestError(`关卡编号需在 1~${MAX_LEVEL_NUMBER} 之间`);
  }

  const config = req.body?.config;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new BadRequestError('config 需为对象');
  }
  const unknownKeys = Object.keys(config).filter((k) => !allowed.includes(k));
  if (unknownKeys.length > 0) {
    throw new BadRequestError(
      `不支持的字段: ${unknownKeys.join(', ')}（允许: ${allowed.join(', ')}）`
    );
  }
  if (Object.keys(config).length === 0) {
    throw new BadRequestError('至少填写一个配置项');
  }

  await LevelConfig.upsert({ gameId, level, config: JSON.stringify(config) });
  success(res, { gameId, level, config });
});

/** 删除某关卡的覆盖（恢复内置默认难度） */
export const deleteLevelOverride = asyncHandler(async (req: AdminRequest, res: Response) => {
  const gameId = String(req.params.gameId || '');
  const level = parseInt(String(req.params.levelNumber ?? req.params.level), 10);

  if (!LEVEL_FIELDS[gameId]) {
    throw new BadRequestError('未知的 gameId');
  }
  await LevelConfig.destroy({ where: { gameId, level } });
  success(res, { gameId, level });
});
