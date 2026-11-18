// Databas: öppning, migreringar och export av hjälpare. Struktur:
//   schema.js        grundschema (v1)
//   migrations/      numrerade migreringar, körs i ordning via PRAGMA user_version
//   stats-sql.js     förberäknad statistik (tabeller, triggers, rebuildStats)
//   seed.js          flygplatser och flygbolag från data/*.json
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA } from './schema.js';
import { transaction } from './util.js';
import { seedAirports, seedAirlines } from './seed.js';
import { MIGRATIONS } from './migrations/index.js';

export { normalize, normalizeWords, countryNameSv } from './text.js';
export { transaction } from './util.js';
export { rebuildStats } from './stats-sql.js';

const here = dirname(fileURLToPath(import.meta.url));
export const AIRPORTS_JSON = resolve(here, '../../data/airports.json');
export const AIRLINES_JSON = resolve(here, '../../data/airlines.json');
export const DEFAULT_DB_PATH = resolve(here, '../../data/gatelog.db');
export const SCHEMA_VERSION = MIGRATIONS.length;

/** Kör migreringar som inte körts (PRAGMA user_version = antal körda). */
function migrate(db, opts) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    const m = MIGRATIONS[v];
    // Ombyggnad av tabeller kräver att främmande nycklar är av (går inte att ändra inne i en transaktion).
    if (m.noForeignKeys) db.exec('PRAGMA foreign_keys = OFF');
    try {
      transaction(db, () => {
        m(db, opts);
        if (m.noForeignKeys) {
          const broken = db.prepare('PRAGMA foreign_key_check').all();
          if (broken.length) throw new Error(`Migrering ${v + 1} bröt främmande nycklar: ${JSON.stringify(broken.slice(0, 3))}`);
        }
        db.exec(`PRAGMA user_version = ${v + 1}`);
      });
    } finally {
      if (m.noForeignKeys) db.exec('PRAGMA foreign_keys = ON');
    }
  }
}

export function openDb(dbPath = DEFAULT_DB_PATH, { airportsJson = AIRPORTS_JSON, airlinesJson = AIRLINES_JSON } = {}) {
  if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  if (dbPath !== ':memory:') db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  seedAirports(db, airportsJson);
  seedAirlines(db, airlinesJson);
  migrate(db, { airportsJson });
  return db;
}
