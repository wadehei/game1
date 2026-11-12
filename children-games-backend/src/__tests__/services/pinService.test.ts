import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  hashPin,
  verifyPin,
  isValidPin,
  checkThrottle,
  recordFail,
  clearFails,
} from '../../services/pinService';
import bcrypt from 'bcrypt';

// Mock bcrypt
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2b$12$mockhash'),
    compare: vi.fn().mockResolvedValue(true),
  },
  hash: vi.fn().mockResolvedValue('$2b$12$mockhash'),
  compare: vi.fn().mockResolvedValue(true),
}));

describe('pinService', () => {
  // Use unique user IDs for each test to avoid state pollution
  let userIdCounter = 1000;
  const getNextUserId = () => ++userIdCounter;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('hashPin', () => {
    it('should hash PIN with bcrypt', async () => {
      const result = await hashPin('1234');

      expect(bcrypt.hash).toHaveBeenCalledWith('1234', 12);
      expect(result).toBe('$2b$12$mockhash');
    });
  });

  describe('verifyPin', () => {
    it('should return true for correct PIN', async () => {
      vi.mocked(bcrypt.compare).mockImplementation(() => Promise.resolve(true));

      const result = await verifyPin('1234', '$2b$12$hash');

      expect(bcrypt.compare).toHaveBeenCalledWith('1234', '$2b$12$hash');
      expect(result).toBe(true);
    });

    it('should return false for incorrect PIN', async () => {
      vi.mocked(bcrypt.compare).mockImplementation(() => Promise.resolve(false));

      const result = await verifyPin('wrong', '$2b$12$hash');

      expect(result).toBe(false);
    });
  });

  describe('isValidPin', () => {
    it('should accept 4-digit string', () => {
      expect(isValidPin('1234')).toBe(true);
      expect(isValidPin('0000')).toBe(true);
      expect(isValidPin('9999')).toBe(true);
    });

    it('should reject non-4-digit strings', () => {
      expect(isValidPin('123')).toBe(false);
      expect(isValidPin('12345')).toBe(false);
      expect(isValidPin('')).toBe(false);
      expect(isValidPin('abcd')).toBe(false);
      expect(isValidPin('12.4')).toBe(false);
    });

    it('should reject non-string values', () => {
      expect(isValidPin(1234)).toBe(false);
      expect(isValidPin(null)).toBe(false);
      expect(isValidPin(undefined)).toBe(false);
      expect(isValidPin({})).toBe(false);
      expect(isValidPin([])).toBe(false);
    });
  });

  describe('checkThrottle', () => {
    it('should return null when no failed attempts', () => {
      const userId = getNextUserId();
      const result = checkThrottle(userId);
      expect(result).toBeNull();
    });

    it('should return null when lockout has expired', () => {
      const userId = getNextUserId();
      // Record failures to trigger lockout
      for (let i = 0; i < 5; i++) {
        recordFail(userId);
      }

      // Move time forward past lockout (60 seconds)
      vi.advanceTimersByTime(61_000);

      const result = checkThrottle(userId);
      expect(result).toBeNull();
    });

    it('should return lockedUntil timestamp when locked', () => {
      const userId = getNextUserId();
      // Record failures to trigger lockout
      for (let i = 0; i < 5; i++) {
        recordFail(userId);
      }

      const result = checkThrottle(userId);
      expect(result).not.toBeNull();
      expect(result).toBeGreaterThan(Date.now());
    });
  });

  describe('recordFail', () => {
    it('should not lock before 5 attempts', () => {
      const userId = getNextUserId();
      for (let i = 0; i < 4; i++) {
        recordFail(userId);
      }

      const result = checkThrottle(userId);
      expect(result).toBeNull();
    });

    it('should lock for 60 seconds after 5 attempts', () => {
      const userId = getNextUserId();
      for (let i = 0; i < 5; i++) {
        recordFail(userId);
      }

      const lockedUntil = checkThrottle(userId);
      expect(lockedUntil).not.toBeNull();

      // Should be locked for approximately 60 seconds
      const lockDuration = lockedUntil! - Date.now();
      expect(lockDuration).toBeGreaterThanOrEqual(59_000);
      expect(lockDuration).toBeLessThanOrEqual(60_000);
    });

    it('should reset count after lockout triggered', () => {
      const userId = getNextUserId();
      // Trigger 5-attempt lockout
      for (let i = 0; i < 5; i++) {
        recordFail(userId);
      }

      // Wait for lockout to expire
      vi.advanceTimersByTime(61_000);

      // Should not be locked anymore
      expect(checkThrottle(userId)).toBeNull();

      // Should be able to fail 4 more times without lockout
      for (let i = 0; i < 4; i++) {
        recordFail(userId);
      }
      expect(checkThrottle(userId)).toBeNull();

      // 5th more failure should lock again
      recordFail(userId);
      expect(checkThrottle(userId)).not.toBeNull();
    });

    it('should track attempts per user separately', () => {
      const user1 = getNextUserId();
      const user2 = getNextUserId();

      // 4 failures for user1
      for (let i = 0; i < 4; i++) {
        recordFail(user1);
      }

      // 5 failures for user2
      for (let i = 0; i < 5; i++) {
        recordFail(user2);
      }

      // User1 should not be locked
      expect(checkThrottle(user1)).toBeNull();

      // User2 should be locked
      expect(checkThrottle(user2)).not.toBeNull();
    });
  });

  describe('clearFails', () => {
    it('should clear failure count for user', () => {
      const userId = getNextUserId();
      // Record some failures
      for (let i = 0; i < 4; i++) {
        recordFail(userId);
      }

      // Clear failures
      clearFails(userId);

      // Should not be locked
      expect(checkThrottle(userId)).toBeNull();
    });

    it('should clear lockout for user', () => {
      const userId = getNextUserId();
      // Lock user
      for (let i = 0; i < 5; i++) {
        recordFail(userId);
      }

      expect(checkThrottle(userId)).not.toBeNull();

      // Clear failures
      clearFails(userId);

      // Should no longer be locked
      expect(checkThrottle(userId)).toBeNull();
    });

    it('should not affect other users', () => {
      const user1 = getNextUserId();
      const user2 = getNextUserId();

      // Lock user1
      for (let i = 0; i < 5; i++) {
        recordFail(user1);
      }

      // Clear user2 (who has no failures)
      clearFails(user2);

      // User1 should still be locked
      expect(checkThrottle(user1)).not.toBeNull();
    });
  });
});
