import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBody, submitCheckin } from './submitCheckin.js';
import { outbox } from '../../lib/idb.js';

vi.mock('../../lib/image.js', () => ({
  downscaleToJpeg: async () => ({ blob: new Blob(['x'], { type: 'image/jpeg' }) })
}));

const base = {
  airport: { iata: 'GOT' },
  visitedOn: '2026-11-01',
  kind: 'departure',
  rating: 4.5,
  ratings: { wifi: 4, food: null },
  comment: '  Bra wifi ',
  photos: [],
  travel: {
    airline: { iata: 'SK' },
    flightNumber: 'SK1',
    travelClass: '',
    loungeChoice: 'new',
    newLounge: { name: 'Salen', terminal: '' },
    loungeRating: 4
  }
};

describe('buildBody', () => {
  it('bygger POST-body och utelämnar tomma fält', () => {
    expect(buildBody(base)).toEqual({
      iata: 'GOT',
      visitedOn: '2026-11-01',
      kind: 'departure',
      rating: 4.5,
      ratings: { wifi: 4 },
      comment: 'Bra wifi',
      airlineIata: 'SK',
      flightNumber: 'SK1',
      newLounge: { name: 'Salen' },
      loungeRating: 4
    });
  });

  it('bygger PATCH-body där tomma fält blir null', () => {
    const b = buildBody(
      { ...base, rating: null, comment: '', travel: { ...base.travel, airline: null, loungeChoice: '' } },
      true
    );
    expect(b).toMatchObject({ rating: null, comment: null, airlineIata: null, loungeId: null, travelClass: null });
    expect(b.iata).toBeUndefined();
  });
});

describe('submitCheckin offline', () => {
  beforeEach(async () => {
    for (const i of await outbox.all()) await outbox.remove(i.id);
  });

  it('köar check-in:en när nätet saknas', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    global.fetch = vi.fn();
    const res = await submitCheckin({ ...base, photos: [{ file: new Blob(['y']) }] });
    expect(res.queued).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
    const items = await outbox.all();
    expect(items).toHaveLength(1);
    expect(items[0].body.iata).toBe('GOT');
    expect(items[0].photos).toHaveLength(1);
  });

  it('köar när anropet inte når servern', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const res = await submitCheckin(base);
    expect(res.queued).toBe(true);
    expect(await outbox.all()).toHaveLength(1);
  });

  it('köar inte valideringsfel från servern', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'Ogiltigt datum' }), { status: 400 }));
    await expect(submitCheckin(base)).rejects.toThrow('Ogiltigt datum');
    expect(await outbox.all()).toHaveLength(0);
  });
});
