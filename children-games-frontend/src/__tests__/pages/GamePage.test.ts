import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MemoryGame from '@/pages/memory/index.vue';

// Mock dependencies
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/composables/useGameSounds', () => ({
  useGameSounds: () => ({
    init: vi.fn(),
    isMuted: { value: false },
    toggleSound: vi.fn(),
    play: vi.fn().mockReturnValue(Promise.resolve()),
    playFlip: vi.fn().mockReturnValue(Promise.resolve()),
    playMatch: vi.fn().mockReturnValue(Promise.resolve()),
    playWin: vi.fn().mockReturnValue(Promise.resolve()),
    playFail: vi.fn().mockReturnValue(Promise.resolve()),
    playClick: vi.fn().mockReturnValue(Promise.resolve()),
  }),
}));

vi.mock('@/composables/useGameProgress', () => ({
  useGameProgress: () => ({
    currentLevel: 1,
    highScore: 0,
    stars: 0,
    saveProgress: vi.fn(),
    loadStartLevel: vi.fn().mockReturnValue(1),
    recordPlay: vi.fn(),
  }),
}));

vi.mock('@/composables/useAdaptiveAssist', () => ({
  useAdaptiveAssist: () => ({
    adjustDifficulty: vi.fn(),
    getAssistConfig: vi.fn().mockReturnValue({}),
    level: vi.fn().mockReturnValue(0),
    record: vi.fn().mockReturnValue(0),
  }),
}));

vi.mock('@/api/game', () => ({
  getLevelOverride: vi.fn().mockResolvedValue(null),
  getAllProgress: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/utils/voice', () => ({
  speak: vi.fn(),
  playVoice: vi.fn(),
}));

vi.mock('@/utils/gameEvents', () => ({
  GAME_PAUSE_EVENT: 'game-pause',
  GAME_RESUME_EVENT: 'game-resume',
}));

vi.mock('@/utils/levelDefaults', () => ({
  defaultLevelConfig: vi.fn().mockReturnValue({
    pairs: 4,
    timeLimit: 120,
    gridSize: 4,
  }),
}));

// Mock SVG imports
vi.mock('@/static/images/games/memory/dog.svg', () => ({ default: 'dog.svg' }));
vi.mock('@/static/images/games/memory/cat.svg', () => ({ default: 'cat.svg' }));
vi.mock('@/static/images/games/memory/panda.svg', () => ({ default: 'panda.svg' }));
vi.mock('@/static/images/games/memory/fox.svg', () => ({ default: 'fox.svg' }));
vi.mock('@/static/images/games/memory/frog.svg', () => ({ default: 'frog.svg' }));
vi.mock('@/static/images/games/memory/monkey.svg', () => ({ default: 'monkey.svg' }));
vi.mock('@/static/images/games/memory/pig.svg', () => ({ default: 'pig.svg' }));
vi.mock('@/static/images/games/memory/cow.svg', () => ({ default: 'cow.svg' }));
vi.mock('@/static/images/games/memory/chicken.svg', () => ({ default: 'chicken.svg' }));
vi.mock('@/static/images/games/memory/octopus.svg', () => ({ default: 'octopus.svg' }));
vi.mock('@/static/images/games/memory/lion.svg', () => ({ default: 'lion.svg' }));
vi.mock('@/static/images/games/memory/tiger.svg', () => ({ default: 'tiger.svg' }));
vi.mock('@/static/images/games/memory/bear.svg', () => ({ default: 'bear.svg' }));
vi.mock('@/static/images/games/memory/koala.svg', () => ({ default: 'koala.svg' }));
vi.mock('@/static/images/games/memory/rabbit.svg', () => ({ default: 'rabbit.svg' }));
vi.mock('@/static/images/games/memory/dragon.svg', () => ({ default: 'dragon.svg' }));

describe('MemoryGame', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('renders memory game page', () => {
    const wrapper = mount(MemoryGame);
    expect(wrapper.find('.memory-game').exists()).toBe(true);
  });

  it('renders game board', () => {
    const wrapper = mount(MemoryGame);
    expect(wrapper.find('.game-board').exists()).toBe(true);
  });

  it('renders game cards after initialization', async () => {
    const wrapper = mount(MemoryGame);
    // Wait for onMounted to finish initializing cards
    await vi.waitFor(() => {
      const cards = wrapper.findAll('.card');
      expect(cards.length).toBeGreaterThan(0);
    });
    const cards = wrapper.findAll('.card');
    expect(cards.length % 2).toBe(0); // Even number of cards (pairs)
  });

  it('all cards start face down (not flipped)', async () => {
    const wrapper = mount(MemoryGame);
    await vi.waitFor(() => {
      expect(wrapper.findAll('.card').length).toBeGreaterThan(0);
    });
    const cards = wrapper.findAll('.card');
    cards.forEach((card) => {
      expect(card.classes()).not.toContain('flipped');
      expect(card.classes()).not.toContain('matched');
    });
  });

  it('flips card when clicked', async () => {
    const wrapper = mount(MemoryGame);
    await vi.waitFor(() => {
      expect(wrapper.findAll('.card').length).toBeGreaterThan(0);
    });
    const cards = wrapper.findAll('.card');
    await cards[0].trigger('click');
    expect(cards[0].classes()).toContain('flipped');
  });

  it('renders GameHeader component', () => {
    const wrapper = mount(MemoryGame);
    expect(wrapper.findComponent({ name: 'GameHeader' }).exists()).toBe(true);
  });

  it('renders ResultModal component', () => {
    const wrapper = mount(MemoryGame);
    expect(wrapper.findComponent({ name: 'ResultModal' }).exists()).toBe(true);
  });

  it('renders PauseMenu component', () => {
    const wrapper = mount(MemoryGame);
    expect(wrapper.findComponent({ name: 'PauseMenu' }).exists()).toBe(true);
  });

  it('renders LevelSelectModal component', () => {
    const wrapper = mount(MemoryGame);
    expect(wrapper.findComponent({ name: 'LevelSelectModal' }).exists()).toBe(true);
  });

  it('applies grid layout from level config', () => {
    const wrapper = mount(MemoryGame);
    const board = wrapper.find('.game-board');
    expect(board.attributes('style')).toContain('grid-template-columns');
  });
});
