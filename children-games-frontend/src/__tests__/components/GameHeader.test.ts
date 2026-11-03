import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import GameHeader from '@/components/GameHeader.vue';

describe('GameHeader', () => {
  const defaultItems = [
    { label: '关卡', value: '3', valueClass: 'lv' },
    { label: '得分', value: 120 },
    { label: '步数', value: '8/20' },
  ];

  const mountHeader = (overrides?: Record<string, unknown>) =>
    mount(GameHeader, {
      props: {
        items: defaultItems,
        muted: false,
        ...overrides,
      },
    });

  it('renders all header items', () => {
    const wrapper = mountHeader();
    const labels = wrapper.findAll('.label');
    expect(labels.map((l) => l.text())).toEqual(['关卡', '得分', '步数']);
  });

  it('renders item values correctly', () => {
    const wrapper = mountHeader();
    const values = wrapper.findAll('.value');
    expect(values[0].text()).toBe('3');
    expect(values[1].text()).toBe('120');
    expect(values[2].text()).toBe('8/20');
  });

  it('applies valueClass to value element', () => {
    const wrapper = mountHeader();
    const firstValue = wrapper.find('.value.lv');
    expect(firstValue.exists()).toBe(true);
    expect(firstValue.text()).toBe('3');
  });

  it('renders sound button with correct icon when not muted', () => {
    const wrapper = mountHeader();
    expect(wrapper.find('.sound-btn').text()).toBe('🔊');
  });

  it('renders sound button with muted icon when muted', () => {
    const wrapper = mountHeader({ muted: true });
    expect(wrapper.find('.sound-btn').text()).toBe('🔇');
  });

  it('renders back button', () => {
    const wrapper = mountHeader();
    const backBtn = wrapper.find('.back-btn');
    expect(backBtn.exists()).toBe(true);
    expect(backBtn.text()).toBe('←');
  });

  it('emits toggleSound when sound button clicked', async () => {
    const wrapper = mountHeader();
    await wrapper.find('.sound-btn').trigger('click');
    expect(wrapper.emitted('toggleSound')).toBeTruthy();
    expect(wrapper.emitted('toggleSound')!.length).toBe(1);
  });

  it('emits goBack when back button clicked', async () => {
    const wrapper = mountHeader();
    await wrapper.find('.back-btn').trigger('click');
    expect(wrapper.emitted('goBack')).toBeTruthy();
    expect(wrapper.emitted('goBack')!.length).toBe(1);
  });

  it('renders value as clickable when levelSelectable is true', () => {
    const wrapper = mountHeader({ levelSelectable: true });
    const clickable = wrapper.find('.value-clickable');
    expect(clickable.exists()).toBe(true);
    expect(clickable.text()).toBe('3');
  });

  it('does not render value as clickable when levelSelectable is false', () => {
    const wrapper = mountHeader({ levelSelectable: false });
    expect(wrapper.find('.value-clickable').exists()).toBe(false);
  });

  it('emits selectLevel when clickable level value is clicked', async () => {
    const wrapper = mountHeader({ levelSelectable: true });
    await wrapper.find('.value-clickable').trigger('click');
    expect(wrapper.emitted('selectLevel')).toBeTruthy();
    expect(wrapper.emitted('selectLevel')!.length).toBe(1);
  });

  it('applies custom headerClass', () => {
    const wrapper = mountHeader({ headerClass: 'custom-theme' });
    expect(wrapper.find('.game-header').classes()).toContain('custom-theme');
  });

  it('renders with empty items array', () => {
    const wrapper = mount(GameHeader, {
      props: { items: [], muted: false },
    });
    expect(wrapper.find('.game-header').exists()).toBe(true);
    expect(wrapper.findAll('.header-item').length).toBe(0);
  });

  it('renders numeric value 0 correctly', () => {
    const wrapper = mount(GameHeader, {
      props: {
        items: [{ label: '分数', value: 0 }],
        muted: false,
      },
    });
    expect(wrapper.find('.value').text()).toBe('0');
  });
});
