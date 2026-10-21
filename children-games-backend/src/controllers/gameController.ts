import { Request, Response } from "express";
import { Op } from "sequelize";
import { z } from "zod";
import { GameProgress, User } from "../models";
import { AuthRequest } from "../middleware/auth";
import { success, asyncHandler } from "../utils/response";
import { BadRequestError } from "../errors/AppError";
import { withTransaction } from "../utils/transaction";
import {
  ACHIEVEMENTS,
  GAME_RULES,
  evaluateAchievements,
} from "../services/achievementService";
import {
  LEVEL_STAR_THRESHOLD,
  DAILY_TASK_GOAL,
  DAILY_TASK_REWARD,
  localDateString,
  countTodayPlayedGames,
  updateDailyTask,
  getTotalDailyReward,
} from "../services/dailyTaskService";
import { parseLevelStars } from "../services/progressService";
import { getCachedLeaderboard, cacheLeaderboard, invalidateLeaderboardCache } from "../services/leaderboardCacheService";
import { LEADERBOARD_DEFAULT_LIMIT, LEADERBOARD_MAX_LIMIT, LEADERBOARD_CACHE_LIMIT } from "../config/constants";
import { safeJsonParse } from "../utils/safeJson";

// ─── Zod Schemas ────────────────────────────────────────
const updateProgressSchema = z.object({
  level: z.union([z.string(), z.number()]).refine(
    (v) => {
      const n = typeof v === "string" ? parseInt(v, 10) : v;
      return Number.isFinite(n) && n >= 1;
    },
    { message: "level 需为正整数" },
  ),
  score: z.union([z.string(), z.number()]).optional().default(0),
  stars: z.union([z.string(), z.number()]).optional().default(0),
  achievements: z.array(z.string()).optional(),
});

const gameIdParamSchema = z.object({
  gameId: z.string().refine((id) => id in GAME_RULES, {
    message: "未知的 gameId",
  }),
});

/**
 * @swagger
 * /api/game/progress:
 *   get:
 *     summary: 获取用户所有游戏进度
 *     tags: [游戏进度]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功返回所有游戏进度
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/GameProgress'
 *       401:
 *         description: 未授权
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// 获取用户所有游戏进度
export const getAllProgress = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const progressList = await GameProgress.findAll({
      where: { userId: req.userId! },
    });

    const result = progressList.map((p) => ({
      gameId: p.gameId,
      currentLevel: p.currentLevel,
      highScore: p.highScore,
      stars: p.stars,
      levelStars: parseLevelStars(p.levelStars),
      achievements: JSON.parse(p.achievements || "[]"),
    }));

    success(res, result);
  },
);

/**
 * @swagger
 * /api/game/progress/{gameId}:
 *   get:
 *     summary: 获取单个游戏进度
 *     tags: [游戏进度]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: string
 *         description: 游戏ID（如 match3, puzzle 等）
 *     responses:
 *       200:
 *         description: 成功返回游戏进度
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/GameProgress'
 *       401:
 *         description: 未授权
 *       404:
 *         description: 游戏不存在（返回默认进度）
 */
// 获取单个游戏进度
export const getGameProgress = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { gameId } = req.params;

    const progress = await GameProgress.findOne({
      where: { userId: req.userId!, gameId },
    });

    if (!progress) {
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
      achievements: JSON.parse(progress.achievements || "[]"),
    });
  },
);

/**
 * @swagger
 * /api/game/progress/{gameId}:
 *   put:
 *     summary: 更新游戏进度
 *     tags: [游戏进度]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: string
 *         description: 游戏ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - level
 *             properties:
 *               level:
 *                 type: integer
 *                 description: 关卡等级
 *                 example: 5
 *               score:
 *                 type: integer
 *                 description: 得分
 *                 example: 1000
 *               stars:
 *                 type: integer
 *                 description: 星星数（0-3）
 *                 minimum: 0
 *                 maximum: 3
 *                 example: 3
 *               achievements:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 获得的成就列表
 *                 example: ['first_win', 'combo_master']
 *     responses:
 *       200:
 *         description: 更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     progress:
 *                       $ref: '#/components/schemas/GameProgress'
 *                     dailyTask:
 *                       $ref: '#/components/schemas/DailyTask'
 *                     newAchievements:
 *                       type: array
 *                       items:
 *                         type: string
 *                     totalStarsReward:
 *                       type: integer
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未授权
 */
// ─── updateGameProgress 子函数 ────────────────────────────────

/** Step 1: 查找或创建进度，更新星星/关卡/高分/成就 */
async function upsertGameProgress(
  userId: number,
  gameId: string,
  levelNum: number,
  scoreNum: number,
  starsNum: number,
  achievements: string[] | undefined,
  rule: { lowerScoreIsBetter: boolean },
  t: any,
) {
  const [progress, created] = await GameProgress.findOrCreate({
    where: { userId, gameId },
    defaults: {
      userId,
      gameId,
      currentLevel: levelNum,
      highScore: scoreNum,
      stars: starsNum,
      levelStars: JSON.stringify({ [String(levelNum)]: starsNum }),
      achievements: JSON.stringify(achievements || []),
      playCount: 1,
      winCount: 1,
    },
    transaction: t,
  });

  if (created) return progress;

  progress.playCount += 1;
  progress.winCount += 1;
  const levelStars = parseLevelStars(progress.levelStars);
  if (Object.keys(levelStars).length === 0 && progress.stars > 0) {
    levelStars[String(progress.currentLevel)] = progress.stars;
  }
  if (starsNum > (levelStars[String(levelNum)] || 0)) {
    levelStars[String(levelNum)] = starsNum;
  }
  progress.levelStars = JSON.stringify(levelStars);
  progress.stars = Object.values(levelStars).reduce((sum, s) => sum + s, 0);

  if (levelNum > progress.currentLevel) progress.currentLevel = levelNum;
  if (rule.lowerScoreIsBetter) {
    if (scoreNum > 0 && (progress.highScore === 0 || scoreNum < progress.highScore)) {
      progress.highScore = scoreNum;
    }
  } else if (scoreNum > progress.highScore) {
    progress.highScore = scoreNum;
  }
  if (achievements) {
    const existing = safeJsonParse<string[]>(progress.achievements, []);
    progress.achievements = JSON.stringify([...new Set([...existing, ...achievements])]);
  }

  await progress.save({ transaction: t });
  return progress;
}

/** Step 2: 重算用户总星星和等级 */
async function recalcUserStats(userId: number, t: any) {
  const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!user) throw new Error("用户不存在");

  const allProgress = await GameProgress.findAll({ where: { userId }, transaction: t });
  const gameStars = allProgress.reduce((sum, p) => sum + p.stars, 0);

  const playedGames = await countTodayPlayedGames(userId, t);
  await updateDailyTask(userId, playedGames, t);
  const rewardTotal = await getTotalDailyReward(userId, t);

  user.totalStars = gameStars + rewardTotal;
  user.level = Math.floor(user.totalStars / LEVEL_STAR_THRESHOLD) + 1;
  await user.save({ transaction: t });

  return user;
}

/** Step 3: 成就判定 + 记录新解锁成就 */
async function processNewAchievements(userId: number, user: any, t: any) {
  const unlockedDefs = await evaluateAchievements(userId, t);
  const owned = safeJsonParse<string[]>(user.achievements, []);
  const fresh = unlockedDefs.filter((def) => !owned.includes(def.id));

  if (fresh.length === 0) return [];

  owned.push(...fresh.map((def) => def.id));
  user.achievements = JSON.stringify(owned);
  await user.save({ transaction: t });

  return fresh.map(({ id, name, icon }) => ({ id, name, icon }));
}

// 更新游戏进度
export const updateGameProgress = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    // 验证 gameId 参数
    const paramsResult = gameIdParamSchema.safeParse(req.params);
    if (!paramsResult.success) {
      throw new BadRequestError(paramsResult.error.issues[0].message);
    }
    const { gameId } = paramsResult.data;

    // 验证请求体
    const bodyResult = updateProgressSchema.safeParse(req.body);
    if (!bodyResult.success) {
      throw new BadRequestError(bodyResult.error.issues.map((e: { message: string }) => e.message).join(", "));
    }
    const { level, score, stars, achievements } = bodyResult.data;

    const rule = GAME_RULES[gameId];
    const userId = req.userId!;
    const levelNum = typeof level === "string" ? parseInt(level, 10) : level;
    const scoreNum = Number(score) || 0;
    const starsNum = Math.max(
      0,
      Math.min(typeof stars === "string" ? parseInt(stars, 10) || 0 : stars, 3),
    );

    const result = await withTransaction(async (t) => {
      // Step 1: 查找或创建进度
      const progress = await upsertGameProgress(
        userId, gameId, levelNum, scoreNum, starsNum, achievements, rule, t,
      );

      // Step 2: 重算用户星星与等级
      const user = await recalcUserStats(userId, t);

      // Step 3: 成就判定
      const newAchievements = await processNewAchievements(userId, user, t);

      return { progress, user, newAchievements };
    }, "updateGameProgress");

    // 进度更新后清除该游戏排行榜缓存
    await invalidateLeaderboardCache(result.progress.gameId);

    success(res, {
      gameId: result.progress.gameId,
      currentLevel: result.progress.currentLevel,
      highScore: result.progress.highScore,
      stars: result.progress.stars,
      levelStars: parseLevelStars(result.progress.levelStars),
      totalStars: result.user.totalStars,
      level: result.user.level,
      newAchievements: result.newAchievements,
    });
  },
);

// 获取成就列表（含实时解锁状态）
export const getAchievements = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const user = await User.findByPk(userId);
    const owned = safeJsonParse<string[]>(user?.achievements, []);
    const unlockedDefs = await evaluateAchievements(userId);
    const unlockedIds = new Set(unlockedDefs.map((def) => def.id));

    success(
      res,
      ACHIEVEMENTS.map(({ id, name, icon, desc }) => ({
        id,
        name,
        icon,
        desc,
        unlocked: owned.includes(id) || unlockedIds.has(id),
      })),
    );
  },
);

// 上报一局游玩（失败结算时调用）
export const recordPlay = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const paramsResult = gameIdParamSchema.safeParse(req.params);
    if (!paramsResult.success) {
      throw new BadRequestError(paramsResult.error.issues[0].message);
    }
    const { gameId } = paramsResult.data;
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
  },
);

// 获取今日任务进度
export const getDailyTask = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const playedGames = await countTodayPlayedGames(userId);

    success(res, {
      completedGames: playedGames.size,
      playedGames: [...playedGames],
      taskGoal: DAILY_TASK_GOAL,
      rewardStars: DAILY_TASK_REWARD,
      claimed: playedGames.size >= DAILY_TASK_GOAL,
    });
  },
);

/**
 * @swagger
 * /api/game/leaderboard/{gameId}:
 *   get:
 *     summary: 获取游戏排行榜
 *     tags: [游戏进度]
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: string
 *         description: 游戏ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: 返回数量限制（最大100）
 *     responses:
 *       200:
 *         description: 成功返回排行榜
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       rank:
 *                         type: integer
 *                         example: 1
 *                       userId:
 *                         type: integer
 *                         example: 1
 *                       nickname:
 *                         type: string
 *                         example: 小明
 *                       avatar:
 *                         type: string
 *                         example: /avatars/1.png
 *                       highScore:
 *                         type: integer
 *                         example: 1000
 *                       level:
 *                         type: integer
 *                         example: 5
 */
// 获取排行榜（先查 Redis 缓存，miss 后再查 DB 并回填缓存）
export const getLeaderboard = asyncHandler(
  async (req: Request, res: Response) => {
    const paramsResult = gameIdParamSchema.safeParse(req.params);
    if (!paramsResult.success) {
      throw new BadRequestError(paramsResult.error.issues[0].message);
    }
    const { gameId } = paramsResult.data;
    const rule = GAME_RULES[gameId];

    const limit = Math.min(
      Math.max(parseInt(req.query.limit as string, 10) || LEADERBOARD_DEFAULT_LIMIT, 1),
      LEADERBOARD_MAX_LIMIT,
    );

    // 1) 先尝试缓存
    const cached = await getCachedLeaderboard(gameId);
    if (cached) {
      success(res, cached.slice(0, limit));
      return;
    }

    // 2) 缓存 miss：使用 JOIN 一次查询获取进度 + 用户信息
    const progressList = await GameProgress.findAll({
      where: {
        gameId,
        highScore: { [Op.gt]: 0 },
      },
      include: [
        {
          model: User,
          as: "user",
          where: { openid: { [Op.like]: "family_%" } },
          attributes: ["id", "nickname", "avatar"],
          required: true,
        },
      ],
      order: [["highScore", rule.lowerScoreIsBetter ? "ASC" : "DESC"]],
      limit: LEADERBOARD_CACHE_LIMIT, // 缓存全量 top100，按 limit 截取返回
    });

    const leaderboard = progressList.map((p, index) => ({
      rank: index + 1,
      userId: p.userId,
      nickname: (p as any).user?.nickname || "匿名",
      avatar: (p as any).user?.avatar || "",
      highScore: p.highScore,
      level: p.currentLevel,
    }));

    // 3) 回填缓存
    await cacheLeaderboard(gameId, leaderboard);

    success(res, leaderboard.slice(0, limit));
  },
);
