import { describe, it, expect } from 'vitest';
import {
  ACHIEVEMENTS,
  GAME_RULES,
  type AchievementDef,
} from '../../src/services/achievementService';

describe('achievementService', () => {
  describe('GAME_RULES', () => {
    it('should have all expected games', () => {
      const expectedGames = ['memory', 'puzzle', 'fruit', 'balloon', 'tank', 'mole', 'simon', 'math', 'match3', 'brick'];
      expectedGames.forEach((game) => {
        expect(GAME_RULES[game]).toBeDefined();
        expect(typeof GAME_RULES[game].lowerScoreIsBetter).toBe('boolean');
      });
    });

    it('should have correct scoring direction for step-based games', () => {
      // Games where lower score is better (steps/time)
      expect(GAME_RULES.memory.lowerScoreIsBetter).toBe(true);
      expect(GAME_RULES.puzzle.lowerScoreIsBetter).toBe(true);
      expect(GAME_RULES.math.lowerScoreIsBetter).toBe(true);
      expect(GAME_RULES.match3.lowerScoreIsBetter).toBe(true);
    });

    it('should have correct scoring direction for point-based games', () => {
      // Games where higher score is better (points/score)
      expect(GAME_RULES.fruit.lowerScoreIsBetter).toBe(false);
      expect(GAME_RULES.balloon.lowerScoreIsBetter).toBe(false);
      expect(GAME_RULES.tank.lowerScoreIsBetter).toBe(false);
      expect(GAME_RULES.mole.lowerScoreIsBetter).toBe(false);
    });
  });

  describe('ACHIEVEMENTS', () => {
    it('should have all achievements defined', () => {
      expect(ACHIEVEMENTS.length).toBe(9);
    });

    it('should have unique IDs', () => {
      const ids = ACHIEVEMENTS.map((a) => a.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('each achievement should have required fields', () => {
      ACHIEVEMENTS.forEach((ach) => {
        expect(ach.id).toBeTruthy();
        expect(ach.name).toBeTruthy();
        expect(ach.icon).toBeTruthy();
        expect(ach.desc).toBeTruthy();
        expect(typeof ach.check).toBe('function');
      });
    });

    describe('achievement checks', () => {
      it('first_win should check totalStars > 0', () => {
        const firstWin = ACHIEVEMENTS.find((a) => a.id === 'first_win')!;
        expect(firstWin.check({ totalStars: 0, levels: {}, distinctGames: 0, dailyRewardClaimed: false })).toBe(false);
        expect(firstWin.check({ totalStars: 1, levels: {}, distinctGames: 0, dailyRewardClaimed: false })).toBe(true);
      });

      it('star_10 should check totalStars >= 10', () => {
        const star10 = ACHIEVEMENTS.find((a) => a.id === 'star_10')!;
        expect(star10.check({ totalStars: 9, levels: {}, distinctGames: 0, dailyRewardClaimed: false })).toBe(false);
        expect(star10.check({ totalStars: 10, levels: {}, distinctGames: 0, dailyRewardClaimed: false })).toBe(true);
      });

      it('memory_master should check memory level >= 10', () => {
        const memoryMaster = ACHIEVEMENTS.find((a) => a.id === 'memory_master')!;
        expect(memoryMaster.check({ totalStars: 0, levels: { memory: 9 }, distinctGames: 0, dailyRewardClaimed: false })).toBe(false);
        expect(memoryMaster.check({ totalStars: 0, levels: { memory: 10 }, distinctGames: 0, dailyRewardClaimed: false })).toBe(true);
      });

      it('all_rounder should check distinctGames >= total games', () => {
        const allRounder = ACHIEVEMENTS.find((a) => a.id === 'all_rounder')!;
        const totalGames = Object.keys(GAME_RULES).length;
        expect(allRounder.check({ totalStars: 0, levels: {}, distinctGames: totalGames - 1, dailyRewardClaimed: false })).toBe(false);
        expect(allRounder.check({ totalStars: 0, levels: {}, distinctGames: totalGames, dailyRewardClaimed: false })).toBe(true);
      });

      it('daily_done should check dailyRewardClaimed', () => {
        const dailyDone = ACHIEVEMENTS.find((a) => a.id === 'daily_done')!;
        expect(dailyDone.check({ totalStars: 0, levels: {}, distinctGames: 0, dailyRewardClaimed: false })).toBe(false);
        expect(dailyDone.check({ totalStars: 0, levels: {}, distinctGames: 0, dailyRewardClaimed: true })).toBe(true);
      });
    });
  });
});
