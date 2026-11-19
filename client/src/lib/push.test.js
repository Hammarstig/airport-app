import { afterEach, describe, expect, it, vi } from 'vitest';
import { enablePush } from './push.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function fakeSub(endpoint) {
  return {
    endpoint,
    unsubscribe: vi.fn(async () => true),
    toJSON: () => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } })
  };
}

describe('push', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('409 push_endpoint_taken: avregistrerar enhetens gamla prenumeration och prenumererar om', async () => {
    const old = fakeSub('https://fcm.googleapis.com/fcm/send/gammal');
    const fresh = fakeSub('https://fcm.googleapis.com/fcm/send/ny');
    const pushManager = { getSubscription: vi.fn(async () => old), subscribe: vi.fn(async () => fresh) };
    vi.stubGlobal('Notification', { requestPermission: async () => 'granted', permission: 'granted' });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager }) }
    });
    const posted = [];
    global.fetch = vi.fn(async (url, init) => {
      if (url.includes('/push/public-key')) return json({ enabled: true, publicKey: 'BAAA' });
      const body = JSON.parse(init.body);
      posted.push(body.endpoint);
      return body.endpoint === old.endpoint
        ? json({ error: 'Upptagen', code: 'push_endpoint_taken' }, 409)
        : json({ ok: true }, 201);
    });
    expect(await enablePush()).toBe('on');
    expect(old.unsubscribe).toHaveBeenCalled();
    expect(posted).toEqual([old.endpoint, fresh.endpoint]);
  });
});
