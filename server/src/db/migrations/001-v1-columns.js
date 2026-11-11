import { readFileSync } from 'node:fs';
import { ensureColumns } from '../util.js';
import { normalizeWords, countrySearch } from '../text.js';

// Index på kolumner som kan ha lagts till via migrering (ensureColumns) skapas efter den.
const LATE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_checkins_airline ON checkins(airline_iata);
CREATE INDEX IF NOT EXISTS idx_lounge_reviews_checkin ON lounge_reviews(checkin_id);
CREATE INDEX IF NOT EXISTS idx_checkins_user_iata ON checkins(user_id, iata);
CREATE INDEX IF NOT EXISTS idx_airports_country_region ON airports(country, region);
`;

/** Migrering 1: kolumner från v1.2/v1.3 för databaser skapade av äldre kod. */
export default function migration1(db, { airportsJson }) {
  ensureColumns(db, 'checkins', [
    ['airline_iata', 'TEXT REFERENCES airlines(iata)'],
    ['travel_class', 'TEXT'],
    ['lounge_id', 'INTEGER REFERENCES lounges(id) ON DELETE SET NULL'],
    ['flight_number', 'TEXT'],
  ]);
  ensureColumns(db, 'lounge_reviews', [['checkin_id', 'INTEGER REFERENCES checkins(id) ON DELETE CASCADE']]);
  if (ensureColumns(db, 'airports', [['search_country', "TEXT NOT NULL DEFAULT ''"]])) {
    const rows = db.prepare('SELECT iata, name, city, country FROM airports').all();
    const upd = db.prepare('UPDATE airports SET search_name = ?, search_city = ?, search_country = ? WHERE iata = ?');
    for (const r of rows) upd.run(normalizeWords(r.name), normalizeWords(r.city), countrySearch(r.country), r.iata);
  }
  if (ensureColumns(db, 'airports', [['region', 'TEXT'], ['region_name', 'TEXT']])) {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM airports').get();
    if (n > 0) {
      const upd = db.prepare('UPDATE airports SET region = ?, region_name = ? WHERE iata = ?');
      for (const a of JSON.parse(readFileSync(airportsJson, 'utf8'))) upd.run(a.region || null, a.regionName || null, a.iata);
    }
  }
  db.exec(LATE_INDEXES);
}
