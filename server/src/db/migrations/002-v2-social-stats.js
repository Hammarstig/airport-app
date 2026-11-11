import { ensureColumns } from '../util.js';
import { SCHEMA_V2, statsTriggers, rebuildStats } from '../stats-sql.js';

/** Migrering 2 (API v2): socialt lager, märkesnivåer och förberäknad statistik. */
export default function migration2(db) {
  ensureColumns(db, 'checkins', [['edited_at', 'TEXT']]);
  ensureColumns(db, 'lounges', [
    ['review_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['rating_sum', 'REAL NOT NULL DEFAULT 0'],
  ]);
  db.exec(SCHEMA_V2);
  db.exec(statsTriggers());
  rebuildStats(db);
}
