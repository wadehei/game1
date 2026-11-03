import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import UserPage from '@/pages/user/index.vue';

// Mock dependencies
const mockPush = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/api/game', () => ({
  getAchievements: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/api/user', () => ({
  getMyCareer: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/utils/apiOrigin', () => ({
  API_ORIGIN: 'http://localhost:3000',
}));

vi.mock('@/utils/confirmBus', () => ({
  confirmAction: vi.fn().mockResolvedValue(true),
}));

// Mock child components to simplify testing
vi.mock('./components/CareerSection.vue', () => ({
  default: {
    name: 'CareerSection',
    template: '<div class="career-section">CareerSection</div>',
    props: ['career'],
  },
}));

vi.mock('./components/ProfilePinSection.vue', () => ({
  default: {
    name: 'ProfilePinSection',
    template: '<div class="profile-pin-section">ProfilePinSection</div>',
    props: ['avatar'],
  },
}));

vi.mock('./components/SettingsSection.vue', () => ({
  default: {
    name: 'SettingsSection',
    template: '<div class="settings-section">SettingsSection</div>',
    emits: ['feedback', 'parentCenter', 'logout'],
  },
}));

vi.mock('./components/ParentCenter.vue', () => ({
  default: {
    name: 'ParentCenter',
    template: '<div class="parent-center">ParentCenter</div>',
  },
}));

describe('UserProfilePage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();
    // Suppress fetch errors
    global.fetch = vi.fn().mockRejectedValue(new Error('mocked'));
  });

  it('renders user page', () => {
    const wrapper = mount(UserPage);
    expect(wrapper.find('.user-page').exists()).toBe(true);
  });

  it('displays default nickname when no user info', () => {
    const wrapper = mount(UserPage);
    expect(wrapper.find('.nickname').text()).toBe('未登录');
  });

  it('displays default level when no user info', () => {
    const wrapper = mount(UserPage);
    expect(wrapper.find('.level-text').text()).toBe('Lv.1');
  });

  it('displays default star count when no user info', () => {
    const wrapper = mount(UserPage);
    const statNums = wrapper.findAll('.stat-num');
    expect(statNums[0].text()).toBe('0');
  });

  it('renders stats section with labels', () => {
    const wrapper = mount(UserPage);
    const statLabels = wrapper.findAll('.stat-label');
    expect(statLabels.map((l) => l.text())).toEqual(['⭐ 总星星', '🎮 游戏次数', '🏆 成就']);
  });

  it('renders achievement section', () => {
    const wrapper = mount(UserPage);
    expect(wrapper.find('.achievement-section').exists()).toBe(true);
    // Achievement section title; CareerSection also has .section-title, so use findAll
    const titles = wrapper.findAll('.section-title');
    const achievementTitle = titles.find((t) => t.text().includes('成就徽章'));
    expect(achievementTitle).toBeDefined();
    expect(achievementTitle!.text()).toBe('🏆 成就徽章');
  });

  it('renders user card', () => {
    const wrapper = mount(UserPage);
    expect(wrapper.find('.user-card').exists()).toBe(true);
  });

  it('renders stats card', () => {
    const wrapper = mount(UserPage);
    expect(wrapper.find('.stats-card').exists()).toBe(true);
  });

  it('renders 3 stat items', () => {
    const wrapper = mount(UserPage);
    const statItems = wrapper.findAll('.stat-item');
    expect(statItems.length).toBe(3);
  });

  it('renders PlayerAvatar component', () => {
    const wrapper = mount(UserPage);
    expect(wrapper.findComponent({ name: 'PlayerAvatar' }).exists()).toBe(true);
  });

  it('displays games played count as 0 by default', () => {
    const wrapper = mount(UserPage);
    const statNums = wrapper.findAll('.stat-num');
    expect(statNums[1].text()).toBe('0');
  });

  it('displays achievement count as 0 by default', () => {
    const wrapper = mount(UserPage);
    const statNums = wrapper.findAll('.stat-num');
    expect(statNums[2].text()).toBe('0');
  });

  it('shows experience bar', () => {
    const wrapper = mount(UserPage);
    expect(wrapper.find('.exp-bar').exists()).toBe(true);
    expect(wrapper.find('.exp-fill').exists()).toBe(true);
  });

  it('shows experience text', () => {
    const wrapper = mount(UserPage);
    const expText = wrapper.find('.exp-text');
    expect(expText.exists()).toBe(true);
    expect(expText.text()).toContain('经验');
  });

  it('renders child component sections', () => {
    const wrapper = mount(UserPage);
    // CareerSection renders .career-section
    expect(wrapper.find('.career-section').exists()).toBe(true);
    // ProfilePinSection renders .profile-edit (its actual class)
    expect(wrapper.find('.profile-edit').exists()).toBe(true);
    // Verify child components are registered by checking all text content includes key markers
    expect(wrapper.text()).toContain('我的生涯');
    expect(wrapper.text()).toContain('角色口令');
  });
});
