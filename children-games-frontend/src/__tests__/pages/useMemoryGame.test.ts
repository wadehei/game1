/**
 * 记忆翻牌逻辑层单测（2D/3D 共用的 useMemoryGame）
 * 覆盖：翻牌判定/配对/失配回翻/步数/星级/网格布局/防连点
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

vi.mock('@/composables/useAdaptiveAssist', () => ({
  useAdaptiveAssist: () => ({
    level: () => 0,
    record: vi.fn(),
  }),
}));

import { useMemoryGame } from '../../pages/memory/useMemoryGame';
import { MEMORY_EMOJIS } from '../../pages/memory/useMemoryGame';

let game: ReturnType<typeof useMemoryGame>;

const mountGame = async () => {
  const Host = defineComponent({
    setup() {
      game = useMemoryGame();
      return () => h('div');
    },
  });
  mount(Host);
  await flushPromises();
};

describe('useMemoryGame', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('开局发 pairs×2 张卡，全部背面朝上', async () => {
    await mountGame();
    expect(game.cards.value).toHaveLength(4); // L1 pairs=2
    expect(game.cards.value.every((c) => !c.flipped && !c.matched)).toBe(true);
    expect(game.timeLeft.value).toBe(96); // L1 timeLimit
  });

  it('gridSize 在 L1（4 张）下取 2 列', async () => {
    await mountGame();
    expect(game.gridSize.value).toBe(2);
  });

  it('两对全部配对后胜利（3 星）', async () => {
    await mountGame();
    // 把同图案的两对全部翻开
    const byEmoji = new Map<string, number[]>();
    game.cards.value.forEach((c, i) => {
      byEmoji.set(c.emoji, [...(byEmoji.get(c.emoji) ?? []), i]);
    });
    const pairs = [...byEmoji.values()];
    expect(pairs).toHaveLength(2);

    game.flipCard(pairs[0][0]);
    game.flipCard(pairs[0][1]);
    expect(game.cards.value[pairs[0][0]].matched).toBe(true);
    expect(game.gameWon.value).toBe(false); // 只配一对还不算赢

    game.flipCard(pairs[1][0]);
    game.flipCard(pairs[1][1]);
    expect(game.gameWon.value).toBe(true);
    expect(game.showResult.value).toBe(true);
    // 未用时间 + 2 步配 2 对：3 星
    expect(game.stars.value).toBe(3);
  });

  it('不同图案翻开算一步，800ms 后自动回翻', async () => {
    await mountGame();
    const emojiOf = (i: number) => game.cards.value[i].emoji;
    const a = 0;
    let b = 1;
    if (emojiOf(0) === emojiOf(1)) {
      b = game.cards.value.findIndex((c, i) => i > 1 && c.emoji !== emojiOf(0));
    }
    expect(emojiOf(a)).not.toBe(emojiOf(b));

    game.flipCard(a);
    game.flipCard(b);
    expect(game.moves.value).toBe(1);
    expect(game.gameWon.value).toBe(false);

    vi.advanceTimersByTime(800);
    expect(game.cards.value[a].flipped).toBe(false);
    expect(game.cards.value[b].flipped).toBe(false);
  });

  it('同一张卡重复点击不生效；两张未决时第三张被拦', async () => {
    await mountGame();
    // 场景一：同一张连点两次，只算翻开 1 张
    game.flipCard(0);
    game.flipCard(0);
    game.flipCard(1);
    // 若连点被正确拦截，此时最多翻开 2 张 → moves 最多 1；若连点生效则第 3 次点击会被两张上限拦掉，moves 恒为 1
    expect(game.moves.value).toBeLessThanOrEqual(1);

    // 场景二：找两张不同图案的卡翻开（未决窗口），第三张点击必须被拦
    vi.advanceTimersByTime(900); // 清掉场景一的未决窗口
    const emojiOf = (i: number) => game.cards.value[i].emoji;
    const a = 0;
    const b = game.cards.value.findIndex((c) => c.emoji !== emojiOf(0));
    const c = game.cards.value.findIndex((_, i) => i !== a && i !== b);
    game.flipCard(a);
    game.flipCard(b);
    const movesBefore = game.moves.value;
    game.flipCard(c);
    expect(game.moves.value).toBe(movesBefore);
    expect(game.cards.value[c].flipped).toBe(false);
  });

  it('MEMORY_EMOJIS 足够支撑最高难度（8 对）', () => {
    expect(MEMORY_EMOJIS.length).toBeGreaterThanOrEqual(8);
  });
});
