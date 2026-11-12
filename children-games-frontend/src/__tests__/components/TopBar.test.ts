import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import TopBar from '../../pages/battle/components/TopBar.vue';

describe('TopBar', () => {
  it('renders room id correctly', () => {
    const wrapper = mount(TopBar, {
      props: {
        roomId: '1234',
        isHost: false,
        copied: false,
      },
    });
    expect(wrapper.text()).toContain('1234');
  });

  it('shows "复制链接" when not copied', () => {
    const wrapper = mount(TopBar, {
      props: {
        roomId: '1234',
        isHost: false,
        copied: false,
      },
    });
    expect(wrapper.text()).toContain('复制链接');
  });

  it('shows "链接已复制" when copied', () => {
    const wrapper = mount(TopBar, {
      props: {
        roomId: '1234',
        isHost: false,
        copied: true,
      },
    });
    expect(wrapper.text()).toContain('链接已复制');
  });

  it('shows disband button when isHost is true', () => {
    const wrapper = mount(TopBar, {
      props: {
        roomId: '1234',
        isHost: true,
        copied: false,
      },
    });
    expect(wrapper.find('.rt-disband').exists()).toBe(true);
  });

  it('hides disband button when isHost is false', () => {
    const wrapper = mount(TopBar, {
      props: {
        roomId: '1234',
        isHost: false,
        copied: false,
      },
    });
    expect(wrapper.find('.rt-disband').exists()).toBe(false);
  });

  it('emits exit event when exit button clicked', async () => {
    const wrapper = mount(TopBar, {
      props: {
        roomId: '1234',
        isHost: false,
        copied: false,
      },
    });
    await wrapper.find('.rt-exit').trigger('click');
    expect(wrapper.emitted('exit')).toBeTruthy();
  });

  it('emits disband event when disband button clicked', async () => {
    const wrapper = mount(TopBar, {
      props: {
        roomId: '1234',
        isHost: true,
        copied: false,
      },
    });
    await wrapper.find('.rt-disband').trigger('click');
    expect(wrapper.emitted('disband')).toBeTruthy();
  });

  it('emits copyCode event when code area clicked', async () => {
    const wrapper = mount(TopBar, {
      props: {
        roomId: '1234',
        isHost: false,
        copied: false,
      },
    });
    await wrapper.find('.rt-code').trigger('click');
    expect(wrapper.emitted('copyCode')).toBeTruthy();
  });
});
