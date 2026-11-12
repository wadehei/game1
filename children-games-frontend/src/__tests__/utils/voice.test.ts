import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock 基础设施 ───────────────────────────────────────

const {
  mockSpeak,
  mockCancel,
  mockGetVoices,
  mockAudioPlay,
  mockAudioPause,
  MockSpeechSynthesisUtterance,
  MockSpeechSynthesisVoice,
} = vi.hoisted(() => {
  const mockSpeak = vi.fn();
  const mockCancel = vi.fn();
  const mockGetVoices = vi.fn().mockReturnValue([]);
  const mockAudioPlay = vi.fn().mockResolvedValue(undefined);
  const mockAudioPause = vi.fn();

  class MockSpeechSynthesisUtterance {
    text: string;
    voice: MockSpeechSynthesisVoice | null = null;
    lang = '';
    rate = 1;
    pitch = 1;
    volume = 1;
    constructor(text: string) {
      this.text = text;
    }
  }

  class MockSpeechSynthesisVoice {
    name: string;
    lang: string;
    voiceURI: string;
    default = false;
    localService = false;
    constructor(name: string, lang: string) {
      this.name = name;
      this.lang = lang;
      this.voiceURI = name;
    }
  }

  return {
    mockSpeak,
    mockCancel,
    mockGetVoices,
    mockAudioPlay,
    mockAudioPause,
    MockSpeechSynthesisUtterance,
    MockSpeechSynthesisVoice,
  };
});

// Mock speechSynthesis
const mockSpeechSynthesis = {
  speak: mockSpeak,
  cancel: mockCancel,
  getVoices: mockGetVoices,
  speaking: false,
  pending: false,
  onvoiceschanged: null as (() => void) | null,
};

// Mock Audio
vi.stubGlobal(
  'Audio',
  vi.fn().mockImplementation(function (this: any, src: string) {
    this.src = src;
    this.play = mockAudioPlay;
    this.pause = mockAudioPause;
    this.onended = null;
  })
);

vi.stubGlobal('SpeechSynthesisUtterance', MockSpeechSynthesisUtterance);
vi.stubGlobal('speechSynthesis', mockSpeechSynthesis);

// Mock api/voice
const { mockListVoiceLines } = vi.hoisted(() => ({
  mockListVoiceLines: vi.fn(),
}));

vi.mock('../../api/voice', () => ({
  listVoiceLines: mockListVoiceLines,
}));

// Mock API_ORIGIN
vi.mock('../../utils/apiOrigin', () => ({
  API_ORIGIN: 'http://localhost:3000',
}));

// 导入被测模块
import { playVoice, speak, stopSpeaking, initVoice, currentVoiceName } from '../../utils/voice';

// ─── 测试套件 ───────────────────────────────────────────

describe('utils/voice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockSpeechSynthesis.speaking = false;
    mockSpeechSynthesis.pending = false;
    mockSpeechSynthesis.onvoiceschanged = null;
    mockGetVoices.mockReturnValue([]);
    mockListVoiceLines.mockResolvedValue([]);
    // 重置模块状态（cachedVoice, voiceReady, customVoices）
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── playVoice ───────────────────────────────────────────

  describe('playVoice', () => {
    beforeEach(async () => {
      // 等待模块重新加载
      vi.resetModules();
    });

    it('应该在有录音时创建 Audio 播放', async () => {
      mockListVoiceLines.mockResolvedValue([{ key: 'game_start', updatedAt: 1700000000000 }]);

      // 重新导入模块确保状态干净
      const voiceModule = await import('../../utils/voice');
      voiceModule.initVoice();

      // 等待 fetchCustomVoices 完成
      await vi.waitFor(() => {
        expect(mockListVoiceLines).toHaveBeenCalled();
      });

      // 额外等待确保 .then() 链完成
      await new Promise((resolve) => setTimeout(resolve, 10));

      voiceModule.playVoice('game_start', '游戏开始');

      expect(Audio).toHaveBeenCalledWith(
        'http://localhost:3000/api/voice/game_start?v=1700000000000'
      );
      expect(mockAudioPlay).toHaveBeenCalled();
    });

    it('应该在播放失败时降级到 speak', async () => {
      mockListVoiceLines.mockResolvedValue([{ key: 'game_start', updatedAt: 1700000000000 }]);

      // 设置 Audio mock 返回 play 会失败的对象
      const originalAudio = globalThis.Audio;
      let audioInstance: any;
      globalThis.Audio = vi.fn().mockImplementation((src: string) => {
        const instance = {
          src,
          play: vi.fn().mockRejectedValue(new Error('Autoplay blocked')),
          pause: vi.fn(),
          onended: null as null,
        };
        audioInstance = instance;
        return instance;
      }) as unknown as typeof Audio;

      const voiceModule = await import('../../utils/voice');
      voiceModule.initVoice();
      await vi.waitFor(() => expect(mockListVoiceLines).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 10));

      voiceModule.playVoice('game_start', '游戏开始');

      // 等待 catch 执行
      await vi.waitFor(() => {
        expect(mockSpeak).toHaveBeenCalled();
      });

      // 恢复原始 Audio
      globalThis.Audio = originalAudio;
    });

    it('应该在无录音时调用 speak', async () => {
      mockListVoiceLines.mockResolvedValue([]);

      const voiceModule = await import('../../utils/voice');
      voiceModule.initVoice();
      await vi.waitFor(() => expect(mockListVoiceLines).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 10));

      voiceModule.playVoice('unknown_key', 'fallback 文本');

      expect(mockSpeak).toHaveBeenCalled();
    });

    it('应该在静音时不播放', async () => {
      localStorage.setItem('games_sound_muted', '1');
      mockListVoiceLines.mockResolvedValue([{ key: 'game_start', updatedAt: 1700000000000 }]);

      const voiceModule = await import('../../utils/voice');
      voiceModule.initVoice();
      await vi.waitFor(() => expect(mockListVoiceLines).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 10));

      voiceModule.playVoice('game_start', '游戏开始');

      expect(Audio).not.toHaveBeenCalled();
      expect(mockSpeak).not.toHaveBeenCalled();
    });
  });

  // ─── speak ──────────────────────────────────────────────

  describe('speak', () => {
    it('应该创建 Utterance 并调用 speechSynthesis.speak', async () => {
      mockGetVoices.mockReturnValue([new MockSpeechSynthesisVoice('xiaoxiao', 'zh-CN')]);

      const { speak: sp } = await import('../../utils/voice');
      sp('你好');

      expect(mockCancel).toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalled();

      const utterance = mockSpeak.mock.calls[0][0];
      expect(utterance.text).toBe('你好');
      expect(utterance.rate).toBe(0.9);
      expect(utterance.pitch).toBe(1.0);
    });

    it('应该按标点分句', async () => {
      const { speak: sp } = await import('../../utils/voice');
      sp('你好。欢迎使用。');

      // 应该调用 speak 两次（两个句子）
      expect(mockSpeak).toHaveBeenCalledTimes(2);
    });

    it('应该在正在朗读时打断', async () => {
      mockSpeechSynthesis.speaking = true;

      const { speak: sp } = await import('../../utils/voice');
      sp('新的一句话');

      expect(mockCancel).toHaveBeenCalled();
      // 等待 60ms 延迟后的 speak 调用
      await vi.waitFor(
        () => {
          expect(mockSpeak).toHaveBeenCalled();
        },
        { timeout: 200 }
      );
    });

    it('应该在静音时不调用', async () => {
      localStorage.setItem('games_sound_muted', '1');

      const { speak: sp } = await import('../../utils/voice');
      sp('测试文本');

      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it('应该在 speechSynthesis 不可用时静默降级', async () => {
      // 临时移除 speechSynthesis
      const original = globalThis.speechSynthesis;
      // @ts-expect-error 删除必选全局属性以模拟缺失环境
      delete globalThis.speechSynthesis;

      const { speak: sp } = await import('../../utils/voice');
      expect(() => sp('测试')).not.toThrow();

      globalThis.speechSynthesis = original;
    });

    it('应该使用 localStorage 中的音量', async () => {
      localStorage.setItem('games_volume', '0.5');

      const { speak: sp } = await import('../../utils/voice');
      sp('测试音量');

      const utterance = mockSpeak.mock.calls[0][0];
      expect(utterance.volume).toBe(0.5);
    });
  });

  // ─── stopSpeaking ───────────────────────────────────────

  describe('stopSpeaking', () => {
    it('应该调用 speechSynthesis.cancel', () => {
      stopSpeaking();
      expect(mockCancel).toHaveBeenCalled();
    });

    it('应该在 speechSynthesis 不可用时不抛错', () => {
      const original = globalThis.speechSynthesis;
      // @ts-expect-error 删除必选全局属性以模拟缺失环境
      delete globalThis.speechSynthesis;

      expect(() => stopSpeaking()).not.toThrow();

      globalThis.speechSynthesis = original;
    });
  });

  // ─── initVoice ──────────────────────────────────────────

  describe('initVoice', () => {
    it('应该在 speechSynthesis 不可用时静默退出', () => {
      const original = globalThis.speechSynthesis;
      // @ts-expect-error 删除必选全局属性以模拟缺失环境
      delete globalThis.speechSynthesis;

      expect(() => initVoice()).not.toThrow();

      globalThis.speechSynthesis = original;
    });

    it('应该注册 onvoiceschanged 回调', () => {
      initVoice();
      expect(mockSpeechSynthesis.onvoiceschanged).toBeDefined();
    });

    it('应该调用 fetchCustomVoices', async () => {
      initVoice();
      await vi.waitFor(() => expect(mockListVoiceLines).toHaveBeenCalled());
    });

    it('应该注册 pointerdown 和 touchstart 事件', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

      initVoice();

      expect(addEventListenerSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function), {
        once: true,
      });
      expect(addEventListenerSpy).toHaveBeenCalledWith('touchstart', expect.any(Function), {
        once: true,
      });
    });
  });

  // ─── currentVoiceName ──────────────────────────────────

  describe('currentVoiceName', () => {
    it('应该返回音色名称', async () => {
      mockGetVoices.mockReturnValue([new MockSpeechSynthesisVoice('xiaoxiao', 'zh-CN')]);

      // 直接调用，会触发 ensureVoice -> pickBestVoice
      const name = currentVoiceName();

      expect(name).toContain('xiaoxiao');
    });

    it('应该在没有音色时返回提示', async () => {
      // 重置模块状态
      vi.resetModules();
      mockGetVoices.mockReturnValue([]);

      // 需要重新导入以获取干净的状态
      const { currentVoiceName: cvn } = await import('../../utils/voice');
      const name = cvn();

      expect(name).toBe('未找到中文音色');
    });
  });

  // ─── isMuted ───────────────────────────────────────────

  describe('isMuted (通过 playVoice 间接测试)', () => {
    it('应该在 localStorage 为 "1" 时静音', async () => {
      localStorage.setItem('games_sound_muted', '1');
      mockListVoiceLines.mockResolvedValue([{ key: 'test', updatedAt: 123 }]);

      const { playVoice: pv, initVoice: iv } = await import('../../utils/voice');
      iv();
      await vi.waitFor(() => expect(mockListVoiceLines).toHaveBeenCalled());

      pv('test', 'fallback');

      expect(Audio).not.toHaveBeenCalled();
      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it('应该在 localStorage 不可用时返回 false', async () => {
      // Mock localStorage 抛出异常
      const originalGetItem = localStorage.getItem;
      localStorage.getItem = vi.fn().mockImplementation(() => {
        throw new Error('localStorage unavailable');
      });

      mockListVoiceLines.mockResolvedValue([]);

      const { speak: sp } = await import('../../utils/voice');
      sp('测试');

      // 应该正常执行（不静音）
      expect(mockSpeak).toHaveBeenCalled();

      localStorage.getItem = originalGetItem;
    });
  });
});
