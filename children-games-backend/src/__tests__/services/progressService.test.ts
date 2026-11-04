import { describe, it, expect } from 'vitest';
import { parseLevelStars } from '../../services/progressService';

describe('parseLevelStars', () => {
  it('returns {} for null input', () => {
    expect(parseLevelStars(null)).toEqual({});
  });

  it('returns {} for empty string', () => {
    expect(parseLevelStars('')).toEqual({});
  });

  it('parses valid JSON object', () => {
    expect(parseLevelStars('{"1":3,"2":2}')).toEqual({ '1': 3, '2': 2 });
  });

  it('returns {} for invalid JSON', () => {
    expect(parseLevelStars('{invalid')).toEqual({});
  });

  it('returns {} for JSON array (not an object)', () => {
    expect(parseLevelStars('[1,2]')).toEqual({});
  });

  it('returns {} for undefined input', () => {
    // @ts-expect-error: intentionally passing undefined
    expect(parseLevelStars(undefined)).toEqual({});
  });
});
