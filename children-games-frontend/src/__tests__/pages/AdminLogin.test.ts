import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import AdminLogin from '@/pages/admin/AdminLogin.vue';

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

const mockAdminLogin = vi.fn();
const mockVerify2fa = vi.fn();
const mockIsAdminLoggedIn = vi.fn();

vi.mock('@/api/admin', () => ({
  adminLogin: (...args: unknown[]) => mockAdminLogin(...args),
  verify2faLogin: (...args: unknown[]) => mockVerify2fa(...args),
  isAdminLoggedIn: (...args: unknown[]) => mockIsAdminLoggedIn(...args),
}));

describe('AdminLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdminLoggedIn.mockReturnValue(false);
  });

  it('renders login form', () => {
    const wrapper = mount(AdminLogin);
    expect(wrapper.find('.admin-login').exists()).toBe(true);
    expect(wrapper.find('.login-card').exists()).toBe(true);
    expect(wrapper.find('.login-title').text()).toBe('家长后台');
  });

  it('renders password input', () => {
    const wrapper = mount(AdminLogin);
    const input = wrapper.find('.login-input');
    expect(input.exists()).toBe(true);
    expect(input.attributes('type')).toBe('password');
  });

  it('renders login button', () => {
    const wrapper = mount(AdminLogin);
    const btn = wrapper.find('.login-btn');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toBe('进入后台');
  });

  it('renders back button', () => {
    const wrapper = mount(AdminLogin);
    const btn = wrapper.find('.login-back');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toBe('返回游戏');
  });

  it('disables login button when password is empty', () => {
    const wrapper = mount(AdminLogin);
    const btn = wrapper.find('.login-btn');
    expect(btn.attributes('disabled')).toBeDefined();
  });

  it('enables login button when password entered', async () => {
    const wrapper = mount(AdminLogin);
    const input = wrapper.find('.login-input');
    await input.setValue('test123');
    const btn = wrapper.find('.login-btn');
    expect(btn.attributes('disabled')).toBeUndefined();
  });

  it('shows error message when login fails', async () => {
    mockAdminLogin.mockRejectedValueOnce({
      response: { data: { message: '密码错误' } },
    });
    const wrapper = mount(AdminLogin);
    await wrapper.find('.login-input').setValue('wrong');
    await wrapper.find('.login-btn').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('.login-error').text()).toBe('密码错误');
    });
  });

  it('shows default error message when login fails without message', async () => {
    mockAdminLogin.mockRejectedValueOnce(new Error('network'));
    const wrapper = mount(AdminLogin);
    await wrapper.find('.login-input').setValue('wrong');
    await wrapper.find('.login-btn').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('.login-error').text()).toBe('登录失败，请重试');
    });
  });

  it('navigates to /admin on successful login', async () => {
    mockAdminLogin.mockResolvedValueOnce({ token: 'admin-jwt' });
    const wrapper = mount(AdminLogin);
    await wrapper.find('.login-input').setValue('correct');
    await wrapper.find('.login-btn').trigger('click');
    await vi.waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/admin');
    });
  });

  it('shows 2FA step when require2FA, then verifies code and navigates', async () => {
    mockAdminLogin.mockResolvedValueOnce({ require2FA: true, tempToken: 'tmp-123' });
    const wrapper = mount(AdminLogin);
    await wrapper.find('.login-input').setValue('correct');
    await wrapper.find('.login-btn').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('6 位验证码');
    });
    expect(mockReplace).not.toHaveBeenCalled();

    await wrapper.find('.login-input').setValue('123456');
    await wrapper.find('.login-btn').trigger('click');
    await vi.waitFor(() => {
      expect(mockVerify2fa).toHaveBeenCalledWith('tmp-123', '123456');
      expect(mockReplace).toHaveBeenCalledWith('/admin');
    });
  });

  it('back button in 2FA step returns to password step', async () => {
    mockAdminLogin.mockResolvedValueOnce({ require2FA: true, tempToken: 'tmp-123' });
    const wrapper = mount(AdminLogin);
    await wrapper.find('.login-input').setValue('correct');
    await wrapper.find('.login-btn').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('6 位验证码');
    });
    await wrapper.find('.login-back').trigger('click');
    expect(wrapper.text()).toContain('请输入管理密码');
  });

  it('navigates to / when back button clicked', async () => {
    const wrapper = mount(AdminLogin);
    await wrapper.find('.login-back').trigger('click');
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('auto-redirects if already logged in', () => {
    mockIsAdminLoggedIn.mockReturnValue(true);
    mount(AdminLogin);
    expect(mockReplace).toHaveBeenCalledWith('/admin');
  });

  it('does not redirect if not logged in', () => {
    mockIsAdminLoggedIn.mockReturnValue(false);
    mount(AdminLogin);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('shows loading state during login', async () => {
    let resolvePromise: () => void;
    const pendingPromise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });
    mockAdminLogin.mockReturnValueOnce(pendingPromise);

    const wrapper = mount(AdminLogin);
    await wrapper.find('.login-input').setValue('test');
    await wrapper.find('.login-btn').trigger('click');

    await vi.waitFor(() => {
      expect(wrapper.find('.login-btn').text()).toBe('验证中…');
    });

    resolvePromise!();
  });

  it('submits form on Enter key', async () => {
    mockAdminLogin.mockResolvedValueOnce(undefined);
    const wrapper = mount(AdminLogin);
    await wrapper.find('.login-input').setValue('test123');
    await wrapper.find('.login-input').trigger('keyup.enter');
    await vi.waitFor(() => {
      expect(mockAdminLogin).toHaveBeenCalledWith('test123');
    });
  });

  it('does not submit when password is empty and Enter pressed', async () => {
    const wrapper = mount(AdminLogin);
    await wrapper.find('.login-input').trigger('keyup.enter');
    expect(mockAdminLogin).not.toHaveBeenCalled();
  });

  it('clears error when retrying login', async () => {
    mockAdminLogin
      .mockRejectedValueOnce({ response: { data: { message: '密码错误' } } })
      .mockResolvedValueOnce(undefined);

    const wrapper = mount(AdminLogin);
    const input = wrapper.find('.login-input');

    await input.setValue('wrong');
    await wrapper.find('.login-btn').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('.login-error').exists()).toBe(true);
      expect(wrapper.find('.login-error').text()).toBe('密码错误');
    });

    await input.setValue('correct');
    await wrapper.find('.login-btn').trigger('click');
    // Error is cleared via v-if - element disappears from DOM
    await vi.waitFor(() => {
      expect(wrapper.find('.login-error').exists()).toBe(false);
    });
  });
});
