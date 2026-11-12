import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, getToken, onUnauthorized, request, setToken } from './api.js';
import { cacheGet } from './cache.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

describe('api.request', () => {
  beforeEach(() => setToken('aaa.bbb.ccc'));

  it('skickar token, cachar GET och tolkar fel med kod', async () => {
    global.fetch = vi.fn(async (url, init) => {
      expect(init.headers.Authorization).toBe('Bearer aaa.bbb.ccc');
      return url.startsWith('/api/airports/GOT')
        ? json({ iata: 'GOT' })
        : json({ error: 'Ogiltigt', code: 'x', allowed: ['a'] }, 400);
    });
    expect(await api.airport('GOT')).toEqual({ iata: 'GOT' });
    expect(api.peek.airport('GOT')).toEqual({ iata: 'GOT' });
    await expect(request('/rankings/users', { params: { metric: 'bad' } })).rejects.toMatchObject({
      status: 400,
      code: 'x',
      allowed: ['a']
    });
  });

  it('förnyar en utgången token och gör om anropet', async () => {
    const calls = [];
    global.fetch = vi.fn(async (url, init) => {
      calls.push(url);
      if (url === '/api/auth/refresh') return json({ token: 'new.tok.en', user: { username: 'anna' }, expiresIn: 900 });
      if (init.headers.Authorization === 'Bearer new.tok.en') return json({ ok: 1 });
      return json({ error: 'Utgången', code: 'token_expired' }, 401);
    });
    expect(await api.me()).toEqual({ ok: 1 });
    expect(calls).toEqual(['/api/me', '/api/auth/refresh', '/api/me']);
    expect(getToken()).toBe('new.tok.en');
  });

  it('återkallad session loggar ut utan förnyelse', async () => {
    const out = vi.fn();
    const off = onUnauthorized(out);
    global.fetch = vi.fn(async () => json({ error: 'Återkallad', code: 'session_revoked' }, 401));
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(out).toHaveBeenCalled();
    off();
  });

  it('fel lösenord vid kontoradering loggar inte ut (BUG-09)', async () => {
    const out = vi.fn();
    const off = onUnauthorized(out);
    global.fetch = vi.fn(async () => json({ error: 'Fel lösenord' }, 403));
    await expect(api.deleteMe('x')).rejects.toMatchObject({ status: 403 });
    expect(out).not.toHaveBeenCalled();
    off();
  });

  it('skrivande anrop slänger bara berörd cache', async () => {
    global.fetch = vi.fn(async (url, init) =>
      init.method === 'GET' ? json({ url }) : json({ likes: 1, likedByMe: true })
    );
    await api.airport('ARN');
    await api.feed(20, 0, 'global');
    await api.like(5);
    expect(cacheGet('/api/airports/ARN')).toBeTruthy();
    await api.addWish('ARN');
    expect(cacheGet('/api/airports/ARN')).toBeUndefined();
  });
});
