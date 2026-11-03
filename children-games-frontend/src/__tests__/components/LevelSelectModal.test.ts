import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LevelSelectModal from '@/components/LevelSelectModal.vue';

describe('LevelSelectModal', () => {
  const mountModal = (overrides?: Record<string, unknown>) =>
    mount(LevelSelectModal, {
      props: {
        show: true,
        maxLevel: 20,
        current: 1,
        ...overrides,
      },
    });

  it('renders modal when show is true', () => {
    const wrapper = mountModal();
    expect(wrapper.find('.level-modal').exists()).toBe(true);
  });

  it('does not render modal when show is false', () => {
    const wrapper = mountModal({ show: false });
    expect(wrapper.find('.level-modal').exists()).toBe(false);
  });

  it('renders title and hint', () => {
    const wrapper = mountModal();
    expect(wrapper.find('.level-title').text()).toBe('🎯 选择关卡');
    expect(wrapper.find('.level-hint').text()).toBe('已解锁 1 ~ 20 关');
  });

  it('displays current level number', () => {
    const wrapper = mountModal({ current: 5 });
    expect(wrapper.find('.level-num').text()).toBe('5');
  });

  it('renders increment and decrement buttons', () => {
    const wrapper = mountModal();
    const stepBtns = wrapper.findAll('.step-btn');
    expect(stepBtns.length).toBe(2);
    expect(stepBtns[0].text()).toBe('−');
    expect(stepBtns[1].text()).toBe('+');
  });

  it('disables decrement button at level 1', () => {
    const wrapper = mountModal({ current: 1 });
    const stepBtns = wrapper.findAll('.step-btn');
    expect(stepBtns[0].attributes('disabled')).toBeDefined();
  });

  it('enables decrement button above level 1', () => {
    const wrapper = mountModal({ current: 5 });
    const stepBtns = wrapper.findAll('.step-btn');
    expect(stepBtns[0].attributes('disabled')).toBeUndefined();
  });

  it('disables increment button at maxLevel', () => {
    const wrapper = mountModal({ current: 20, maxLevel: 20 });
    const stepBtns = wrapper.findAll('.step-btn');
    expect(stepBtns[1].attributes('disabled')).toBeDefined();
  });

  it('increments level when + button clicked', async () => {
    const wrapper = mountModal({ current: 3 });
    const stepBtns = wrapper.findAll('.step-btn');
    await stepBtns[1].trigger('click'); // +
    expect(wrapper.find('.level-num').text()).toBe('4');
  });

  it('decrements level when - button clicked', async () => {
    const wrapper = mountModal({ current: 5 });
    const stepBtns = wrapper.findAll('.step-btn');
    await stepBtns[0].trigger('click'); // -
    expect(wrapper.find('.level-num').text()).toBe('4');
  });

  it('does not go above maxLevel', async () => {
    const wrapper = mountModal({ current: 19, maxLevel: 20 });
    const stepBtns = wrapper.findAll('.step-btn');
    await stepBtns[1].trigger('click'); // + → 20
    await stepBtns[1].trigger('click'); // + → still 20
    expect(wrapper.find('.level-num').text()).toBe('20');
  });

  it('does not go below 1', async () => {
    const wrapper = mountModal({ current: 2 });
    const stepBtns = wrapper.findAll('.step-btn');
    await stepBtns[0].trigger('click'); // - → 1
    await stepBtns[0].trigger('click'); // - → still 1
    expect(wrapper.find('.level-num').text()).toBe('1');
  });

  it('emits select with current level when start button clicked', async () => {
    const wrapper = mountModal({ current: 3 });
    const stepBtns = wrapper.findAll('.step-btn');
    await stepBtns[1].trigger('click'); // + → 4
    await wrapper.find('.btn-start').trigger('click');
    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')![0]).toEqual([4]);
  });

  it('emits close when cancel button clicked', async () => {
    const wrapper = mountModal();
    await wrapper.find('.btn-cancel').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('emits close when overlay background clicked', async () => {
    const wrapper = mountModal();
    await wrapper.find('.level-modal').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('does not emit close when modal content clicked', async () => {
    const wrapper = mountModal();
    await wrapper.find('.level-content').trigger('click');
    expect(wrapper.emitted('close')).toBeFalsy();
  });

  it('resets to current level when reopened', async () => {
    const wrapper = mountModal({ current: 5 });
    const stepBtns = wrapper.findAll('.step-btn');
    await stepBtns[1].trigger('click'); // + → 6
    expect(wrapper.find('.level-num').text()).toBe('6');

    await wrapper.setProps({ show: false });
    await wrapper.setProps({ show: true, current: 5 });
    expect(wrapper.find('.level-num').text()).toBe('5');
  });

  it('renders start and cancel button text', () => {
    const wrapper = mountModal();
    expect(wrapper.find('.btn-cancel').text()).toBe('取消');
    expect(wrapper.find('.btn-start').text()).toBe('开始！');
  });
});
