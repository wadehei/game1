import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import HomePage from '@/pages/index/index.vue';

// Mock dependencies
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock('@/api/user', () => ({
  getUserInfo: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/api/game', () => ({
  getAllProgress: vi.fn().mockResolvedValue([]),
  getDailyTask: vi.fn().mockResolvedValue({
    completedGames: 0,
    playedGames: [],
    taskGoal: 3,
    rewardStars: 10,
    claimed: false,
  }),
}));

vi.mock('@/utils/sound', () => ({
  soundManager: {
    init: vi.fn(),
    playClick: vi.fn(),
    playSuccess: vi.fn(),
    getVolume: vi.fn().mockReturnValue(0.6),
    setVolume: vi.fn(),
  },
}));

vi.mock('@/utils/theme', () => ({
  getThemeChoice: vi.fn().mockReturnValue('auto'),
  setTheme: vi.fn(),
}));

// Mock SVG imports
vi.mock('@/static/images/games/lobby/icon-memory.svg', () => ({ default: 'icon-memory.svg' }));
vi.mock('@/static/images/games/lobby/icon-fruit.svg', () => ({ default: 'icon-fruit.svg' }));
vi.mock('@/static/images/games/lobby/icon-puzzle.svg', () => ({ default: 'icon-puzzle.svg' }));
vi.mock('@/static/images/games/lobby/icon-balloon.svg', () => ({ default: 'icon-balloon.svg' }));
vi.mock('@/static/images/games/lobby/icon-tank.svg', () => ({ default: 'icon-tank.svg' }));
vi.mock('@/static/images/games/lobby/icon-mole.svg', () => ({ default: 'icon-mole.svg' }));
vi.mock('@/static/images/games/lobby/icon-simon.svg', () => ({ default: 'icon-simon.svg' }));
vi.mock('@/static/images/games/lobby/icon-math.svg', () => ({ default: 'icon-math.svg' }));
vi.mock('@/static/images/games/lobby/icon-match.svg', () => ({ default: 'icon-match.svg' }));
vi.mock('@/static/images/games/lobby/icon-match3.svg', () => ({ default: 'icon-match3.svg' }));
vi.mock('@/static/images/games/lobby/icon-brick.svg', () => ({ default: 'icon-brick.svg' }));
vi.mock('@/static/images/games/lobby/icon-sudoku.svg', () => ({ default: 'icon-sudoku.svg' }));
vi.mock('@/static/images/games/lobby/icon-claw.svg', () => ({ default: 'icon-claw.svg' }));

describe('HomePage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders home page with game list', () => {
    const wrapper = mount(HomePage);
    expect(wrapper.find('.home-page').exists()).toBe(true);
    expect(wrapper.find('.game-list').exists()).toBe(true);
  });

  it('renders all 13 game cards', () => {
    const wrapper = mount(HomePage);
    const cards = wrapper.findAll('.game-card');
    expect(cards.length).toBe(13);
  });

  it('displays default nickname when no user info', () => {
    const wrapper = mount(HomePage);
    expect(wrapper.find('.nickname').text()).toBe('选个角色');
  });

  it('displays default level when no user info', () => {
    const wrapper = mount(HomePage);
    expect(wrapper.find('.level-text').text()).toBe('Lv.1');
  });

  it('displays default star count when no user info', () => {
    const wrapper = mount(HomePage);
    expect(wrapper.find('.star-num').text()).toBe('0');
  });

  it('shows settings panel when settings button clicked', async () => {
    const wrapper = mount(HomePage);
    expect(wrapper.find('.settings-panel').exists()).toBe(false);
    await wrapper.find('.settings-btn').trigger('click');
    expect(wrapper.find('.settings-panel').exists()).toBe(true);
  });

  it('hides settings panel when settings button clicked again', async () => {
    const wrapper = mount(HomePage);
    await wrapper.find('.settings-btn').trigger('click');
    expect(wrapper.find('.settings-panel').exists()).toBe(true);
    await wrapper.find('.settings-btn').trigger('click');
    expect(wrapper.find('.settings-panel').exists()).toBe(false);
  });

  it('defaults to kids mode', () => {
    const wrapper = mount(HomePage);
    expect(wrapper.find('.mode-tab.kids.active').exists()).toBe(true);
    expect(wrapper.find('.game-list').exists()).toBe(true);
  });

  it('switches to battle mode when battle tab clicked', async () => {
    const wrapper = mount(HomePage);
    await wrapper.find('.mode-tab.battle').trigger('click');
    expect(wrapper.find('.mode-tab.battle.active').exists()).toBe(true);
    expect(wrapper.find('.battle-mode').exists()).toBe(true);
    expect(wrapper.find('.game-list').exists()).toBe(false);
  });

  it('persists mode choice to localStorage', async () => {
    const wrapper = mount(HomePage);
    await wrapper.find('.mode-tab.battle').trigger('click');
    expect(localStorage.getItem('home_mode')).toBe('battle');
  });

  it('shows daily task section in kids mode', () => {
    const wrapper = mount(HomePage);
    expect(wrapper.find('.daily-task').exists()).toBe(true);
    expect(wrapper.text()).toContain('每日任务');
  });

  it('shows feedback entry button', () => {
    const wrapper = mount(HomePage);
    expect(wrapper.find('.feedback-entry').exists()).toBe(true);
    expect(wrapper.text()).toContain('意见反馈');
  });

  it('renders mode tabs', () => {
    const wrapper = mount(HomePage);
    expect(wrapper.findAll('.mode-tab').length).toBe(2);
  });

  it('displays game names correctly', () => {
    const wrapper = mount(HomePage);
    const gameNames = wrapper.findAll('.game-name');
    expect(gameNames[0].text()).toBe('记忆翻牌');
    expect(gameNames[1].text()).toBe('接水果');
  });
});
