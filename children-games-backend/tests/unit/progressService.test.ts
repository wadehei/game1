import { describe, it, expect } from 'vitest';
import { parseLevelStars } from '../../src/services/progressService';

describe('parseLevelStars', () => {
  it('should parse valid JSON string', () => {
    const result = parseLevelStars('{"1": 3, "2": 2}');
    expect(result).toEqual({ '1': 3, '2': 2 });
  });

  it('should return empty object for null', () => {
    const result = parseLevelStars(null);
    expect(result).toEqual({});
  });

  it('should return empty object for empty string', () => {
    const result = parseLevelStars('');
    expect(result).toEqual({});
  });

  it('should return empty object for invalid JSON', () => {
    const result = parseLevelStars('not json');
    expect(result).toEqual({});
  });

  it('should return empty object for non-object JSON', () => {
    const result = parseLevelStars('"string"');
    expect(result).toEqual({});
  });
});
