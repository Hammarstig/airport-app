import { describe, expect, it } from 'vitest';
import {
  forgetRecent,
  loadRecent,
  localAirport,
  rememberAirports,
  rememberRecent,
  searchLocal
} from './localAirports.js';

describe('lokala flygplatser', () => {
  it('söker i offlinelistan på IATA, stad, namn och land utan diakritik', async () => {
    expect((await searchLocal('got'))[0].iata).toBe('GOT');
    expect((await searchLocal('goteborg')).map((a) => a.iata)).toContain('GOT');
    expect((await searchLocal('heathrow'))[0].iata).toBe('LHR');
    const se = await searchLocal('sverige', 20);
    expect(se.every((a) => a.country === 'SE')).toBe(true);
    expect(se[0].matchedOn).toBe('country');
    expect(await searchLocal('x')).toEqual([]);
  });

  it('sparade flygplatser går före listan och senaste kan rensas', async () => {
    rememberAirports([
      { iata: 'GOT', name: 'Sparad GOT', city: 'Göteborg', country: 'SE', continent: 'EU', type: 'large' }
    ]);
    expect((await localAirport('GOT')).name).toBe('Sparad GOT');
    expect((await localAirport('CPH')).iata).toBe('CPH');
    rememberRecent([{ airport: { iata: 'ARN', name: 'Arlanda', country: 'SE' }, visits: 2, isHome: false }]);
    expect(loadRecent()[0].airport.iata).toBe('ARN');
    forgetRecent();
    expect(loadRecent()).toBeNull();
  });
});
