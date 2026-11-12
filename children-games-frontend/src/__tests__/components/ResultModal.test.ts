import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ResultModal from '@/components/ResultModal.vue';

vi.mock('@/utils/voice', () => ({
  playVoice: vi.fn(),
  stopSpeaking: vi.fn(),
}));

vi.mock('@/utils/animations', () => ({
  createStarRain: vi.fn(),
}));

describe('ResultModal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const mountModal = (overrides?: Record<string, unknown>) =>
    mount(ResultModal, {
      props: {
        show: true,
        won: false,
        stars: 0,
        icon: '😢',
        title: '挑战失败',
        ...overrides,
      },
    });

  it('renders modal when show is true', () => {
    const wrapper = mountModal();
    expect(wrapper.find('.result-modal').exists()).toBe(true);
  });

  it('does not render when show is false', () => {
    const wrapper = mountModal({ show: false });
    expect(wrapper.find('.result-modal').exists()).toBe(false);
  });

  it('renders icon prop', () => {
    const wrapper = mountModal({ icon: '🎉' });
    expect(wrapper.find('.result-icon').text()).toBe('🎉');
  });

  it('renders title prop', () => {
    const wrapper = mountModal({ title: '太棒了！' });
    expect(wrapper.find('.result-title').text()).toBe('太棒了！');
  });

  it('renders 3 stars', () => {
    const wrapper = mountModal({ won: true });
    const stars = wrapper.findAll('.star');
    expect(stars.length).toBe(3);
  });

  it('activates correct number of stars', () => {
    const wrapper = mountModal({ won: true, stars: 2 });
    const stars = wrapper.findAll('.star');
    expect(stars[0].classes()).toContain('active');
    expect(stars[1].classes()).toContain('active');
    expect(stars[2].classes()).not.toContain('active');
  });

  it('renders info text when provided', () => {
    const wrapper = mountModal({ info: '用时 30 秒' });
    expect(wrapper.find('.result-info').exists()).toBe(true);
    expect(wrapper.find('.result-info').text()).toBe('用时 30 秒');
  });

  it('does not render info when not provided', () => {
    const wrapper = mountModal();
    expect(wrapper.find('.result-info').exists()).toBe(false);
  });

  it('renders retry button', () => {
    const wrapper = mountModal();
    const retryBtn = wrapper.find('.btn-retry');
    expect(retryBtn.exists()).toBe(true);
    expect(retryBtn.text()).toBe('再玩一次');
  });

  it('renders next button when won', () => {
    const wrapper = mountModal({ won: true });
    const nextBtn = wrapper.find('.btn-next');
    expect(nextBtn.exists()).toBe(true);
    expect(nextBtn.text()).toBe('下一关');
  });

  it('does not render next button when lost', () => {
    const wrapper = mountModal({ won: false });
    expect(wrapper.find('.btn-next').exists()).toBe(false);
  });

  it('emits retry when retry button clicked', async () => {
    const wrapper = mountModal();
    await wrapper.find('.btn-retry').trigger('click');
    expect(wrapper.emitted('retry')).toBeTruthy();
    expect(wrapper.emitted('retry')!.length).toBe(1);
  });

  it('emits next when next button clicked', async () => {
    const wrapper = mountModal({ won: true });
    await wrapper.find('.btn-next').trigger('click');
    expect(wrapper.emitted('next')).toBeTruthy();
    expect(wrapper.emitted('next')!.length).toBe(1);
  });

  it('shows auto-next tip when won and autoNext is true', async () => {
    const wrapper = mountModal({ won: true, autoNext: true });
    expect(wrapper.find('.auto-next-tip').exists()).toBe(true);
    expect(wrapper.text()).toContain('3 秒后自动开始下一关');
  });

  it('does not show auto-next tip when lost', () => {
    const wrapper = mountModal({ won: false, autoNext: true });
    expect(wrapper.find('.auto-next-tip').exists()).toBe(false);
  });

  it('does not show auto-next tip when autoNext is false', () => {
    const wrapper = mountModal({ won: true, autoNext: false });
    expect(wrapper.find('.auto-next-tip').exists()).toBe(false);
  });

  it('auto-counts down and emits next after 3 seconds', async () => {
    const wrapper = mountModal({ won: true, autoNext: true });

    vi.advanceTimersByTime(1000);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('2 秒后自动开始下一关');

    vi.advanceTimersByTime(1000);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('1 秒后自动开始下一关');

    vi.advanceTimersByTime(1000);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('next')).toBeTruthy();
  });

  it('emits next after auto-countdown reaches zero', async () => {
    const wrapper = mountModal({ won: true, autoNext: true });
    vi.advanceTimersByTime(3000);
    expect(wrapper.emitted('next')).toBeTruthy();
  });

  it('shows "自动开始中" when countdown reaches zero', async () => {
    const wrapper = mountModal({ won: true, autoNext: true });
    vi.advanceTimersByTime(3100);
    await wrapper.vm.$nextTick();
    // After countdown hits 0, 'next' is emitted and auto-timer stops
    expect(wrapper.emitted('next')).toBeTruthy();
  });

  it('all 3 stars active when stars is 3', () => {
    const wrapper = mountModal({ won: true, stars: 3 });
    const stars = wrapper.findAll('.star');
    stars.forEach((star) => {
      expect(star.classes()).toContain('active');
    });
  });

  it('no stars active when stars is 0', () => {
    const wrapper = mountModal({ won: true, stars: 0 });
    const stars = wrapper.findAll('.star');
    stars.forEach((star) => {
      expect(star.classes()).not.toContain('active');
    });
  });
});
