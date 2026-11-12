import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PauseMenu from '@/components/PauseMenu.vue';

describe('PauseMenu', () => {
  it('renders pause button when show is false and hideButton is false', () => {
    const wrapper = mount(PauseMenu, {
      props: { show: false },
    });
    expect(wrapper.find('.pause-btn').exists()).toBe(true);
  });

  it('hides pause button when hideButton is true', () => {
    const wrapper = mount(PauseMenu, {
      props: { show: false, hideButton: true },
    });
    expect(wrapper.find('.pause-btn').exists()).toBe(false);
  });

  it('renders overlay when show is true', () => {
    const wrapper = mount(PauseMenu, {
      props: { show: true },
    });
    expect(wrapper.find('.pause-overlay').exists()).toBe(true);
  });

  it('does not render overlay when show is false', () => {
    const wrapper = mount(PauseMenu, {
      props: { show: false },
    });
    expect(wrapper.find('.pause-overlay').exists()).toBe(false);
  });

  it('renders pause icon and title in overlay', () => {
    const wrapper = mount(PauseMenu, {
      props: { show: true },
    });
    expect(wrapper.find('.pause-icon').text()).toBe('⏸️');
    expect(wrapper.find('.pause-title').text()).toBe('游戏暂停');
  });

  it('renders resume and quit buttons', () => {
    const wrapper = mount(PauseMenu, {
      props: { show: true },
    });
    expect(wrapper.find('.btn-resume').exists()).toBe(true);
    expect(wrapper.find('.btn-resume').text()).toBe('继续游戏');
    expect(wrapper.find('.btn-quit').exists()).toBe(true);
    expect(wrapper.find('.btn-quit').text()).toBe('退出游戏');
  });

  it('emits pause when pause button clicked', async () => {
    const wrapper = mount(PauseMenu, {
      props: { show: false },
    });
    await wrapper.find('.pause-btn').trigger('click');
    expect(wrapper.emitted('pause')).toBeTruthy();
    expect(wrapper.emitted('pause')!.length).toBe(1);
  });

  it('emits resume when resume button clicked', async () => {
    const wrapper = mount(PauseMenu, {
      props: { show: true },
    });
    await wrapper.find('.btn-resume').trigger('click');
    expect(wrapper.emitted('resume')).toBeTruthy();
    expect(wrapper.emitted('resume')!.length).toBe(1);
  });

  it('emits quit when quit button clicked', async () => {
    const wrapper = mount(PauseMenu, {
      props: { show: true },
    });
    await wrapper.find('.btn-quit').trigger('click');
    expect(wrapper.emitted('quit')).toBeTruthy();
    expect(wrapper.emitted('quit')!.length).toBe(1);
  });

  it('applies btnTop style when provided', () => {
    const wrapper = mount(PauseMenu, {
      props: { show: false, btnTop: 60 },
    });
    const btn = wrapper.find('.pause-btn');
    expect(btn.attributes('style')).toContain('top: 60px');
  });

  it('does not apply top style when btnTop is not provided', () => {
    const wrapper = mount(PauseMenu, {
      props: { show: false },
    });
    const btn = wrapper.find('.pause-btn');
    expect(btn.attributes('style')).toBeUndefined();
  });

  it('renders both overlay and pause button when show is true and hideButton is false', () => {
    const wrapper = mount(PauseMenu, {
      props: { show: true, hideButton: false },
    });
    expect(wrapper.find('.pause-btn').exists()).toBe(true);
    expect(wrapper.find('.pause-overlay').exists()).toBe(true);
  });

  it('shows pause icon in floating button', () => {
    const wrapper = mount(PauseMenu, {
      props: { show: false },
    });
    expect(wrapper.find('.pause-btn span').text()).toBe('⏸️');
  });
});
