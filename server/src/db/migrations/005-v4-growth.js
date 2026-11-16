// Migrering 5 (API v4): inbjudningar, stammisar, månadsutmaningar, import av historik och
// revisionslogg för moderering. Notistyper valideras i koden (notify.js) i stället för med CHECK,
// så att nya typer inte kräver att tabellen byggs om.
import { ensureColumns } from '../util.js';

export default function migration5(db) {
  ensureColumns(db, 'users', [['invited_by', 'INTEGER REFERENCES users(id) ON DELETE SET NULL']]);
  ensureColumns(db, 'checkins', [
    ['source', "TEXT NOT NULL DEFAULT 'app'"],
    ['import_batch', 'TEXT'],
  ]);
  db.exec(`
    CREATE TABLE notifications_v4 (
      id         INTEGER PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT NOT NULL,
      actor_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
      checkin_id INTEGER REFERENCES checkins(id) ON DELETE CASCADE,
      comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
      iata       TEXT,
      badge_id   TEXT,
      badge_tier INTEGER,
      group_key  TEXT,
      data       TEXT,
      read       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    INSERT INTO notifications_v4 SELECT id, user_id, type, actor_id, checkin_id, comment_id, iata, badge_id, badge_tier,
      group_key, data, read, created_at FROM notifications;
    DROP TABLE notifications;
    ALTER TABLE notifications_v4 RENAME TO notifications;
    CREATE INDEX idx_notifications_user ON notifications(user_id, id DESC);
    CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read = 0;
    CREATE UNIQUE INDEX idx_notifications_dedupe
      ON notifications(user_id, type, actor_id, IFNULL(checkin_id, 0), IFNULL(group_key, ''))
      WHERE type IN ('like', 'follow', 'follow_request', 'overtaken', 'invite_accepted', 'challenge_completed');

    CREATE INDEX IF NOT EXISTS idx_checkins_import ON checkins(import_batch) WHERE import_batch IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_checkins_iata_visited ON checkins(iata, visited_on, user_id);

    CREATE TABLE IF NOT EXISTS invites (
      code       TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      uses       INTEGER NOT NULL DEFAULT 0,
      max_uses   INTEGER NOT NULL DEFAULT 25,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_invites_user ON invites(user_id);

    CREATE TABLE IF NOT EXISTS airport_mayors (
      iata     TEXT PRIMARY KEY REFERENCES airports(iata),
      user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      checkins INTEGER NOT NULL,
      since    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_airport_mayors_user ON airport_mayors(user_id);

    CREATE TABLE IF NOT EXISTS user_challenges (
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      challenge_id TEXT NOT NULL,
      month        TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      PRIMARY KEY (user_id, challenge_id, month)
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS import_batches (
      id         TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      format     TEXT NOT NULL,
      rows       INTEGER NOT NULL,
      imported   INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_import_batches_user ON import_batches(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS moderation_log (
      id           INTEGER PRIMARY KEY,
      moderator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      report_id    INTEGER REFERENCES reports(id) ON DELETE SET NULL,
      action       TEXT NOT NULL,
      target_type  TEXT NOT NULL,
      target_id    INTEGER NOT NULL,
      detail       TEXT,
      created_at   TEXT NOT NULL
    );
  `);
}
