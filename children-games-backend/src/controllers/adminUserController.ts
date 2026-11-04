import { Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { Op } from 'sequelize';
import {
  User,
  GameProgress,
  DailyTask,
  UserPlaytime,
  FeedbackReply,
  Feedback,
  BattleRecord,
} from '../models';
import { AdminRequest } from '../middleware/adminAuth';
import { success, asyncHandler } from '../utils/response';
import { BadRequestError, NotFoundError } from '../errors/AppError';
import { withTransaction } from '../utils/transaction';
import { formatDate } from '../utils/date';
import { NICKNAME_MAX_LENGTH, AVATAR_MAX_LENGTH } from '../config/constants';

// ─── 角色管理 ────────────────────────────────

/** 全部用户（含游客），带游玩统计 */
export const getUsers = asyncHandler(async (req: AdminRequest, res: Response) => {
  const today = formatDate();

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
      await fs.unlink(p);
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
