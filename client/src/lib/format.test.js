import { describe, expect, it } from 'vitest';
import { formatRating, hueFor, initials, ratingTone, timeAgo, todayIso } from './format.js';
import { coverageStep } from '../pages/Map/atlas.js';
import { featureAlpha2 } from './iso.js';

describe('format', () => {
  it('betyg, ton och initialer', () => {
    expect(formatRating(4)).toBe('4,0');
    expect(formatRating(null)).toBe('-');
    expect(ratingTone(4.2)).toBe('good');
    expect(ratingTone(3)).toBe('mid');
    expect(ratingTone(1)).toBe('bad');
    expect(initials('Anna Lind')).toBe('AL');
    expect(initials('oliver')).toBe('OL');
    expect(hueFor('anna')).toBe(hueFor('anna'));
  });
  it('datum', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(timeAgo(new Date().toISOString())).toBe('nyss');
  });
  it('kartsteg enligt DESIGN.md (BUG-07)', () => {
    expect(coverageStep(0, 0)).toBe(0);
    expect([1, 16, 17, 33, 34, 50, 51, 66, 67, 83, 84, 100].map((p) => coverageStep(1, p))).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6
    ]);
  });
  it('ISO-numerisk till alfa-2', () => {
    expect(featureAlpha2({ id: '752', properties: { name: 'Sweden' } })).toBe('SE');
    expect(featureAlpha2({ id: undefined, properties: { name: 'Kosovo' } })).toBe('XK');
  });
});
