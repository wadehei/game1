import { describe, it, expect, vi, beforeEach } from 'vitest';
import { success, fail, asyncHandler } from '../response';
import { Request, Response, NextFunction } from 'express';

describe('response utils', () => {
  let mockRes: Response;

  beforeEach(() => {
    mockRes = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;
  });

  describe('success', () => {
    it('should send success response with data', () => {
      const data = { id: 1, name: 'test' };
      success(mockRes, data);
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 200,
        message: 'success',
        data,
      });
    });

    it('should send success response with custom message', () => {
      const data = { id: 1 };
      success(mockRes, data, '创建成功');
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 200,
        message: '创建成功',
        data,
      });
    });
  });

  describe('fail', () => {
    it('should send fail response with default code 400', () => {
      fail(mockRes, '参数错误');
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 400,
        message: '参数错误',
      });
    });

    it('should send fail response with custom code', () => {
      fail(mockRes, '未授权', 401);
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        code: 401,
        message: '未授权',
      });
    });
  });

  describe('asyncHandler', () => {
    it('should handle successful async operations', async () => {
      const mockReq = {} as Request;
      const mockNext = vi.fn() as NextFunction;
      const handler = vi.fn().mockResolvedValue(undefined);

      const wrappedHandler = asyncHandler(handler);
      await wrappedHandler(mockReq, mockRes, mockNext);

      expect(handler).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should catch errors and pass to next', async () => {
      const mockReq = {} as Request;
      const mockNext = vi.fn() as NextFunction;
      const error = new Error('Test error');
      const handler = vi.fn().mockRejectedValue(error);

      const wrappedHandler = asyncHandler(handler);
      await wrappedHandler(mockReq, mockRes, mockNext);

      expect(handler).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});
