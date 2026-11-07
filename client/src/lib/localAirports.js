import { countryName } from './format.js';
import { load, save } from './storage.js';

/**
 * Flygplatsdata som fungerar utan nät: flygplatser och "senaste" som appen har sett sparas lokalt,
 * och en kompakt lista över alla flygplatser med reguljärtrafik laddas vid behov (egen chunk som
 * service workern förcachar). Används som reserv när API:t inte svarar.
 */
const SEEN_KEY = 'gatelog.airports';
const RECENT_KEY = 'gatelog.recent';
const MAX_SEEN = 300;
const TYPE = { L: 'large', M: 'medium', S: 'small' };

const slim = (a) => ({
  iata: a.iata,
  icao: a.icao ?? null,
  name: a.name,
  city: a.city ?? '',
  country: a.country,
  continent: a.continent,
  type: a.type,
  lat: a.lat,
  lon: a.lon
});

export function rememberAirports(list) {
  const items = (list || []).filter((a) => a && /^[A-Z]{3}$/.test(a.iata || ''));
  if (!items.length) return;
  const seen = load(SEEN_KEY, {});
  for (const a of items) seen[a.iata] = slim(a);
  const keys = Object.keys(seen);
  if (keys.length > MAX_SEEN) keys.slice(0, keys.length - MAX_SEEN).forEach((k) => delete seen[k]);
  save(SEEN_KEY, seen);
}

export function rememberRecent(rows) {
  if (!Array.isArray(rows)) return;
  save(
    RECENT_KEY,
    rows.map((r) => ({ ...r, airport: slim(r.airport) }))
  );
  rememberAirports(rows.map((r) => r.airport));
}

export const loadRecent = () => load(RECENT_KEY, null);

let listPromise = null;
function offlineList() {
  listPromise ||= import('../data/airports-offline.json').then((m) =>
    m.default.map(([iata, name, city, country, continent, t]) => ({
      iata,
      name,
      city,
      country,
      continent,
      type: TYPE[t],
      countryName: countryName(country)
    }))
  );
  return listPromise;
}

/** En flygplats utan nät: först sparad, sedan ur den kompakta listan. */
export async function localAirport(iata) {
  const seen = load(SEEN_KEY, {})[iata];
  if (seen) return seen;
  return (await offlineList()).find((a) => a.iata === iata) || null;
}

const norm = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss');

const RANK = { large: 0, medium: 1, small: 2 };

/** Enkel sökning utan nät: IATA exakt, stad, flygplatsnamn och land (ord-prefix). */
export async function searchLocal(q, limit = 8) {
  const term = norm(q.trim());
  if (term.length < 2) return [];
  const words = (s) => norm(s).split(/[\s\-/(),.]+/);
  const hits = [];
  for (const a of await offlineList()) {
    let level = null;
    if (term.length === 3 && a.iata.toLowerCase() === term) level = [0, 'iata'];
    else if (norm(a.city).startsWith(term) || words(a.city).some((w) => w.startsWith(term))) level = [1, 'city'];
    else if (words(a.name).some((w) => w.startsWith(term))) level = [2, 'name'];
    else if (norm(a.countryName).startsWith(term) || a.country.toLowerCase() === term) level = [3, 'country'];
    if (level) hits.push({ ...a, matchedOn: level[1], _l: level[0] });
  }
  hits.sort((x, y) => x._l - y._l || RANK[x.type] - RANK[y.type] || x.name.localeCompare(y.name, 'sv'));
  return hits.slice(0, limit).map(({ _l, ...a }) => a);
}

/** Rensa personliga data (senaste flygplatser) vid utloggning. */
export function forgetRecent() {
  save(RECENT_KEY, null);
}
