/**
 * 打地鼠逻辑层单测（2D/3D 共用的 useMoleGame）
 * 覆盖：命中判定/兔子惩罚/目标数达标胜利/生命耗尽失败/暂停清场
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

import { useMoleGame, emptyHoles } from '../../pages/mole/useMoleGame';

let game: ReturnType<typeof useMoleGame>;

const mountGame = async () => {
  const Host = defineComponent({
    setup() {
      game = useMoleGame();
      return () => h('div');
    },
  });
  mount(Host);
  await flushPromises();
};

describe('useMoleGame', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('开局 9 个洞全空，生命 3，限时 60s', async () => {
    await mountGame();
    expect(game.holes.value).toHaveLength(9);
    expect(game.holes.value.every((hole) => hole.state === 'empty')).toBe(true);
    expect(game.hearts.value).toBe(3);
    expect(game.timeLeft.value).toBe(60);
  });

  it('空洞点击不生效', async () => {
    await mountGame();
    game.whack(3);
    expect(game.hits.value).toBe(0);
    expect(game.holes.value[3].state).toBe('empty');
  });

  it('打中地鼠计 1 分并进入 whacked，250ms 后清场', async () => {
    await mountGame();
    game.holes.value[4] = { state: 'up', kind: 'mole' };
    game.whack(4);
    expect(game.hits.value).toBe(1);
    expect(game.holes.value[4].state).toBe('whacked');

    vi.advanceTimersByTime(250);
    expect(game.holes.value[4].state).toBe('empty');
  });

  it('达标即胜利（targetHits=1 时一击通关，3 星）', async () => {
    await mountGame();
    game.levelConfig.value.targetHits = 1;
    game.holes.value[0] = { state: 'up', kind: 'mole' };
    game.whack(0);
    expect(game.gameWon.value).toBe(true);
    expect(game.showResult.value).toBe(true);
    expect(game.stars.value).toBe(3);
  });

  it('打中兔子扣一颗心且兔子立即消失；心扣光判负', async () => {
    await mountGame();
    game.holes.value[2] = { state: 'up', kind: 'bunny' };
    game.whack(2);
    expect(game.hearts.value).toBe(2);
    expect(game.holes.value[2].state).toBe('empty');
    expect(game.gameWon.value).toBe(false);

    game.holes.value[2] = { state: 'up', kind: 'bunny' };
    game.whack(2);
    game.holes.value[2] = { state: 'up', kind: 'bunny' };
    game.whack(2);
    expect(game.hearts.value).toBe(0);
    expect(game.gameWon.value).toBe(false);
    expect(game.showResult.value).toBe(true);
    expect(game.failReason.value).toContain('兔子');
  });

  it('暂停清空场面；恢复后不再残留 whacked 态', async () => {
    await mountGame();
    game.holes.value[1] = { state: 'up', kind: 'mole' };
    game.pauseGame();
    expect(game.holes.value.every((hole) => hole.state === 'empty')).toBe(true);
    expect(game.paused.value).toBe(true);
    game.resumeGame();
    expect(game.paused.value).toBe(false);
  });

  it('emptyHoles 工厂每次返回全新数组（互不共享引用）', () => {
    const a = emptyHoles();
    const b = emptyHoles();
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
  });
});
