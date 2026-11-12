import { describe, it, expect } from 'vitest';
import {
  localDateString,
  DAILY_TASK_GOAL,
  DAILY_TASK_REWARD,
} from '../../src/services/dailyTaskService';

describe('dailyTaskService', () => {
  describe('localDateString', () => {
    it('should return date in YYYY-MM-DD format', () => {
      const result = localDateString();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return today date', () => {
      const result = localDateString();
      const today = new Date();
      const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      expect(result).toBe(expected);
    });
  });

  describe('constants', () => {
    it('should have correct DAILY_TASK_GOAL', () => {
      expect(DAILY_TASK_GOAL).toBe(3);
    });

    it('should have correct DAILY_TASK_REWARD', () => {
      expect(DAILY_TASK_REWARD).toBe(10);
    });
  });
});
