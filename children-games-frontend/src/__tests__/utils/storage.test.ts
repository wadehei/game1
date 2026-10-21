import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storage, storageUtils } from '../../utils/storage';

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('basic operations', () => {
    it('should set and get a string value', () => {
      storage.setItem('foo', 'bar');
      expect(storage.getItem('foo')).toBe('bar');
    });

    it('should return null for missing key', () => {
      expect(storage.getItem('missing')).toBeNull();
    });

    it('should remove an item', () => {
      storage.setItem('key', 'val');
      storage.removeItem('key');
      expect(storage.getItem('key')).toBeNull();
    });

    it('should clear all items', () => {
      storage.setItem('a', '1');
      storage.setItem('b', '2');
      storage.clear();
      expect(storage.getItem('a')).toBeNull();
      expect(storage.getItem('b')).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should return null when getItem throws', () => {
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage unavailable');
      });
      expect(storage.getItem('any')).toBeNull();
      spy.mockRestore();
    });

    it('should not throw when setItem throws (quota exceeded)', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceeded');
      });
      expect(() => storage.setItem('big', 'x'.repeat(100))).not.toThrow();
      spy.mockRestore();
    });

    it('should not throw when removeItem throws', () => {
      const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('fail');
      });
      expect(() => storage.removeItem('key')).not.toThrow();
      spy.mockRestore();
    });
  });
});

describe('storageUtils', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getJSON / setJSON', () => {
    it('should store and retrieve JSON objects', () => {
      const obj = { name: 'test', scores: [1, 2, 3] };
      storageUtils.setJSON('data', obj);
      expect(storageUtils.getJSON('data')).toEqual(obj);
    });

    it('should return null for missing key', () => {
      expect(storageUtils.getJSON('nope')).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      localStorage.setItem('bad', 'not-json{');
      expect(storageUtils.getJSON('bad')).toBeNull();
    });

    it('should handle arrays', () => {
      storageUtils.setJSON('arr', [1, 'two', true]);
      expect(storageUtils.getJSON('arr')).toEqual([1, 'two', true]);
    });

    it('should handle null value', () => {
      storageUtils.setJSON('nil', null);
      expect(storageUtils.getJSON('nil')).toBeNull();
    });
  });

  describe('getNumber', () => {
    it('should return number for numeric string', () => {
      localStorage.setItem('count', '42');
      expect(storageUtils.getNumber('count')).toBe(42);
    });

    it('should return null for non-numeric string', () => {
      localStorage.setItem('text', 'hello');
      expect(storageUtils.getNumber('text')).toBeNull();
    });

    it('should return null for missing key', () => {
      expect(storageUtils.getNumber('missing')).toBeNull();
    });

    it('should handle float values', () => {
      localStorage.setItem('pi', '3.14');
      expect(storageUtils.getNumber('pi')).toBeCloseTo(3.14);
    });

    it('should handle zero', () => {
      localStorage.setItem('zero', '0');
      expect(storageUtils.getNumber('zero')).toBe(0);
    });
  });

  describe('getBoolean', () => {
    it('should return true for "true"', () => {
      localStorage.setItem('flag', 'true');
      expect(storageUtils.getBoolean('flag')).toBe(true);
    });

    it('should return true for "1"', () => {
      localStorage.setItem('flag', '1');
      expect(storageUtils.getBoolean('flag')).toBe(true);
    });

    it('should return false for other values', () => {
      localStorage.setItem('flag', 'false');
      expect(storageUtils.getBoolean('flag')).toBe(false);
    });

    it('should return false for missing key', () => {
      expect(storageUtils.getBoolean('missing')).toBe(false);
    });
  });
});
