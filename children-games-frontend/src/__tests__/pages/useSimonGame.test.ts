/**
 * 音乐记忆逻辑层单测（2D/3D 共用的 useSimonGame）
 * 覆盖：序列生成（无相邻重复）/播放→输入阶段流转/正确点按推进/点错扣心重播/通关判定
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('@/composables/useGameSounds', () => ({
  useGameSounds: () => ({
    init: vi.fn(),
    play: vi.fn(),
    toggleSound: vi.fn(),
    isMuted: { value: false },
  }),
}));

vi.mock('@/composables/useGameProgress', () => ({
  useGameProgress: () => ({
    loadStartLevel: vi.fn().mockResolvedValue(1),
    saveProgress: vi.fn(),
    recordPlay: vi.fn(),
  }),
}));

vi.mock('@/composables/useGameLifecycle', () => ({
  useGameLifecycle: vi.fn(),
}));

vi.mock('@/api/game', () => ({
  getLevelOverride: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/utils/voice', () => ({
  speak: vi.fn(),
  playVoice: vi.fn(),
}));

vi.mock('@/utils/sound', () => ({
  soundManager: { playTone: vi.fn() },
}));

import { useSimonGame, PADS } from '../../pages/simon/useSimonGame';

let game: ReturnType<typeof useSimonGame>;

const mountGame = async () => {
  const Host = defineComponent({
    setup() {
      game = useSimonGame();
      return () => h('div');
    },
  });
  mount(Host);
  await flushPromises();
};

// 把播放阶段的亮灯顺序抓出来 = 本局序列（从挂机状态直接开始，含 2400ms 首播等待）
const captureSequence = async (length: number): Promise<number[]> => {
  const seq: number[] = [];
  let last: number | null = null;
  for (let i = 0; i < (length + 2) * 10 && game.phase.value !== 'input'; i++) {
    await vi.advanceTimersByTimeAsync(150);
    const lit = game.litPad.value;
    if (lit !== null && lit !== last) {
      seq.push(lit);
    }
    last = lit;
  }
  return seq;
};

describe('useSimonGame', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('开局进入 ready，L1 序列长 3', async () => {
    await mountGame();
    expect(game.phase.value).toBe('ready');
    expect(game.levelConfig.value.seqLength).toBe(3);
    expect(game.hearts.value).toBe(3);
  });

  it('播放完进入 input，亮灯序列无相邻重复', async () => {
    await mountGame();
    const seq = await captureSequence(3);
    expect(game.phase.value).toBe('input');
    expect(seq).toHaveLength(3);
    seq.forEach((pad, i) => {
      expect(pad).toBeGreaterThanOrEqual(0);
      expect(pad).toBeLessThan(PADS.length);
      if (i > 0) {
        expect(pad).not.toBe(seq[i - 1]);
      }
    });
    expect(game.phase.value).toBe('input');
  });

  it('input 阶段之外点按无效', async () => {
    await mountGame();
    // 还在 ready（未播放完），点按不应推进
    game.tapPad(0);
    expect(game.inputIndex.value).toBe(0);
  });

  it('按正确序列全部点对 → 通关 3 星', async () => {
    await mountGame();
    const seq = await captureSequence(3);
    for (const pad of seq) {
      game.tapPad(pad);
    }
    expect(game.gameWon.value).toBe(true);
    expect(game.showResult.value).toBe(true);
    expect(game.stars.value).toBe(3);
  });

  it('点错扣一颗心并温和重播同序列', async () => {
    await mountGame();
    const seq = await captureSequence(3);
    const wrong = (seq[0] + 1) % PADS.length;
    game.tapPad(wrong);
    expect(game.hearts.value).toBe(2);
    expect(game.wrongPad.value).toBe(wrong);
    expect(game.phase.value).toBe('replay');

    // 950ms 后重播，再走完播放进入 input
    await vi.advanceTimersByTimeAsync(950);
    expect(game.phase.value).toBe('playing');
    const seq2 = await captureSequence(3);
    expect(seq2).toEqual(seq); // 重播同一序列
  });

  it('暂停后 phase 回 ready，恢复从头重播', async () => {
    await mountGame();
    await vi.advanceTimersByTimeAsync(2400);
    game.pauseGame();
    expect(game.paused.value).toBe(true);
    expect(game.phase.value).toBe('ready');
    game.resumeGame();
    expect(game.phase.value).toBe('playing');
  });
});
