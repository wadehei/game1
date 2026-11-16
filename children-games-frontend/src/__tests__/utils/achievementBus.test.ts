import { describe, it, expect, beforeEach } from 'vitest';
import {
  pendingAchievements,
  notifyAchievements,
  shiftAchievement,
  type AchievementMeta,
} from '../../utils/achievementBus';

describe('achievementBus', () => {
  beforeEach(() => {
    // 清空待展示队列
    pendingAchievements.value = [];
  });

  describe('pendingAchievements', () => {
    it('should be a Vue ref', () => {
      expect(pendingAchievements).toHaveProperty('value');
    });

    it('should start as empty array', () => {
      expect(pendingAchievements.value).toEqual([]);
    });
  });

  describe('notifyAchievements', () => {
    it('should add achievements to pending queue', () => {
      const achievements: AchievementMeta[] = [
        { id: 'first-win', name: '首次胜利', icon: '🏆' },
        { id: 'score-100', name: '百分成就', icon: '💯' },
      ];

      notifyAchievements(achievements);

      expect(pendingAchievements.value).toHaveLength(2);
      expect(pendingAchievements.value[0].id).toBe('first-win');
      expect(pendingAchievements.value[1].id).toBe('score-100');
    });

    it('should append to existing queue', () => {
      const first: AchievementMeta[] = [{ id: 'a', name: 'A', icon: '🎯' }];
      const second: AchievementMeta[] = [{ id: 'b', name: 'B', icon: '🎪' }];

      notifyAchievements(first);
      notifyAchievements(second);

      expect(pendingAchievements.value).toHaveLength(2);
      expect(pendingAchievements.value[0].id).toBe('a');
      expect(pendingAchievements.value[1].id).toBe('b');
    });

    it('should not modify queue with empty array', () => {
      const existing: AchievementMeta[] = [{ id: 'existing', name: 'Existing', icon: '⭐' }];
      pendingAchievements.value = [...existing];

      notifyAchievements([]);

      expect(pendingAchievements.value).toHaveLength(1);
    });
  });

  describe('shiftAchievement', () => {
    it('should return and remove first achievement', () => {
      pendingAchievements.value = [
        { id: 'first', name: 'First', icon: '🥇' },
        { id: 'second', name: 'Second', icon: '🥈' },
      ];

      const result = shiftAchievement();

      expect(result).toEqual({ id: 'first', name: 'First', icon: '🥇' });
      expect(pendingAchievements.value).toHaveLength(1);
      expect(pendingAchievements.value[0].id).toBe('second');
    });

    it('should return undefined when queue is empty', () => {
      const result = shiftAchievement();

      expect(result).toBeUndefined();
      expect(pendingAchievements.value).toHaveLength(0);
    });

    it('should empty queue after all shifts', () => {
      pendingAchievements.value = [{ id: 'only', name: 'Only', icon: '🎁' }];

      shiftAchievement();

      expect(pendingAchievements.value).toHaveLength(0);
    });
  });

  describe('AchievementMeta 类型', () => {
    it('should have correct structure', () => {
      const meta: AchievementMeta = {
        id: 'test-achievement',
        name: '测试成就',
        icon: '🏅',
      };

      expect(meta.id).toBe('test-achievement');
      expect(meta.name).toBe('测试成就');
      expect(meta.icon).toBe('🏅');
    });
  });
});
