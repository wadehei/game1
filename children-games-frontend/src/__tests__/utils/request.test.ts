import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

// Spy on axios.create to capture the instance and its interceptor callbacks
let capturedInstance: any = null;
const originalCreate = axios.create;

vi.spyOn(axios, 'create').mockImplementation((...args) => {
  // 注意：wrapper 必须闭包绑定本实例（inst），不能引用可变的 capturedInstance——
  // 否则同一次被测代码里连续 axios.create 两个实例时，早期实例的拦截器注册
  // 会被重定向到最后一个实例上（createApiClient 双实例场景踩过）
  const inst: any = originalCreate.call(axios, ...args);
  capturedInstance = inst;

  // Wrap interceptors.use to capture the callbacks
  const origReqUse = inst.interceptors.request.use;
  const origResUse = inst.interceptors.response.use;

  let reqFn: any;
  let resOkFn: any;
  let resErrFn: any;

  inst.interceptors.request.use = (fn: any, ...rest: any[]) => {
    reqFn = fn;
    return origReqUse.call(inst.interceptors.request, fn, ...rest);
  };
  inst.interceptors.response.use = (okFn: any, errFn: any, ...rest: any[]) => {
    resOkFn = okFn;
    resErrFn = errFn;
    return origResUse.call(inst.interceptors.response, okFn, errFn, ...rest);
  };

  // Expose for testing
  inst.__testGetReqInterceptor = () => reqFn;
  inst.__testGetResOkInterceptor = () => resOkFn;
  inst.__testGetResErrInterceptor = () => resErrFn;

  return inst;
});

// Mock the user store module
vi.mock('@/store/user', () => {
  const logoutFn = vi.fn(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('userInfo');
  });
  const setTokensFn = vi.fn((accessToken: string, refreshToken: string) => {
    localStorage.setItem('token', accessToken);
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }
  });
  return {
    useUserStore: () => ({
      logout: logoutFn,
      setTokens: setTokensFn,
    }),
  };
});

// Import after spy is set up — but since request.ts uses top-level axios.create,
// we need to use dynamic import
describe('request (api)', () => {
  let api: any;

  beforeEach(async () => {
    localStorage.clear();
    capturedInstance = null;

    // Re-import to trigger axios.create with our spy
    vi.resetModules();
    const mod = await import('../../utils/request');
    api = mod.api;
  });

  describe('api methods', () => {
    it('should expose get, post, put, delete methods', () => {
      expect(api.get).toBeTypeOf('function');
      expect(api.post).toBeTypeOf('function');
      expect(api.put).toBeTypeOf('function');
      expect(api.delete).toBeTypeOf('function');
    });
  });

  describe('request interceptor', () => {
    it('should add Authorization header when token exists', () => {
      localStorage.setItem('token', 'test-jwt-token');
      const reqFn = capturedInstance.__testGetReqInterceptor();

      const config = { headers: {} as Record<string, string> };
      const result = reqFn(config);

      expect(result.headers.Authorization).toBe('Bearer test-jwt-token');
    });

    it('should not add Authorization header when no token', () => {
      const reqFn = capturedInstance.__testGetReqInterceptor();

      const config = { headers: {} as Record<string, string> };
      const result = reqFn(config);

      expect(result.headers.Authorization).toBeUndefined();
    });
  });

  describe('response interceptor', () => {
    it('should unwrap data when code is 200', () => {
      const resOkFn = capturedInstance.__testGetResOkInterceptor();
      const response = { data: { code: 200, data: { id: 1 }, message: 'ok' } };

      expect(resOkFn(response)).toEqual({ id: 1 });
    });

    it('should throw on non-200 response code', () => {
      const resOkFn = capturedInstance.__testGetResOkInterceptor();
      const response = { data: { code: 400, data: null, message: 'Bad Request' } };

      expect(() => resOkFn(response)).toThrow('Bad Request');
    });

    it('should throw default message when message is empty', () => {
      const resOkFn = capturedInstance.__testGetResOkInterceptor();
      const response = { data: { code: 500, data: null, message: '' } };

      expect(() => resOkFn(response)).toThrow('请求失败');
    });

    it('should clear token on 401 status (no refresh token available)', async () => {
      localStorage.setItem('token', 'expired-token');
      localStorage.setItem('userInfo', '{"name":"test"}');
      const resErrFn = capturedInstance.__testGetResErrInterceptor();

      const error = { response: { status: 401 } };
      // 拦截器为 async：无 refreshToken 时静默刷新直接失败，落入清理分支后 rethrow
      await expect(resErrFn(error)).rejects.toThrow();

      // 等待动态 import 和 store 调用完成
      await vi.waitFor(() => {
        expect(localStorage.getItem('token')).toBeNull();
        expect(localStorage.getItem('userInfo')).toBeNull();
        expect(localStorage.getItem('refresh_token')).toBeNull();
      });
    });

    it('should not clear token on non-401 error', async () => {
      localStorage.setItem('token', 'valid-token');
      const resErrFn = capturedInstance.__testGetResErrInterceptor();

      const error = { response: { status: 500 } };
      await expect(resErrFn(error)).rejects.toThrow();

      expect(localStorage.getItem('token')).toBe('valid-token');
    });
  });
});

describe('createApiClient（admin 等独立模块用）', () => {
  it('raw 实例必须带 baseURL——回归守护：曾是全局 axios，生产同源部署丢 /api 前缀全 404', async () => {
    localStorage.setItem('admin_token', 'adm-jwt');
    const mod = await import('../../utils/request');
    const client = mod.createApiClient({ baseURL: '/api/voice', tokenKey: 'admin_token' });

    expect((client.raw as any).defaults.baseURL).toBe('/api/voice');
    expect(client.raw).not.toBe(axios); // 不能是全局裸实例
  });

  it('raw 不做 {code,data} 解包且自动附 token（blob 场景拿原始响应）', async () => {
    localStorage.setItem('admin_token', 'adm-jwt');
    const mod = await import('../../utils/request');
    const client = mod.createApiClient({ baseURL: '/api/voice', tokenKey: 'admin_token' });

    const envelope = { code: 200, data: { voiceId: 'v1' }, message: 'ok' };
    const adapter = vi.fn().mockResolvedValue({
      data: envelope,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    });
    (client.raw as any).defaults.adapter = adapter;

    const res = await client.raw.post('/game_start', 'blob-bytes');
    expect(res.data).toEqual(envelope); // 原始 AxiosResponse，未解包

    const reqConfig = adapter.mock.calls[0][0];
    expect(reqConfig.url).toBe('/game_start');
    const auth = reqConfig.headers?.get?.('Authorization') ?? reqConfig.headers?.Authorization;
    expect(auth).toBe('Bearer adm-jwt');
  });
});
