import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PlayerAvatar from '@/components/PlayerAvatar.vue';

describe('PlayerAvatar', () => {
  it('renders default emoji when no avatar provided', () => {
    const wrapper = mount(PlayerAvatar);
    expect(wrapper.find('.avatar-emoji').text()).toBe('😊');
  });

  it('renders emoji avatar when emoji string provided', () => {
    const wrapper = mount(PlayerAvatar, {
      props: { avatar: '🦁' },
    });
    expect(wrapper.find('.avatar-emoji').text()).toBe('🦁');
  });

  it('renders image when URL provided', () => {
    const wrapper = mount(PlayerAvatar, {
      props: { avatar: 'https://example.com/avatar.png' },
    });
    const img = wrapper.find('img.player-avatar');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/avatar.png');
  });

  it('renders image for relative URL', () => {
    const wrapper = mount(PlayerAvatar, {
      props: { avatar: '/api/avatars/test.png' },
    });
    const img = wrapper.find('img.player-avatar');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('/api/avatars/test.png');
  });

  it('uses default size 44px when no size provided', () => {
    const wrapper = mount(PlayerAvatar);
    const avatar = wrapper.find('.player-avatar');
    expect(avatar.attributes('style')).toContain('width: 44px');
    expect(avatar.attributes('style')).toContain('height: 44px');
  });

  it('uses custom size when provided', () => {
    const wrapper = mount(PlayerAvatar, {
      props: { size: 60 },
    });
    const avatar = wrapper.find('.player-avatar');
    expect(avatar.attributes('style')).toContain('width: 60px');
    expect(avatar.attributes('style')).toContain('height: 60px');
  });

  it('calculates font size based on avatar size', () => {
    const wrapper = mount(PlayerAvatar, {
      props: { size: 100 },
    });
    const avatar = wrapper.find('.avatar-emoji');
    // fontSize = Math.round(size * 0.58) = 58
    expect(avatar.attributes('style')).toContain('font-size: 58px');
  });

  it('applies background color for emoji avatar', () => {
    const wrapper = mount(PlayerAvatar, {
      props: { avatar: '🐶' },
    });
    const avatar = wrapper.find('.avatar-emoji');
    expect(avatar.attributes('style')).toContain('background');
  });

  it('uses different background for different emojis', () => {
    const wrapper1 = mount(PlayerAvatar, {
      props: { avatar: '🐶' },
    });
    const wrapper2 = mount(PlayerAvatar, {
      props: { avatar: '🦁' },
    });

    const bg1 = wrapper1.find('.avatar-emoji').attributes('style');
    const bg2 = wrapper2.find('.avatar-emoji').attributes('style');

    // Different emojis should have different backgrounds
    expect(bg1).not.toBe(bg2);
  });

  it('renders span for emoji avatar', () => {
    const wrapper = mount(PlayerAvatar, {
      props: { avatar: '🎉' },
    });
    expect(wrapper.find('span.avatar-emoji').exists()).toBe(true);
  });

  it('renders img for http URL', () => {
    const wrapper = mount(PlayerAvatar, {
      props: { avatar: 'http://example.com/avatar.png' },
    });
    expect(wrapper.find('img.player-avatar').exists()).toBe(true);
  });

  it('renders img for https URL', () => {
    const wrapper = mount(PlayerAvatar, {
      props: { avatar: 'https://example.com/avatar.png' },
    });
    expect(wrapper.find('img.player-avatar').exists()).toBe(true);
  });

  it('has alt text for image', () => {
    const wrapper = mount(PlayerAvatar, {
      props: { avatar: 'https://example.com/avatar.png' },
    });
    const img = wrapper.find('img.player-avatar');
    expect(img.attributes('alt')).toBe('头像');
  });

  it('handles empty string avatar as emoji', () => {
    const wrapper = mount(PlayerAvatar, {
      props: { avatar: '' },
    });
    expect(wrapper.find('.avatar-emoji').exists()).toBe(true);
    expect(wrapper.find('.avatar-emoji').text()).toBe('😊');
  });

  it('does not render img for non-URL avatar', () => {
    const wrapper = mount(PlayerAvatar, {
      props: { avatar: '🦊' },
    });
    expect(wrapper.find('img').exists()).toBe(false);
  });
});
