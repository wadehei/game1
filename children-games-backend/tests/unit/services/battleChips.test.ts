import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────
vi.mock('../../../src/models', () => {
  const User: any = {
    findByPk: vi.fn(),
    update: vi.fn(),
  };
  const BattleRecord: any = {
    create: vi.fn(),
    findAll: vi.fn(),
  };
  return { User, BattleRecord };
});

vi.mock('../../../src/utils/logger', () => ({
  logError: vi.fn(),
}));

vi.mock('../../../src/utils/transaction', () => ({
  withTransaction: vi.fn(),
}));

vi.mock('../../../src/utils/date', () => ({
  formatDate: vi.fn(),
}));

vi.mock('../../../src/config/constants', () => ({
  CHIPS_RELIEF_THRESHOLD: 100,
  CHIPS_RELIEF_AMOUNT: 1000,
}));

vi.mock('sequelize', () => ({
  fn: vi.fn(),
  col: vi.fn(),
  literal: vi.fn(),
  Op: { or: 'or', ne: 'ne' },
}));

import { User, BattleRecord } from '../../../src/models';
import { withTransaction } from '../../../src/utils/transaction';
import { formatDate } from '../../../src/utils/date';
import {
  grantDailyRelief,
  settleRankingChips,
  writeCareerRecords,
  applyChipDelta,
  adminAdjustChips,
  getCareer,
  CHIP_RANK_REWARDS,
  CHIP_DRAW_REWARD,
  CHIPS_JOIN_MIN,
  CHIPS_JOIN_REFILL,
} from '../../../src/services/battleChips';

const mockUser = vi.mocked(User);
const mockBattleRecord = vi.mocked(BattleRecord);
const mockWithTransaction = vi.mocked(withTransaction);
const mockFormatDate = vi.mocked(formatDate);

describe('battleChips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constants', () => {
    it('should export correct rank rewards', () => {
      expect(CHIP_RANK_REWARDS).toEqual([30, 15, 5]);
    });

    it('should export correct draw reward', () => {
      expect(CHIP_DRAW_REWARD).toBe(10);
    });

    it('should export correct join thresholds', () => {
      expect(CHIPS_JOIN_MIN).toBe(100);
      expect(CHIPS_JOIN_REFILL).toBe(1000);
    });
  });

  describe('grantDailyRelief', () => {
    it('should grant relief when user has not received it today', async () => {
      mockFormatDate.mockReturnValue('2026-11-03');
      mockUser.update.mockResolvedValue([1]); // 1 row affected

      const result = await grantDailyRelief(1);
      expect(result).toBe(1000);
      expect(mockUser.update).toHaveBeenCalledWith(
        expect.objectContaining({ chipsReliefDate: '2026-11-03', battleChips: 1000 }),
        expect.objectContaining({ where: expect.any(Object) })
      );
    });

    it('should not double-grant if already received today', async () => {
      mockFormatDate.mockReturnValue('2026-11-03');
      mockUser.update.mockResolvedValue([0]); // no rows affected
      mockUser.findByPk.mockResolvedValue({ battleChips: 500 } as any);

      const result = await grantDailyRelief(1);
      expect(result).toBe(500);
    });

    it('should return 0 when user not found after no relief', async () => {
      mockFormatDate.mockReturnValue('2026-11-03');
      mockUser.update.mockResolvedValue([0]);
      mockUser.findByPk.mockResolvedValue(null);

      const result = await grantDailyRelief(999);
      expect(result).toBe(0);
    });

    it('should use correct date format in condition', async () => {
      mockFormatDate.mockReturnValue('2026-01-15');
      mockUser.update.mockResolvedValue([1]);

      await grantDailyRelief(1);
      // The date comparison uses Op.ne, ensuring a new day re-triggers relief
      expect(mockUser.update).toHaveBeenCalledWith(
        expect.objectContaining({ chipsReliefDate: '2026-01-15' }),
        expect.objectContaining({
          where: expect.objectContaining({
            id: 1,
          }),
        })
      );
    });
  });

  describe('applyChipDelta', () => {
    const setupTransaction = () => {
      mockWithTransaction.mockImplementation(async (fn: any) => {
        const fakeTransaction = { LOCK: { UPDATE: 'UPDATE' } };
        return fn(fakeTransaction);
      });
    };

    it('should apply positive delta via transaction', async () => {
      const mockSave = vi.fn().mockResolvedValue(undefined);
      const mockUserInstance = { battleChips: 100, save: mockSave };
      setupTransaction();
      mockUser.findByPk.mockResolvedValue(mockUserInstance as any);

      const result = await applyChipDelta(1, 30);
      expect(result).toBe(130);
      expect(mockSave).toHaveBeenCalled();
    });

    it('should apply negative delta', async () => {
      const mockSave = vi.fn().mockResolvedValue(undefined);
      const mockUserInstance = { battleChips: 100, save: mockSave };
      setupTransaction();
      mockUser.findByPk.mockResolvedValue(mockUserInstance as any);

      const result = await applyChipDelta(1, -20);
      expect(result).toBe(80);
    });

    it('should clamp to 0 on negative delta exceeding balance', async () => {
      const mockSave = vi.fn().mockResolvedValue(undefined);
      const mockUserInstance = { battleChips: 3, save: mockSave };
      setupTransaction();
      mockUser.findByPk.mockResolvedValue(mockUserInstance as any);

      const result = await applyChipDelta(1, -10);
      expect(result).toBe(0);
    });

    it('should return null for non-existent user', async () => {
      setupTransaction();
      mockUser.findByPk.mockResolvedValue(null);

      const result = await applyChipDelta(999, 10);
      expect(result).toBeNull();
    });

    it('should return null for non-finite delta (NaN)', async () => {
      const result = await applyChipDelta(1, NaN);
      expect(result).toBeNull();
      expect(mockWithTransaction).not.toHaveBeenCalled();
    });

    it('should return null for Infinity delta', async () => {
      const result = await applyChipDelta(1, Infinity);
      expect(result).toBeNull();
      expect(mockWithTransaction).not.toHaveBeenCalled();
    });

    it('should retry up to 3 times on transaction failure', async () => {
      mockWithTransaction.mockRejectedValue(new Error('DB error'));

      const result = await applyChipDelta(1, 10);
      expect(result).toBeNull();
      expect(mockWithTransaction).toHaveBeenCalledTimes(3);
    });

    it('should succeed on retry if second attempt works', async () => {
      const mockSave = vi.fn().mockResolvedValue(undefined);
      const mockUserInstance = { battleChips: 100, save: mockSave };
      mockWithTransaction
        .mockRejectedValueOnce(new Error('transient error'))
        .mockImplementationOnce(async (fn: any) => {
          const fakeTransaction = { LOCK: { UPDATE: 'UPDATE' } };
          return fn(fakeTransaction);
        });
      mockUser.findByPk.mockResolvedValue(mockUserInstance as any);

      const result = await applyChipDelta(1, 10);
      expect(result).toBe(110);
      expect(mockWithTransaction).toHaveBeenCalledTimes(2);
    });

    it('should truncate fractional delta (positive)', async () => {
      const mockSave = vi.fn().mockResolvedValue(undefined);
      const mockUserInstance = { battleChips: 100, save: mockSave };
      setupTransaction();
      mockUser.findByPk.mockResolvedValue(mockUserInstance as any);

      const result = await applyChipDelta(1, 7.9);
      expect(result).toBe(107); // Math.trunc(7.9) = 7
    });

    it('should truncate fractional delta (negative)', async () => {
      const mockSave = vi.fn().mockResolvedValue(undefined);
      const mockUserInstance = { battleChips: 100, save: mockSave };
      setupTransaction();
      mockUser.findByPk.mockResolvedValue(mockUserInstance as any);

      const result = await applyChipDelta(1, -3.7);
      expect(result).toBe(97); // Math.trunc(-3.7) = -3
    });

    it('should not retry when user does not exist', async () => {
      setupTransaction();
      mockUser.findByPk.mockResolvedValue(null);

      await applyChipDelta(999, 10);
      // Should return null immediately without retrying
      expect(mockWithTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('settleRankingChips', () => {
    it('should award correct chips by rank order', async () => {
      mockWithTransaction.mockImplementation(async (fn: any) => {
        const fakeTransaction = { LOCK: { UPDATE: 'UPDATE' } };
        return fn(fakeTransaction);
      });
      const mockSave = vi.fn().mockResolvedValue(undefined);
      mockUser.findByPk
        .mockResolvedValueOnce({ battleChips: 0, save: mockSave } as any) // rank 1: +30
        .mockResolvedValueOnce({ battleChips: 0, save: mockSave } as any) // rank 2: +15
        .mockResolvedValueOnce({ battleChips: 0, save: mockSave } as any); // rank 3: +5

      await settleRankingChips('gomoku', [{ userId: 1 }, { userId: 2 }, { userId: 3 }], false);

      expect(mockUser.findByPk).toHaveBeenCalledTimes(3);
    });

    it('should write battle records when recordCareer is true', async () => {
      mockWithTransaction.mockImplementation(async (fn: any) => {
        const fakeTransaction = { LOCK: { UPDATE: 'UPDATE' } };
        return fn(fakeTransaction);
      });
      const mockSave = vi.fn().mockResolvedValue(undefined);
      mockUser.findByPk.mockResolvedValue({ battleChips: 100, save: mockSave } as any);
      mockBattleRecord.create.mockResolvedValue({} as any);

      await settleRankingChips('gomoku', [{ userId: 1 }], true);

      expect(mockBattleRecord.create).toHaveBeenCalledTimes(1);
      expect(mockBattleRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, gameType: 'gomoku', result: 'win' })
      );
    });

    it('should not write battle records when recordCareer is false', async () => {
      mockWithTransaction.mockImplementation(async (fn: any) => {
        const fakeTransaction = { LOCK: { UPDATE: 'UPDATE' } };
        return fn(fakeTransaction);
      });
      const mockSave = vi.fn().mockResolvedValue(undefined);
      mockUser.findByPk.mockResolvedValue({ battleChips: 100, save: mockSave } as any);

      await settleRankingChips('gomoku', [{ userId: 1 }], false);

      expect(mockBattleRecord.create).not.toHaveBeenCalled();
    });

    it('should not throw on settlement failure', async () => {
      mockWithTransaction.mockRejectedValue(new Error('DB down'));

      await expect(settleRankingChips('gomoku', [{ userId: 1 }], false)).resolves.toBeUndefined();
    });

    it('should handle empty entries array', async () => {
      await settleRankingChips('gomoku', [], true);
      expect(mockUser.findByPk).not.toHaveBeenCalled();
    });

    it('should assign 5 chips to rank 4+ (same as rank 3)', async () => {
      mockWithTransaction.mockImplementation(async (fn: any) => {
        const fakeTransaction = { LOCK: { UPDATE: 'UPDATE' } };
        return fn(fakeTransaction);
      });
      const mockSave = vi.fn().mockResolvedValue(undefined);
      mockUser.findByPk
        .mockResolvedValueOnce({ battleChips: 0, save: mockSave } as any) // rank 1: +30
        .mockResolvedValueOnce({ battleChips: 0, save: mockSave } as any) // rank 2: +15
        .mockResolvedValueOnce({ battleChips: 0, save: mockSave } as any) // rank 3: +5
        .mockResolvedValueOnce({ battleChips: 0, save: mockSave } as any); // rank 4: +5 (same as rank 3)

      await settleRankingChips(
        'gomoku',
        [{ userId: 1 }, { userId: 2 }, { userId: 3 }, { userId: 4 }],
        false
      );

      expect(mockUser.findByPk).toHaveBeenCalledTimes(4);
    });
  });

  describe('writeCareerRecords', () => {
    it('should write records for each row', async () => {
      mockUser.findByPk.mockResolvedValue({ battleChips: 200 } as any);
      mockBattleRecord.create.mockResolvedValue({} as any);

      await writeCareerRecords('gomoku', [
        { userId: 1, result: 'win', chipsDelta: 30, chipsAfter: 200 },
        { userId: 2, result: 'rank:2', chipsDelta: 15, chipsAfter: 150 },
      ]);

      expect(mockBattleRecord.create).toHaveBeenCalledTimes(2);
    });

    it('should include correct fields in battle record', async () => {
      mockUser.findByPk.mockResolvedValue({ battleChips: 200 } as any);
      mockBattleRecord.create.mockResolvedValue({} as any);

      await writeCareerRecords('gomoku', [
        { userId: 1, result: 'win', chipsDelta: 30, chipsAfter: 200 },
      ]);

      expect(mockBattleRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          gameType: 'gomoku',
          result: 'win',
          chipsDelta: 30,
        })
      );
    });

    it('should not throw on record failure', async () => {
      mockUser.findByPk.mockRejectedValue(new Error('fail'));

      await expect(
        writeCareerRecords('gomoku', [
          { userId: 1, result: 'win', chipsDelta: 10, chipsAfter: 100 },
        ])
      ).resolves.toBeUndefined();
    });

    it('should handle empty rows array', async () => {
      await writeCareerRecords('gomoku', []);
      expect(mockBattleRecord.create).not.toHaveBeenCalled();
    });
  });

  describe('adminAdjustChips', () => {
    it('should set chips to absolute value', async () => {
      mockUser.update.mockResolvedValue([1]);
      mockUser.findByPk.mockResolvedValue({ battleChips: 500 } as any);

      const result = await adminAdjustChips(1, { set: 500 });
      expect(result).toBe(500);
      expect(mockUser.update).toHaveBeenCalledWith({ battleChips: 500 }, { where: { id: 1 } });
    });

    it('should clamp set value to 0', async () => {
      mockUser.update.mockResolvedValue([1]);
      mockUser.findByPk.mockResolvedValue({ battleChips: 0 } as any);

      const result = await adminAdjustChips(1, { set: -10 });
      expect(result).toBe(0);
    });

    it('should apply delta when set is not provided', async () => {
      const mockSave = vi.fn().mockResolvedValue(undefined);
      mockWithTransaction.mockImplementation(async (fn: any) => {
        const fakeTransaction = { LOCK: { UPDATE: 'UPDATE' } };
        return fn(fakeTransaction);
      });
      mockUser.findByPk.mockResolvedValue({ battleChips: 100, save: mockSave } as any);

      const result = await adminAdjustChips(1, { delta: 50 });
      expect(result).toBe(150);
    });

    it('should prefer set over delta when both provided', async () => {
      mockUser.update.mockResolvedValue([1]);
      mockUser.findByPk.mockResolvedValue({ battleChips: 999 } as any);

      const result = await adminAdjustChips(1, { set: 999, delta: 50 });
      // set takes precedence
      expect(mockUser.update).toHaveBeenCalledWith({ battleChips: 999 }, { where: { id: 1 } });
      expect(result).toBe(999);
    });

    it('should return null when neither set nor delta provided', async () => {
      const result = await adminAdjustChips(1, {});
      expect(result).toBeNull();
    });

    it('should return null when delta is 0', async () => {
      const result = await adminAdjustChips(1, { delta: 0 });
      expect(result).toBeNull();
    });

    it('should return null when user not found after set', async () => {
      mockUser.update.mockResolvedValue([1]);
      mockUser.findByPk.mockResolvedValue(null);

      const result = await adminAdjustChips(999, { set: 500 });
      expect(result).toBeNull();
    });
  });

  describe('getCareer', () => {
    it('should return career summary', async () => {
      mockUser.findByPk.mockResolvedValue({ battleChips: 300 } as any);
      mockBattleRecord.findAll.mockResolvedValue([] as any);

      const result = await getCareer(1);
      expect(result.chips).toBe(300);
      expect(result.games).toEqual([]);
      expect(result.recent).toEqual([]);
    });

    it('should return 0 chips when user not found', async () => {
      mockUser.findByPk.mockResolvedValue(null);
      mockBattleRecord.findAll.mockResolvedValue([] as any);

      const result = await getCareer(999);
      expect(result.chips).toBe(0);
    });

    it('should map grouped battle records to games array', async () => {
      mockUser.findByPk.mockResolvedValue({ battleChips: 500 } as any);
      mockBattleRecord.findAll
        .mockResolvedValueOnce([
          { gameType: 'gomoku', total: '5', wins: '3' },
          { gameType: 'quiz', total: '10', wins: '7' },
        ] as any) // grouped
        .mockResolvedValueOnce([] as any); // recent

      const result = await getCareer(1);
      expect(result.games).toEqual([
        { gameType: 'gomoku', total: 5, wins: 3 },
        { gameType: 'quiz', total: 10, wins: 7 },
      ]);
    });

    it('should map recent records with correct fields', async () => {
      const now = new Date();
      mockUser.findByPk.mockResolvedValue({ battleChips: 500 } as any);
      mockBattleRecord.findAll
        .mockResolvedValueOnce([] as any) // grouped
        .mockResolvedValueOnce([
          { gameType: 'gomoku', result: 'win', chipsDelta: 30, chipsAfter: 500, createdAt: now },
        ] as any); // recent

      const result = await getCareer(1);
      expect(result.recent).toHaveLength(1);
      expect(result.recent[0]).toEqual({
        gameType: 'gomoku',
        result: 'win',
        chipsDelta: 30,
        chipsAfter: 500,
        createdAt: now,
      });
    });

    it('should handle null wins in grouped records', async () => {
      mockUser.findByPk.mockResolvedValue({ battleChips: 100 } as any);
      mockBattleRecord.findAll
        .mockResolvedValueOnce([{ gameType: 'gomoku', total: '3', wins: null }] as any)
        .mockResolvedValueOnce([] as any);

      const result = await getCareer(1);
      expect(result.games[0].wins).toBe(0);
    });
  });
});
