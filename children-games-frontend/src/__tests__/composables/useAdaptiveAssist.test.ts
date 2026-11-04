import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock useUserStore ───────────────────────────────────

const { mockUserInfo } = vi.hoisted(() => ({
  mockUserInfo: { id: 123, nickname: '测试用户', avatar: 'avatar1' },
}));

vi.mock('@/store/user', () => ({
  useUserStore: () => ({
    userInfo: mockUserInfo,
  }),
}));

// 导入被测模块
import { useAdaptiveAssist } from '@/composables/useAdaptiveAssist';

describe('composables/useAdaptiveAssist', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('level()', () => {
    it('应该默认返回 0（无历史记录）', () => {
      const { level } = useAdaptiveAssist('memory');
      expect(level()).toBe(0);
    });

    it('应该返回当前 assist 值（已有记录）', () => {
      // 预设 localStorage
      localStorage.setItem('assist_123_memory', JSON.stringify({ assist: 1, streak: 0 }));

      const { level } = useAdaptiveAssist('memory');
      expect(level()).toBe(1);
    });

    it('应该将值钳位在 0~2 范围（超过 2）', () => {
      localStorage.setItem('assist_123_memory', JSON.stringify({ assist: 5, streak: 0 }));

      const { level } = useAdaptiveAssist('memory');
      expect(level()).toBe(2);
    });

    it('应该将值钳位在 0~2 范围（负数）', () => {
      localStorage.setItem('assist_123_memory', JSON.stringify({ assist: -1, streak: 0 }));

      const { level } = useAdaptiveAssist('memory');
      expect(level()).toBe(0);
    });
  });

  describe('record(true) — 赢了降档', () => {
    it('应该从 1 降到 0', () => {
      localStorage.setItem('assist_123_memory', JSON.stringify({ assist: 1, streak: 0 }));

      const { record } = useAdaptiveAssist('memory');
      const newLevel = record(true);

      expect(newLevel).toBe(0);

      // 验证存储
      const stored = JSON.parse(localStorage.getItem('assist_123_memory') || '{}');
      expect(stored.assist).toBe(0);
      expect(stored.streak).toBe(0);
    });

    it('不应该降到负数（assist 0 → 0）', () => {
      localStorage.setItem('assist_123_memory', JSON.stringify({ assist: 0, streak: 0 }));

      const { record } = useAdaptiveAssist('memory');
      const newLevel = record(true);

      expect(newLevel).toBe(0);
    });

    it('应该重置连败计数（streak → 0）', () => {
      localStorage.setItem('assist_123_memory', JSON.stringify({ assist: 1, streak: 1 }));

      const { record } = useAdaptiveAssist('memory');
      record(true);

      const stored = JSON.parse(localStorage.getItem('assist_123_memory') || '{}');
      expect(stored.streak).toBe(0);
    });
  });

  describe('record(false) — 输了升档', () => {
    it('一次不升档（streak 1, assist 不变）', () => {
      localStorage.setItem('assist_123_memory', JSON.stringify({ assist: 0, streak: 0 }));

      const { record } = useAdaptiveAssist('memory');
      const newLevel = record(false);

      expect(newLevel).toBe(0);

      const stored = JSON.parse(localStorage.getItem('assist_123_memory') || '{}');
      expect(stored.streak).toBe(1);
    });

    it('连输两次升一档（streak 2 → assist+1, streak 重置）', () => {
      localStorage.setItem('assist_123_memory', JSON.stringify({ assist: 0, streak: 1 }));

      const { record } = useAdaptiveAssist('memory');
      const newLevel = record(false);

      expect(newLevel).toBe(1);

      const stored = JSON.parse(localStorage.getItem('assist_123_memory') || '{}');
      expect(stored.assist).toBe(1);
      expect(stored.streak).toBe(0);
    });

    it('连输两次后再输再升一档（最高到 2）', () => {
      localStorage.setItem('assist_123_memory', JSON.stringify({ assist: 1, streak: 1 }));

      const { record } = useAdaptiveAssist('memory');
      const newLevel = record(false);

      expect(newLevel).toBe(2);
    });

    it('封顶 2 后不再升', () => {
      localStorage.setItem('assist_123_memory', JSON.stringify({ assist: 2, streak: 1 }));

      const { record } = useAdaptiveAssist('memory');
      const newLevel = record(false);

      expect(newLevel).toBe(2);

      const stored = JSON.parse(localStorage.getItem('assist_123_memory') || '{}');
      expect(stored.assist).toBe(2);
    });
  });

  describe('storageKey 隔离', () => {
    it('不同 gameId 使用不同 key', () => {
      localStorage.setItem('assist_123_memory', JSON.stringify({ assist: 1, streak: 0 }));
      localStorage.setItem('assist_123_puzzle', JSON.stringify({ assist: 2, streak: 0 }));

      const { level: memoryLevel } = useAdaptiveAssist('memory');
      const { level: puzzleLevel } = useAdaptiveAssist('puzzle');

      expect(memoryLevel()).toBe(1);
      expect(puzzleLevel()).toBe(2);
    });

    it('不同 userId 使用不同 key', () => {
      // 用户 123
      localStorage.setItem('assist_123_memory', JSON.stringify({ assist: 1, streak: 0 }));

      // 切换用户（修改 mock）
      mockUserInfo.id = 456;
      localStorage.setItem('assist_456_memory', JSON.stringify({ assist: 2, streak: 0 }));

      const { level } = useAdaptiveAssist('memory');
      expect(level()).toBe(2);

      // 恢复
      mockUserInfo.id = 123;
    });
  });

  describe('边界情况', () => {
    it('localStorage 为空对象时返回默认值', () => {
      localStorage.setItem('assist_123_memory', '{}');

      const { level } = useAdaptiveAssist('memory');
      expect(level()).toBe(0);
    });

    it('localStorage 格式错误时返回默认值', () => {
      localStorage.setItem('assist_123_memory', 'invalid json');

      const { level } = useAdaptiveAssist('memory');
      expect(level()).toBe(0);
    });

    it('localStorage 不可用时安全降级', () => {
      const originalGetItem = localStorage.getItem;
      localStorage.getItem = vi.fn().mockImplementation(() => {
        throw new Error('localStorage unavailable');
      });

      const { level } = useAdaptiveAssist('memory');
      expect(level()).toBe(0);

      localStorage.getItem = originalGetItem;
    });
  });
});
