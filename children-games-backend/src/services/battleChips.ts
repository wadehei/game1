// 好友对战积分（账号资产）：结算、发放、生涯聚合
// 红线：仅站内娱乐资产，无充值/提现/兑换；牌类每手实时落库（防中途解散丢账），竞技游戏局终按排名发放
import { fn, col, literal } from 'sequelize';
import { User, BattleRecord } from '../models';

export const CHIP_RANK_REWARDS = [30, 15, 5]; // 第1/2/3名奖励，第3名之后与第3名相同
export const CHIP_DRAW_REWARD = 10;
export const CHIPS_JOIN_MIN = 100; // 进房救济线：低于此值自动补足
export const CHIPS_JOIN_REFILL = 1000;

/** 竞技游戏（非牌类）的排名分发放：wsServer.game_over 拦截统一调用 */
export const settleRankingChips = async (
  gameType: string,
  entries: Array<{ userId: number; nickname?: string }>,
  recordCareer: boolean
): Promise<void> => {
  try {
    for (let i = 0; i < entries.length; i += 1) {
      const delta = i === 0 ? CHIP_RANK_REWARDS[0] : i === 1 ? CHIP_RANK_REWARDS[1] : CHIP_RANK_REWARDS[2];
      await applyChipDelta(entries[i].userId, delta);
      if (recordCareer) {
        await writeRecord(entries[i].userId, gameType, i === 0 ? 'win' : `rank:${i + 1}`, delta);
      }
    }
  } catch (err) {
    // 积分结算失败不影响对局广播
    console.error('[chips] 排名积分结算失败:', err instanceof Error ? err.message : err);
  }
};

/** 牌类局终写生涯记录（每手实时入账由 handler 调 applyChipDelta，这里只补局记录） */
export const writeCareerRecords = async (
  gameType: string,
  rows: Array<{ userId: number; result: string; chipsDelta: number; chipsAfter: number }>
): Promise<void> => {
  try {
    for (const r of rows) {
      await writeRecord(r.userId, gameType, r.result, r.chipsDelta);
      // chipsAfter 由 writeRecord 按当前值快照，这里不需要再覆盖
    }
  } catch (err) {
    console.error('[chips] 牌类生涯记录失败:', err instanceof Error ? err.message : err);
  }
};

/** 单人积分变动（原子 +delta，下限 0）；返回新值，用户不存在返回 null */
export const applyChipDelta = async (userId: number, delta: number): Promise<number | null> => {
  const [affected] = await User.update(
    { battleChips: literal(`GREATEST(0, battleChips + ${Math.trunc(delta)})`) },
    { where: { id: userId } }
  );
  if (!affected) return null;
  const user = await User.findByPk(userId, { attributes: ['battleChips'] });
  return user?.battleChips ?? null;
};

const writeRecord = async (userId: number, gameType: string, result: string, chipsDelta: number): Promise<void> => {
  try {
    const user = await User.findByPk(userId, { attributes: ['battleChips'] });
    await BattleRecord.create({ userId, gameType, result, chipsDelta, chipsAfter: user?.battleChips || 0 });
  } catch (err) {
    console.error('[chips] 写生涯记录失败:', err instanceof Error ? err.message : err);
  }
};

/** 后台手动发放/调整积分；set 优先于 delta。返回新值 */
export const adminAdjustChips = async (userId: number, opts: { delta?: number; set?: number }): Promise<number | null> => {
  if (typeof opts.set === 'number') {
    await User.update({ battleChips: Math.max(0, Math.trunc(opts.set)) }, { where: { id: userId } });
  } else if (typeof opts.delta === 'number' && opts.delta !== 0) {
    await applyChipDelta(userId, opts.delta);
  } else {
    return null;
  }
  const user = await User.findByPk(userId, { attributes: ['battleChips'] });
  return user?.battleChips ?? null;
};

export interface CareerSummary {
  chips: number;
  games: Array<{ gameType: string; total: number; wins: number }>;
  recent: Array<{ gameType: string; result: string; chipsDelta: number; chipsAfter: number; createdAt: Date }>;
}

/** 个人中心生涯：当前积分 + 分游戏统计 + 最近 20 条流水 */
export const getCareer = async (userId: number): Promise<CareerSummary> => {
  const user = await User.findByPk(userId, { attributes: ['battleChips'] });
  const grouped = await BattleRecord.findAll({
    attributes: ['gameType', [fn('COUNT', col('id')), 'total'], [fn("SUM", literal("CASE WHEN result = 'win' THEN 1 ELSE 0 END")), 'wins']],
    where: { userId },
    group: ['gameType'],
    raw: true,
  });
  const recent = await BattleRecord.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit: 20,
  });
  return {
    chips: user?.battleChips ?? 0,
    games: (grouped as any[]).map((g) => ({
      gameType: g.gameType,
      total: Number(g.total),
      wins: Number(g.wins || 0),
    })),
    recent: recent.map((r) => ({
      gameType: r.gameType,
      result: r.result,
      chipsDelta: r.chipsDelta,
      chipsAfter: r.chipsAfter,
      createdAt: r.createdAt as unknown as Date,
    })),
  };
};
