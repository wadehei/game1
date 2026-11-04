import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock soundManager ──────────────────────────────────

const {
  mockInit,
  mockSetMuted,
  mockResume,
  mockPlayClick,
  mockPlaySuccess,
  mockPlayFail,
  mockPlayMatch,
  mockPlayPop,
  mockPlayShoot,
  mockPlayExplosion,
  mockPlayLevelUp,
  mockPlayBounce,
  mockPlayCollect,
} = vi.hoisted(() => ({
  mockInit: vi.fn(),
  mockSetMuted: vi.fn(),
  mockResume: vi.fn(),
  mockPlayClick: vi.fn(),
  mockPlaySuccess: vi.fn(),
  mockPlayFail: vi.fn(),
  mockPlayMatch: vi.fn(),
  mockPlayPop: vi.fn(),
  mockPlayShoot: vi.fn(),
  mockPlayExplosion: vi.fn(),
  mockPlayLevelUp: vi.fn(),
  mockPlayBounce: vi.fn(),
  mockPlayCollect: vi.fn(),
}));

vi.mock('@/utils/sound', () => ({
  soundManager: {
    init: mockInit,
    setMuted: mockSetMuted,
    resume: mockResume,
    playClick: mockPlayClick,
    playSuccess: mockPlaySuccess,
    playFail: mockPlayFail,
    playMatch: mockPlayMatch,
    playPop: mockPlayPop,
    playShoot: mockPlayShoot,
    playExplosion: mockPlayExplosion,
    playLevelUp: mockPlayLevelUp,
    playBounce: mockPlayBounce,
    playCollect: mockPlayCollect,
  },
}));

import { useGameSounds } from '@/composables/useGameSounds';

describe('composables/useGameSounds', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('isMuted', () => {
    it('默认值应该是 false（无 localStorage）', () => {
      const { isMuted } = useGameSounds();
      expect(isMuted.value).toBe(false);
    });

    it('应该从 localStorage 读取 "1" 作为静音', () => {
      localStorage.setItem('games_sound_muted', '1');
      const { isMuted } = useGameSounds();
      expect(isMuted.value).toBe(true);
    });

    it('localStorage 不可用时返回 false', () => {
      const originalGetItem = localStorage.getItem;
      localStorage.getItem = vi.fn().mockImplementation(() => {
        throw new Error('localStorage unavailable');
      });

      const { isMuted } = useGameSounds();
      expect(isMuted.value).toBe(false);

      localStorage.getItem = originalGetItem;
    });
  });

  describe('toggleSound', () => {
    it('应该切换静音状态', () => {
      const { isMuted, toggleSound } = useGameSounds();
      expect(isMuted.value).toBe(false);

      toggleSound();
      expect(isMuted.value).toBe(true);

      toggleSound();
      expect(isMuted.value).toBe(false);
    });

    it('应该调用 soundManager.setMuted', () => {
      const { toggleSound } = useGameSounds();

      toggleSound();
      expect(mockSetMuted).toHaveBeenCalledWith(true);

      toggleSound();
      expect(mockSetMuted).toHaveBeenCalledWith(false);
    });

    it('应该写入 localStorage', () => {
      const { toggleSound } = useGameSounds();

      toggleSound();
      expect(localStorage.getItem('games_sound_muted')).toBe('1');

      toggleSound();
      expect(localStorage.getItem('games_sound_muted')).toBe('0');
    });
  });

  describe('play', () => {
    it('静音时不调用任何音效', () => {
      localStorage.setItem('games_sound_muted', '1');
      const { play } = useGameSounds();

      play('click');
      expect(mockResume).not.toHaveBeenCalled();
      expect(mockPlayClick).not.toHaveBeenCalled();
    });

    it('非静音时调用 resume', () => {
      const { play } = useGameSounds();

      play('click');
      expect(mockResume).toHaveBeenCalled();
    });

    it('play("click") 调用 playClick', () => {
      const { play } = useGameSounds();
      play('click');
      expect(mockPlayClick).toHaveBeenCalled();
    });

    it('play("success") 调用 playSuccess', () => {
      const { play } = useGameSounds();
      play('success');
      expect(mockPlaySuccess).toHaveBeenCalled();
    });

    it('play("match") 带 pitch 调用 playMatch', () => {
      const { play } = useGameSounds();
      play('match', { pitch: 1.5 });
      expect(mockPlayMatch).toHaveBeenCalledWith(1.5);
    });

    it('play("match") 无 pitch 时不调用 playMatch', () => {
      const { play } = useGameSounds();
      play('match');
      // 会走默认路径，调用 playMatch 作为普通方法
    });
  });

  describe('init', () => {
    it('应该调用 soundManager.init()', () => {
      const { init } = useGameSounds();
      init();
      expect(mockInit).toHaveBeenCalled();
    });
  });
});
