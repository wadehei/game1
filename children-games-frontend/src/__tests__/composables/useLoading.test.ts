import { describe, it, expect, vi } from 'vitest';
import { useLoading, useNetwork } from '@/composables/useLoading';

describe('useLoading', () => {
  it('should initialize with default values', () => {
    const asyncFn = vi.fn().mockResolvedValue('test');
    const { data, loading, error } = useLoading(asyncFn);

    expect(data.value).toBeNull();
    expect(loading.value).toBe(false);
    expect(error.value).toBeNull();
  });

  it('should set loading state during execution', async () => {
    const asyncFn = vi
      .fn()
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('result'), 10)));
    const { execute, loading } = useLoading(asyncFn);

    expect(loading.value).toBe(false);
    const promise = execute();
    expect(loading.value).toBe(true);
    await promise;
    expect(loading.value).toBe(false);
  });

  it('should store successful result in data', async () => {
    const asyncFn = vi.fn().mockResolvedValue({ id: 1, name: 'test' });
    const { data, execute } = useLoading(asyncFn);

    await execute();
    expect(data.value).toEqual({ id: 1, name: 'test' });
  });

  it('should store error message on failure', async () => {
    const asyncFn = vi.fn().mockRejectedValue(new Error('Network failed'));
    const { error, execute, data } = useLoading(asyncFn);

    const result = await execute();
    expect(result).toBeNull();
    expect(data.value).toBeNull();
    expect(error.value).toBe('Network failed');
  });

  it('should handle non-Error rejection', async () => {
    const asyncFn = vi.fn().mockRejectedValue('string error');
    const { error, execute } = useLoading(asyncFn);

    await execute();
    expect(error.value).toBe('string error');
  });

  it('should call onSuccess callback with result', async () => {
    const onSuccess = vi.fn();
    const asyncFn = vi.fn().mockResolvedValue('success');
    const { execute } = useLoading(asyncFn, { onSuccess });

    await execute();
    expect(onSuccess).toHaveBeenCalledWith('success');
  });

  it('should call onError callback with error', async () => {
    const onError = vi.fn();
    const testError = new Error('test error');
    const asyncFn = vi.fn().mockRejectedValue(testError);
    const { execute } = useLoading(asyncFn, { onError });

    await execute();
    expect(onError).toHaveBeenCalledWith(testError);
  });

  it('should execute immediately when immediate option is true', async () => {
    const asyncFn = vi.fn().mockResolvedValue('immediate');
    const { data } = useLoading(asyncFn, { immediate: true });

    // Wait for the immediate execution
    await vi.waitFor(() => {
      expect(data.value).toBe('immediate');
    });
  });

  it('should reset to initial state', async () => {
    const asyncFn = vi.fn().mockResolvedValue('data');
    const { execute, reset, data, error, loading } = useLoading(asyncFn);

    await execute();
    expect(data.value).toBe('data');

    reset();
    expect(data.value).toBeNull();
    expect(error.value).toBeNull();
    expect(loading.value).toBe(false);
  });

  it('should use custom initial value', () => {
    const asyncFn = vi.fn();
    const { data } = useLoading(asyncFn, { initialValue: [] });
    expect(data.value).toEqual([]);
  });
});

describe('useNetwork', () => {
  it('should return current online status', () => {
    const { isOnline } = useNetwork();
    expect(typeof isOnline.value).toBe('boolean');
  });

  it('should update status on online event', () => {
    const { isOnline } = useNetwork();

    // Simulate offline then online
    window.dispatchEvent(new Event('offline'));
    expect(isOnline.value).toBe(false);

    window.dispatchEvent(new Event('online'));
    expect(isOnline.value).toBe(true);
  });
});
