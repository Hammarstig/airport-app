// Seed av statisk referensdata (flygplatser, flygbolag) vid första start.
import { readFileSync } from 'node:fs';
import { transaction } from './util.js';
import { normalizeWords, countrySearch } from './text.js';

const TYPE_RANK = { large: 0, medium: 1, small: 2 };

export function seedAirports(db, jsonPath) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM airports').get();
  if (n > 0) return 0;
  const list = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const insert = db.prepare(`INSERT OR IGNORE INTO airports
    (iata, icao, name, city, country, continent, lat, lon, type, type_rank, scheduled, search_name, search_city, search_country, region, region_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  transaction(db, () => {
    for (const a of list) {
      if (!/^[A-Z]{3}$/.test(a.iata ?? '')) continue;
      insert.run(
        a.iata, a.icao || null, a.name, a.city || null, a.country || null, a.continent || null,
        a.lat ?? null, a.lon ?? null, a.type, TYPE_RANK[a.type] ?? 3, a.scheduled ? 1 : 0,
        normalizeWords(a.name), normalizeWords(a.city), countrySearch(a.country),
        a.region || null, a.regionName || null
      );
    }
  });
  return list.length;
}

export function seedAirlines(db, jsonPath) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM airlines').get();
  if (n > 0) return;
  const list = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const insert = db.prepare('INSERT OR IGNORE INTO airlines (iata, icao, name, country, search_name) VALUES (?, ?, ?, ?, ?)');
  transaction(db, () => {
    for (const a of list) {
      if (!/^[A-Z0-9]{2}$/.test(a.iata ?? '')) continue;
      insert.run(a.iata, a.icao || null, a.name, a.country || null, normalizeWords(a.name));
    }
  });
}
