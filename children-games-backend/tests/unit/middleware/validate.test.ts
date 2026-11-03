import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  validate,
  validateBody,
  validateQuery,
  validateParams,
} from '../../../src/middleware/validate';

const mockResponse = () => {
  const res: any = {
    statusCode: 200,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
};

describe('validate middleware', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  });

  it('should call next() when body is valid', () => {
    const req: any = { body: { name: 'Alice', age: 25 } };
    const res = mockResponse();
    const next = vi.fn();
    validate(schema, 'body')(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({ name: 'Alice', age: 25 });
  });

  it('should return 400 when body is invalid', () => {
    const req: any = { body: { name: 123, age: -5 } };
    const res = mockResponse();
    const next = vi.fn();
    validate(schema, 'body')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe(400);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.details).toBeDefined();
    expect(body.details.length).toBeGreaterThan(0);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 400 when required fields are missing', () => {
    const req: any = { body: {} };
    const res = mockResponse();
    const next = vi.fn();
    validate(schema, 'body')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should validate query params', () => {
    const querySchema = z.object({ page: z.string() });
    const req: any = { query: { page: '1' } };
    const res = mockResponse();
    const next = vi.fn();
    validate(querySchema, 'query')(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.query).toEqual({ page: '1' });
  });

  it('should validate params', () => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const req: any = { params: { id: 'not-a-uuid' } };
    const res = mockResponse();
    const next = vi.fn();
    validate(paramsSchema, 'params')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should replace req data with validated data (strip extras)', () => {
    const req: any = { body: { name: 'Bob', age: 30, extra: 'should be stripped' } };
    const res = mockResponse();
    const next = vi.fn();
    validate(schema, 'body')(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.body.extra).toBeUndefined();
    expect(req.body).toEqual({ name: 'Bob', age: 30 });
  });

  it('should format error details with field path and message', () => {
    const nestedSchema = z.object({
      address: z.object({ city: z.string() }),
    });
    const req: any = { body: { address: { city: 123 } } };
    const res = mockResponse();
    const next = vi.fn();
    validate(nestedSchema, 'body')(req, res, next);
    const body = res.json.mock.calls[0][0];
    expect(body.details[0].field).toBe('address.city');
    expect(body.details[0].message).toBeDefined();
  });
});

describe('validateBody / validateQuery / validateParams shortcuts', () => {
  const schema = z.object({ x: z.string() });

  it('validateBody should validate req.body', () => {
    const req: any = { body: { x: 'hello' } };
    const res = mockResponse();
    const next = vi.fn();
    validateBody(schema)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('validateQuery should validate req.query', () => {
    const req: any = { query: {} };
    const res = mockResponse();
    const next = vi.fn();
    validateQuery(schema)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('validateParams should validate req.params', () => {
    const req: any = { params: { x: 'ok' } };
    const res = mockResponse();
    const next = vi.fn();
    validateParams(schema)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
