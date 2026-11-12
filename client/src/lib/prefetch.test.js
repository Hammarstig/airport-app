import { describe, expect, it, vi } from 'vitest';

vi.mock('../routes.js', () => ({
  loaders: new Proxy({}, { get: (_, k) => (globalThis.__loaded.push(k), () => Promise.resolve()) })
}));
vi.mock('./api.js', () => ({
  api: new Proxy(
    {},
    {
      get:
        (_, k) =>
        (...a) => (globalThis.__data.push([k, ...a]), Promise.resolve())
    }
  )
}));

describe('prefetchPath', () => {
  it('hämtar sidkod och data en gång per väg', async () => {
    globalThis.__loaded = [];
    globalThis.__data = [];
    const { prefetchPath } = await import('./prefetch.js');
    prefetchPath('/airport/got');
    prefetchPath('/airport/got');
    prefetchPath('/u/anna');
    prefetchPath('https://example.com/x');
    expect(globalThis.__loaded).toEqual(['airport', 'profile']);
    expect(globalThis.__data.map((d) => d[0])).toEqual(['airport', 'airportCheckins', 'user', 'userAirports']);
    expect(globalThis.__data[0][1]).toBe('GOT');
  });
});
