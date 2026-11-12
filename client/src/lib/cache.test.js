import { describe, expect, it } from 'vitest';
import { cacheClear, cacheGet, cacheInvalidate, cacheSet } from './cache.js';

describe('cache', () => {
  it('sparar, slänger per prefix och tömmer', () => {
    cacheSet('/api/feed?x', 1);
    cacheSet('/api/airports/GOT', 2);
    expect(cacheGet('/api/feed?x')).toBe(1);
    cacheInvalidate(['/api/feed']);
    expect(cacheGet('/api/feed?x')).toBeUndefined();
    expect(cacheGet('/api/airports/GOT')).toBe(2);
    cacheClear();
    expect(cacheGet('/api/airports/GOT')).toBeUndefined();
  });
});
