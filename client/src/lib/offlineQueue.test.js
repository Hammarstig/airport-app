import { beforeEach, describe, expect, it, vi } from 'vitest';
import { discard, enqueue, flush, onSent, subscribe } from './offlineQueue.js';
import { outbox } from './idb.js';

const body = { iata: 'GOT', visitedOn: '2026-11-01', kind: 'departure' };
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

describe('offlinekön', () => {
  beforeEach(async () => {
    for (const i of await outbox.all()) await outbox.remove(i.id);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  });

  it('köar och rapporterar till prenumeranter', async () => {
    const seen = [];
    const off = subscribe((s) => seen.push(s.items.length));
    await enqueue({ body, photos: [], airport: { iata: 'GOT' } });
    off();
    expect(seen.at(-1)).toBe(1);
  });

  it('skickar köade check-ins i ordning och tar bort dem ur kön', async () => {
    await enqueue({ body, photos: [] });
    await enqueue({ body: { ...body, iata: 'ARN' }, photos: [] });
    const calls = [];
    global.fetch = vi.fn(async (url, init) => {
      calls.push(`${init.method} ${url}`);
      return url.endsWith('/photos') ? json({ id: 1 }, 201) : json({ id: calls.length }, 201);
    });
    const sent = vi.fn();
    const off = onSent(sent);
    expect(await flush()).toBe(2);
    off();
    expect(calls).toEqual(['POST /api/checkins', 'POST /api/checkins']);
    expect(await outbox.all()).toHaveLength(0);
    expect(sent).toHaveBeenCalledWith(2);
  });

  it('avvisad post (400) ligger kvar med felet och kan tas bort', async () => {
    await enqueue({ body, photos: [] });
    global.fetch = vi.fn(async () => json({ error: 'Ogiltigt' }, 400));
    expect(await flush()).toBe(0);
    const [item] = await outbox.all();
    expect(item.error).toBe('Ogiltigt');
    expect(item.attempts).toBe(1);
    await discard(item.id);
    expect(await outbox.all()).toHaveLength(0);
  });

  it('nätverksfel och serverfel avbryter utan att markera fel', async () => {
    await enqueue({ body, photos: [] });
    global.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await flush()).toBe(0);
    expect((await outbox.all())[0].error).toBeNull();
    global.fetch = vi.fn(async () => json({ error: 'fel' }, 503));
    expect(await flush()).toBe(0);
    expect((await outbox.all())[0].error).toBeNull();
  });

  it('samtidiga flush delar samma körning (ingen dubbelsändning)', async () => {
    await enqueue({ body, photos: [] });
    let n = 0;
    global.fetch = vi.fn(async () => {
      n++;
      return json({ id: 9 }, 201);
    });
    const [a, b] = await Promise.all([flush(), flush()]);
    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(n).toBe(1);
  });
});
