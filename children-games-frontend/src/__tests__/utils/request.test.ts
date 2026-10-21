import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

// Spy on axios.create to capture the instance and its interceptor callbacks
let capturedInstance: any = null;
const originalCreate = axios.create;

vi.spyOn(axios, 'create').mockImplementation((...args) => {
  capturedInstance = originalCreate.call(axios, ...args);

  // Wrap interceptors.use to capture the callbacks
  const origReqUse = capturedInstance.interceptors.request.use;
  const origResUse = capturedInstance.interceptors.response.use;

  let reqFn: any;
  let resOkFn: any;
  let resErrFn: any;

  capturedInstance.interceptors.request.use = (fn: any, ...rest: any[]) => {
    reqFn = fn;
    return origReqUse.call(capturedInstance.interceptors.request, fn, ...rest);
  };
  capturedInstance.interceptors.response.use = (okFn: any, errFn: any, ...rest: any[]) => {
    resOkFn = okFn;
    resErrFn = errFn;
    return origResUse.call(capturedInstance.interceptors.response, okFn, errFn, ...rest);
  };

  // Expose for testing
  capturedInstance.__testGetReqInterceptor = () => reqFn;
  capturedInstance.__testGetResOkInterceptor = () => resOkFn;
  capturedInstance.__testGetResErrInterceptor = () => resErrFn;

  return capturedInstance;
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

    it('should clear token on 401 status', () => {
      localStorage.setItem('token', 'expired-token');
      localStorage.setItem('userInfo', '{"name":"test"}');
      const resErrFn = capturedInstance.__testGetResErrInterceptor();

      const error = { response: { status: 401 } };
      expect(() => resErrFn(error)).toThrow();

      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('userInfo')).toBeNull();
    });

    it('should not clear token on non-401 error', () => {
      localStorage.setItem('token', 'valid-token');
      const resErrFn = capturedInstance.__testGetResErrInterceptor();

      const error = { response: { status: 500 } };
      expect(() => resErrFn(error)).toThrow();

      expect(localStorage.getItem('token')).toBe('valid-token');
    });
  });
});
