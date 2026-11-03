import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PinPad from '@/components/PinPad.vue';

describe('PinPad', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders pin pad overlay', () => {
    const wrapper = mount(PinPad);
    expect(wrapper.find('.pin-pad-overlay').exists()).toBe(true);
  });

  it('renders default title', () => {
    const wrapper = mount(PinPad);
    expect(wrapper.find('.pin-title').text()).toBe('请输入口令');
  });

  it('renders custom title', () => {
    const wrapper = mount(PinPad, {
      props: { title: '设置新口令' },
    });
    expect(wrapper.find('.pin-title').text()).toBe('设置新口令');
  });

  it('renders 4 dots for PIN input', () => {
    const wrapper = mount(PinPad);
    const dots = wrapper.findAll('.dot');
    expect(dots.length).toBe(4);
  });

  it('renders number keys 0-9', () => {
    const wrapper = mount(PinPad);
    const keys = wrapper.findAll('.key:not(.blank):not(.del)');
    expect(keys.length).toBe(10);
  });

  it('renders delete button', () => {
    const wrapper = mount(PinPad);
    expect(wrapper.find('.key.del').exists()).toBe(true);
  });

  it('renders cancel button', () => {
    const wrapper = mount(PinPad);
    expect(wrapper.find('.pin-cancel').exists()).toBe(true);
    expect(wrapper.find('.pin-cancel').text()).toBe('取消');
  });

  it('fills dot when number key pressed', async () => {
    const wrapper = mount(PinPad);
    const keys = wrapper.findAll('.key:not(.blank):not(.del)');
    await keys[0].trigger('click'); // Press '1'
    const dots = wrapper.findAll('.dot');
    expect(dots[0].classes()).toContain('filled');
  });

  it('emits complete after entering 4 digits', async () => {
    const wrapper = mount(PinPad);
    const keys = wrapper.findAll('.key:not(.blank):not(.del)');

    // Enter 4 digits: 1, 2, 3, 4
    await keys[0].trigger('click'); // 1
    await keys[1].trigger('click'); // 2
    await keys[2].trigger('click'); // 3
    await keys[3].trigger('click'); // 4

    // Auto-submit after 150ms delay
    vi.advanceTimersByTime(150);

    expect(wrapper.emitted('complete')).toBeTruthy();
    expect(wrapper.emitted('complete')![0]).toEqual(['1234']);
  });

  it('does not emit complete before 4 digits entered', async () => {
    const wrapper = mount(PinPad);
    const keys = wrapper.findAll('.key:not(.blank):not(.del)');

    await keys[0].trigger('click'); // 1
    await keys[1].trigger('click'); // 2
    await keys[2].trigger('click'); // 3

    vi.advanceTimersByTime(150);

    expect(wrapper.emitted('complete')).toBeFalsy();
  });

  it('deletes last digit when delete button pressed', async () => {
    const wrapper = mount(PinPad);
    const keys = wrapper.findAll('.key:not(.blank):not(.del)');
    const delBtn = wrapper.find('.key.del');

    // Enter 2 digits
    await keys[0].trigger('click'); // 1
    await keys[1].trigger('click'); // 2

    let dots = wrapper.findAll('.dot');
    expect(dots[1].classes()).toContain('filled');

    // Delete one digit
    await delBtn.trigger('click');

    dots = wrapper.findAll('.dot');
    expect(dots[1].classes()).not.toContain('filled');
    expect(dots[0].classes()).toContain('filled');
  });

  it('emits cancel when cancel button clicked', async () => {
    const wrapper = mount(PinPad);
    await wrapper.find('.pin-cancel').trigger('click');
    expect(wrapper.emitted('cancel')).toBeTruthy();
  });

  it('emits cancel when overlay background clicked', async () => {
    const wrapper = mount(PinPad);
    await wrapper.find('.pin-pad-overlay').trigger('click');
    expect(wrapper.emitted('cancel')).toBeTruthy();
  });

  it('does not emit cancel when pin pad itself clicked', async () => {
    const wrapper = mount(PinPad);
    await wrapper.find('.pin-pad').trigger('click');
    expect(wrapper.emitted('cancel')).toBeFalsy();
  });

  it('shows error message when error prop provided', () => {
    const wrapper = mount(PinPad, {
      props: { error: '口令错误' },
    });
    expect(wrapper.find('.pin-error').text()).toBe('口令错误');
  });

  it('clears PIN when error prop changes', async () => {
    const wrapper = mount(PinPad, {
      props: { error: '' },
    });
    const keys = wrapper.findAll('.key:not(.blank):not(.del)');

    // Enter 2 digits
    await keys[0].trigger('click'); // 1
    await keys[1].trigger('click'); // 2

    let dots = wrapper.findAll('.dot');
    expect(dots[1].classes()).toContain('filled');

    // Set error
    await wrapper.setProps({ error: '错误' });

    dots = wrapper.findAll('.dot');
    expect(dots[0].classes()).not.toContain('filled');
  });

  it('ignores input after 4 digits', async () => {
    const wrapper = mount(PinPad);
    const keys = wrapper.findAll('.key:not(.blank):not(.del)');

    // Enter 4 digits
    await keys[0].trigger('click'); // 1
    await keys[1].trigger('click'); // 2
    await keys[2].trigger('click'); // 3
    await keys[3].trigger('click'); // 4

    // Try to enter 5th digit
    await keys[4].trigger('click'); // 5

    vi.advanceTimersByTime(150);

    // Should still emit '1234', not '12345'
    expect(wrapper.emitted('complete')![0]).toEqual(['1234']);
  });

  it('allows entering 0', async () => {
    const wrapper = mount(PinPad);
    const keys = wrapper.findAll('.key:not(.blank):not(.del)');
    const zeroKey = keys[9]; // 0 is the 10th key

    await zeroKey.trigger('click');
    const dots = wrapper.findAll('.dot');
    expect(dots[0].classes()).toContain('filled');
  });

  it('does not emit complete with wrong PIN format', async () => {
    const wrapper = mount(PinPad);
    const keys = wrapper.findAll('.key:not(.blank):not(.del)');

    // Enter only 3 digits
    await keys[0].trigger('click');
    await keys[1].trigger('click');
    await keys[2].trigger('click');

    vi.advanceTimersByTime(200);

    expect(wrapper.emitted('complete')).toBeFalsy();
  });
});
