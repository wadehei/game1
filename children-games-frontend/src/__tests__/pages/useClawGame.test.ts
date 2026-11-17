/**
 * 抓娃娃机逻辑层单测（2D/3D 共用的 useClawGame）
 * 覆盖：开局状态/下爪命中判定/未命中/达标胜利/巡航移动与边界反弹/暂停冻结
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

import { useClawGame, CLAW_MIN_X, CLAW_MAX_X } from '../../pages/claw/useClawGame';

let game: ReturnType<typeof useClawGame>;

// 手动驱动的 rAF 管线（时间戳跨 pump 调用连续，与真实 rAF 一致）
let rafCallbacks: ((ts: number) => void)[] = [];
let pumpTs = 0;
const installFakeRaf = () => {
  rafCallbacks = [];
  pumpTs = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
};
const pump = (ms: number) => {
  const step = 1000 / 60;
  while (ms > 0) {
    pumpTs += step;
    ms -= step;
    const cbs = rafCallbacks;
    rafCallbacks = [];
    for (const cb of cbs) cb(pumpTs);
  }
};

const mountGame = async () => {
  const Host = defineComponent({
    setup() {
      game = useClawGame(() => 300); // 巡航宽度 300 → 速度 120/300=0.4 归一化/秒
      return () => h('div');
    },
  });
  mount(Host);
  await flushPromises();
};

describe('useClawGame', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installFakeRaf();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('开局补足 6 个奖品，爪心居中，限时 75s', async () => {
    await mountGame();
    expect(game.prizes.value).toHaveLength(6);
    expect(game.clawX.value).toBe(0.5);
    expect(game.timeLeft.value).toBe(75);
    expect(game.prizes.value.every((p) => !p.grabbed)).toBe(true);
  });

  it('爪心对准奖品下爪必中：collected+1、奖品标记 grabbed', async () => {
    await mountGame();
    const prize = game.prizes.value[0];
    game.clawX.value = prize.x; // 爪心对准
    game.dropClaw();
    expect(game.isDropping.value).toBe(true);

    vi.advanceTimersByTime(450); // 下爪到位 → 判定
    expect(game.collected.value).toBe(1);
    expect(prize.grabbed).toBe(true);
    expect(game.isHolding.value).toBe(true);

    vi.advanceTimersByTime(180 + 450); // 抓持 → 收爪完成
    expect(game.isDropping.value).toBe(false);
    expect(game.isHolding.value).toBe(false);
  });

  it('爪心无奖品下爪落空：collected 不变', async () => {
    await mountGame();
    // 爪心挪到所有奖品都够不着的地方
    game.clawX.value = CLAW_MAX_X;
    for (const p of game.prizes.value) {
      if (Math.abs(p.x - CLAW_MAX_X) < 0.09) p.x = 0.5;
    }
    game.dropClaw();
    vi.advanceTimersByTime(450 + 180 + 450);
    expect(game.collected.value).toBe(0);
    expect(game.prizes.value.every((p) => !p.grabbed)).toBe(true);
  });

  it('抓满 targetGrabs 即胜利（临时调低目标为 1 → 3 星）', async () => {
    await mountGame();
    game.levelConfig.value.targetGrabs = 1;
    const prize = game.prizes.value[0];
    game.clawX.value = prize.x;
    game.dropClaw();
    vi.advanceTimersByTime(450 + 180 + 450);
    expect(game.gameWon.value).toBe(true);
    expect(game.showResult.value).toBe(true);
    // 满时间通关 → 3 星
    expect(game.stars.value).toBe(3);
  });

  it('巡航：爪子按 clawSpeed/宽度 速度移动并边界反弹', async () => {
    await mountGame();
    expect(game.clawX.value).toBeCloseTo(0.5, 5);
    pump(1000); // 1 秒 → 0.5 + 0.4 = 0.9
    expect(game.clawX.value).toBeCloseTo(0.9, 1);
    pump(1000); // 撞右边界 0.94 反弹，回落
    expect(game.clawX.value).toBeLessThan(CLAW_MAX_X);
    expect(game.clawDir.value).toBe(-1);
  });

  it('暂停时爪子冻结，下爪在暂停中被拦', async () => {
    await mountGame();
    game.pauseGame();
    const frozen = game.clawX.value;
    pump(500);
    expect(game.clawX.value).toBe(frozen);
    game.dropClaw();
    vi.advanceTimersByTime(1000);
    expect(game.isDropping.value).toBe(false);
    game.resumeGame();
    pump(500);
    expect(game.clawX.value).not.toBe(frozen);
  });
});
