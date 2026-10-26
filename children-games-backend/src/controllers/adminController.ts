import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Op } from 'sequelize';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import {
  User,
  GameProgress,
  DailyTask,
  AppSetting,
  UserPlaytime,
  LevelConfig,
  QuizQuestion,
  Feedback,
  FeedbackReply,
  BattleRecord,
} from '../models';
import { AdminRequest } from '../middleware/adminAuth';
import { success, asyncHandler } from '../utils/response';
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
  InternalError,
} from '../errors/AppError';
import { LEVEL_FIELDS } from './levelController';
import { readRecentErrors, clearErrors } from '../utils/logger';
import { withTransaction } from '../utils/transaction';
import { safeJsonParse } from '../utils/safeJson';
import { formatDate } from '../utils/date';
import {
  DEFAULT_REST_INTERVAL_MINUTES,
  MAX_REST_INTERVAL_MINUTES,
  MAX_LEVEL_NUMBER,
  QUIZ_PAGE_LIMIT,
  NICKNAME_MAX_LENGTH,
  AVATAR_MAX_LENGTH,
} from '../config/constants';

const localDateString = (): string => formatDate();

// ─── 登录 ────────────────────────────────

/** 管理员登录：环境变量 ADMIN_PASSWORD，签发 12h 角色 JWT */
export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const { password } = req.body;
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) {
    throw new InternalError('未配置 ADMIN_PASSWORD，请在后端 .env 中设置');
  }
  // 使用 timingSafeEqual 防止计时攻击
  const actual = Buffer.from(String(password || ''), 'utf-8');
  const expectedBuf = Buffer.from(expected, 'utf-8');
  if (actual.length !== expectedBuf.length || !crypto.timingSafeEqual(actual, expectedBuf)) {
    throw new UnauthorizedError('密码不正确');
  }

  const token = jwt.sign({ role: 'admin' }, config.jwt.secret, { expiresIn: '12h' });
  success(res, { token });
});

// ─── 数据看板 ────────────────────────────────

/** 看板总览 + 最近游玩动态 */
export const getOverview = asyncHandler(async (req: AdminRequest, res: Response) => {
  const today = localDateString();

  // 三条独立查询并行执行，减少总耗时
  const [users, todayPlaytime, recent] = await Promise.all([
    User.findAll({ attributes: ['id', 'openid', 'nickname', 'avatar', 'level', 'totalStars'] }),
    UserPlaytime.findAll({ where: { date: today }, attributes: ['userId', 'seconds'] }),
    GameProgress.findAll({ order: [['updatedAt', 'DESC']], limit: 20 }),
  ]);

  const familyMembers = users.filter((u) => u.openid.startsWith('family_'));
  const totalStars = users.reduce((sum, u) => sum + u.totalStars, 0);

  // 积分入账失败告警（applyChipDelta 重试仍失败的记录，见错误日志 source=chips）
  const chipFailures = readRecentErrors(500).filter((e) => e.source === 'chips').length;

  const playtimeByUser = new Map(todayPlaytime.map((p) => [p.userId, p.seconds]));
  const todayPlaySeconds = todayPlaytime.reduce((sum, p) => sum + p.seconds, 0);
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
    chipFailures,
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
  const today = localDateString();

  // 三条独立查询并行执行
  const [users, todayPlaytime, progresses] = await Promise.all([
    User.findAll({
      attributes: [
        'id',
        'openid',
        'nickname',
        'avatar',
        'level',
        'totalStars',
        'battleChips',
        'createdAt',
      ],
      order: [['createdAt', 'ASC']],
    }),
    UserPlaytime.findAll({ where: { date: today } }),
    GameProgress.findAll({ attributes: ['userId', 'updatedAt'] }),
  ]);

  const playtimeByUser = new Map(todayPlaytime.map((p) => [p.userId, p.seconds]));
  const lastActiveByUser = new Map<number, Date>();
  const progressCountByUser = new Map<number, number>();
  progresses.forEach((p) => {
    progressCountByUser.set(p.userId, (progressCountByUser.get(p.userId) || 0) + 1);
    const prev = lastActiveByUser.get(p.userId);
    if (!prev || (p.updatedAt && p.updatedAt > prev)) {
      lastActiveByUser.set(p.userId, p.updatedAt as Date);
    }
  });

  success(
    res,
    users.map((u) => ({
      id: u.id,
      nickname: u.nickname,
      avatar: u.avatar,
      level: u.level,
      totalStars: u.totalStars,
      battleChips: u.battleChips ?? 1000,
      isFamily: u.openid.startsWith('family_'),
      hasPin: !!(u as any).pinHash,
      gamesPlayed: progressCountByUser.get(u.id) || 0,
      todaySeconds: playtimeByUser.get(u.id) || 0,
      lastActiveAt: lastActiveByUser.get(u.id) || null,
      createdAt: u.createdAt,
    }))
  );
});

/** 修改成员昵称/形象 */
export const updateUser = asyncHandler(async (req: AdminRequest, res: Response) => {
  const { nickname, avatar } = req.body;

  const user = await User.findByPk(parseInt(String(req.params.id), 10));
  if (!user) {
    throw new NotFoundError('用户不存在');
  }
  if (nickname && String(nickname).trim()) {
    user.nickname = String(nickname).trim().slice(0, NICKNAME_MAX_LENGTH);
  }
  if (avatar) {
    user.avatar = String(avatar).slice(0, AVATAR_MAX_LENGTH);
  }
  await user.save();

  success(res, { id: user.id, nickname: user.nickname, avatar: user.avatar });
});

/** 手动发放/调整好友对战积分（{ delta } 增减 或 { set } 直接设定） */
export const adjustUserChips = asyncHandler(async (req: AdminRequest, res: Response) => {
  const userId = parseInt(String(req.params.id), 10);
  const { delta, set } = req.body as { delta?: number; set?: number };
  const { adminAdjustChips } = await import('../services/battleChips');

  const user = await User.findByPk(userId);
  if (!user) {
    throw new NotFoundError('用户不存在');
  }
  if (typeof set !== 'number' && (typeof delta !== 'number' || delta === 0)) {
    throw new BadRequestError('请提供 delta（非 0 增减）或 set（设定）');
  }
  const chips = await adminAdjustChips(userId, {
    delta: typeof delta === 'number' ? delta : undefined,
    set: typeof set === 'number' ? set : undefined,
  });
  success(res, { id: userId, nickname: user.nickname, battleChips: chips });
});

/** 重置某用户的全部游戏进度（保留角色档案） */
export const resetUserProgress = asyncHandler(async (req: AdminRequest, res: Response) => {
  const userId = parseInt(String(req.params.id), 10);

  // 所有写操作包在事务中，保证原子性
  const user = await withTransaction(async (t) => {
    // 在事务内加锁重读，防并发覆盖
    const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!user) {
      throw new Error('用户不存在');
    }

    await GameProgress.destroy({ where: { userId }, transaction: t });
    await DailyTask.destroy({ where: { userId }, transaction: t });
    user.totalStars = 0;
    user.level = 1;
    user.achievements = '[]';
    await user.save({ transaction: t });

    return user;
  }, 'resetUserProgress');

  success(res, { id: userId, nickname: user.nickname });
});

/** 删除用户及其全部数据（不可恢复） */
export const deleteUser = asyncHandler(async (req: AdminRequest, res: Response) => {
  const userId = parseInt(String(req.params.id), 10);

  const user = await User.findByPk(userId);
  if (!user) {
    throw new NotFoundError('用户不存在');
  }

  // 在房/在线的成员先立即请出（按游戏规则弃牌处置，此时账号还在、积分入账正常），不等 60s 掉线判定
  const { kickUserEverywhere } = await import('../ws/wsServer');
  kickUserEverywhere(userId, '该角色已被家长删除');

  // 清理其上传的照片头像文件（文件系统操作不可回滚，放在事务前执行）
  // 即使文件删除后事务失败，最坏情况是多一个孤儿文件，下次可清理
  const avatar = String(user.avatar || '');
  const avMatch = avatar.match(/^\/api\/avatars\/([A-Za-z0-9_-]+\.(?:jpg|png|webp|gif))$/);
  if (avMatch) {
    const p = path.resolve(process.cwd(), 'uploads', 'avatars', avMatch[1]);
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      // 文件删除失败不阻断主流程
    }
  }

  // 所有数据库删除操作包在事务中，保证原子性
  await withTransaction(async (t) => {
    // 有外键约束的关联数据必须先删（feedbacks/feedback_replies → users）
    await FeedbackReply.destroy({ where: { userId }, transaction: t });
    await Feedback.destroy({ where: { userId }, transaction: t });
    await BattleRecord.destroy({ where: { userId }, transaction: t });
    await GameProgress.destroy({ where: { userId }, transaction: t });
    await DailyTask.destroy({ where: { userId }, transaction: t });
    await UserPlaytime.destroy({ where: { userId }, transaction: t });
    await user.destroy({ transaction: t });
  }, 'deleteUser');

  success(res, { id: userId });
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

/** 清除成员的角色口令（忘记口令时家长处理） */
export const clearUserPin = asyncHandler(async (req: AdminRequest, res: Response) => {
  const user = await User.findByPk(parseInt(String(req.params.id), 10));
  if (!user) {
    throw new NotFoundError('用户不存在');
  }
  user.pinHash = null;
  await user.save();
  success(res, { id: user.id, hasPin: false });
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
  const level = parseInt(String(req.params.level), 10);
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
  const level = parseInt(String(req.params.level), 10);

  if (!LEVEL_FIELDS[gameId]) {
    throw new BadRequestError('未知的 gameId');
  }
  await LevelConfig.destroy({ where: { gameId, level } });
  success(res, { gameId, level });
});

// ─── 错误日志 ────────────────────────────────

/** 最近错误日志（新→旧） */
export const getErrorLogs = asyncHandler(async (req: AdminRequest, res: Response) => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '100')), 1) || 100, 500);
  success(res, readRecentErrors(limit));
});

/** 清空错误日志 */
export const clearErrorLogs = asyncHandler(async (req: AdminRequest, res: Response) => {
  clearErrors();
  success(res, { ok: true });
});

// ─── 数据备份（SQL 构建在 services/backupService，与管理端下载/每日自动备份共用） ────────────────────────────────

/** 导出全部业务数据为 .sql（数据 INSERT 语句） */
export const downloadBackup = asyncHandler(async (req: AdminRequest, res: Response) => {
  const { buildBackupSql } = await import('../services/backupService');
  const sql = await buildBackupSql();
  res.setHeader('Content-Type', 'application/sql; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="children_games_backup_${localDateString()}.sql"`
  );
  res.send(sql);
});

/** 磁盘自动备份列表（新→旧） */
export const listAutoBackups = asyncHandler(async (req: AdminRequest, res: Response) => {
  const { listAutoBackups: list } = await import('../services/backupService');
  success(res, list());
});

// ─── 题库管理（答题对战） ────────────────────────────────

interface QuestionData {
  text: string;
  options: string[];
  answer: number;
  category: string;
  difficulty: number;
}

const validateQuestion = (body: unknown): { error?: string; data?: QuestionData } => {
  const b = body as Record<string, unknown>;
  const text = String(b?.text || '').trim();
  const options = Array.isArray(b?.options) ? b.options.map((o) => String(o).trim()) : [];
  const answer = Number(b?.answer);
  const category = String(b?.category || '综合')
    .trim()
    .slice(0, 20);
  const difficulty = Math.min(3, Math.max(1, Number(b?.difficulty) || 1));
  if (!text) return { error: '题干不能为空' };
  if (options.length !== 4 || options.some((o: string) => !o))
    return { error: '必须提供 4 个非空选项' };
  if (!Number.isInteger(answer) || answer < 0 || answer > 3) return { error: '正确答案下标无效' };
  return { data: { text, options, answer, category, difficulty } };
};

export const quizList = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = QUIZ_PAGE_LIMIT;
  const category = (req.query.category as string) || '';
  const where = category ? { category } : {};
  const { rows, count } = await QuizQuestion.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    offset: (page - 1) * limit,
    limit,
  });
  success(res, { list: rows, total: count, page, limit });
});

export const quizCreate = asyncHandler(async (req: Request, res: Response) => {
  const v = validateQuestion(req.body);
  if (v.error) throw new BadRequestError(v.error);
  const dup = await QuizQuestion.findOne({ where: { text: v.data!.text } });
  if (dup) throw new BadRequestError('已存在相同题干的题目');
  const q = await QuizQuestion.create(v.data!);
  success(res, q, '创建成功');
});

export const quizUpdate = asyncHandler(async (req: Request, res: Response) => {
  const q = await QuizQuestion.findByPk(Number(req.params.id));
  if (!q) throw new NotFoundError('题目不存在');
  const v = validateQuestion(req.body);
  if (v.error) throw new BadRequestError(v.error);
  await q.update(v.data!);
  success(res, q, '更新成功');
});

export const quizDelete = asyncHandler(async (req: Request, res: Response) => {
  const q = await QuizQuestion.findByPk(Number(req.params.id));
  if (!q) throw new NotFoundError('题目不存在');
  await q.destroy();
  success(res, { ok: true }, '删除成功');
});

export const quizImport = asyncHandler(async (req: Request, res: Response) => {
  const list = Array.isArray(req.body?.questions) ? req.body.questions : [];
  if (list.length === 0) throw new BadRequestError('导入内容为空');

  // 先在事务外做校验，过滤无效条目
  const validItems: Array<{
    text: string;
    options: string[];
    answer: number;
    category: string;
    difficulty: number;
  }> = [];
  let skipped = 0;
  for (const item of list) {
    const v = validateQuestion(item);
    if (v.error || !v.data) {
      skipped++;
      continue;
    }
    validItems.push(v.data);
  }

  // 事务内一次性完成去重 + 插入，保证原子性
  const { created } = await withTransaction(async (t) => {
    let createdCount = 0;
    for (const data of validItems) {
      const dup = await QuizQuestion.findOne({
        where: { text: data.text },
        transaction: t,
      });
      if (dup) {
        skipped++;
        continue;
      }
      await QuizQuestion.create(data, { transaction: t });
      createdCount++;
    }
    return { created: createdCount };
  }, 'quizImport');

  success(res, { created, skipped }, `导入完成：新增 ${created}，跳过 ${skipped}`);
});
