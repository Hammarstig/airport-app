// Läsning av förberäknad statistik (airport_stats, user_stats) och globala snitt för Bayesiansk rankning.
import { SUB_RATINGS } from './util.js';

export const AIRPORT_PRIOR = 5;
export const LOUNGE_PRIOR = 3;
const TTL_MS = 10_000;

/** Kolumner i airport_stats för en kategori ('overall' eller ett delbetyg). */
export function categoryCols(category) {
  if (SUB_RATINGS.includes(category)) return { sum: `s_${category}_sum`, n: `s_${category}_n` };
  return { sum: 'rating_sum', n: 'rating_count' };
}

/**
 * Globala snitt per kategori, cachade en kort stund (räknas över högst ~9 000 rader).
 * Cachen hålls per databas så att tester med flera appar inte påverkar varandra.
 */
const cache = new WeakMap();
export function globalMeans(db) {
  const hit = cache.get(db);
  if (hit && hit.at > Date.now() - TTL_MS) return hit.value;
  const cols = ['overall', ...SUB_RATINGS].map((k) => {
    const c = categoryCols(k);
    return `SUM(${c.sum}) * 1.0 / NULLIF(SUM(${c.n}), 0) AS "${k}"`;
  });
  const row = db.prepare(`SELECT ${cols.join(', ')},
    (SELECT SUM(rating_sum) * 1.0 / NULLIF(SUM(review_count), 0) FROM lounges) AS lounge
    FROM airport_stats`).get();
  const value = { ...row };
  cache.set(db, { at: Date.now(), value });
  return value;
}

/** SQL-uttryck för Bayesianskt snitt givet kolumnnamn och globalt snitt (parametriseras inte, siffror från oss). */
export function bayesSql(sumCol, nCol, mean, C) {
  const m = Number.isFinite(mean) ? mean : 0;
  return `CASE WHEN ${nCol} > 0 THEN (${C} * ${m} + ${sumCol}) / (${C} + ${nCol}) END`;
}
