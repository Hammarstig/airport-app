// Migrering 7 (säkerhetsgranskning): publik statistik (SEC-01/02/04), roll i databasen (SEC-03),
// karenstid för raderade användarnamn (SEC-03), push kopplad till session (SEC-13).
import { ensureColumns } from '../util.js';
import { refreshAllPublicStats } from '../../publicstats.js';

export default function migration7(db) {
  ensureColumns(db, 'users', [['role', "TEXT NOT NULL DEFAULT 'user'"]]);
  ensureColumns(db, 'push_subscriptions', [['session_id', 'TEXT REFERENCES sessions(id) ON DELETE CASCADE']]);
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_public_stats (
      user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      checkins    INTEGER NOT NULL DEFAULT 0,
      airports    INTEGER NOT NULL DEFAULT 0,
      countries   INTEGER NOT NULL DEFAULT 0,
      continents  INTEGER NOT NULL DEFAULT 0,
      reviews     INTEGER NOT NULL DEFAULT 0,
      xp          INTEGER NOT NULL DEFAULT 0,
      level       INTEGER NOT NULL DEFAULT 1,
      valid_until TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ups_airports ON user_public_stats(airports DESC);
    CREATE INDEX IF NOT EXISTS idx_ups_countries ON user_public_stats(countries DESC);
    CREATE INDEX IF NOT EXISTS idx_ups_checkins ON user_public_stats(checkins DESC);
    CREATE INDEX IF NOT EXISTS idx_ups_xp ON user_public_stats(xp DESC);
    CREATE INDEX IF NOT EXISTS idx_ups_valid ON user_public_stats(valid_until) WHERE valid_until IS NOT NULL;

    CREATE TABLE IF NOT EXISTS retired_usernames (
      username   TEXT PRIMARY KEY,
      until      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_push_session ON push_subscriptions(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
  `);
  refreshAllPublicStats(db);
}
