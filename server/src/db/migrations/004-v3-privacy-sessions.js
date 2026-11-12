// Migrering 4 (API v3): integritet, följförfrågningar, sessioner, blockering, rapporter, Web Push
// och grupperade notiser.
import { ensureColumns } from '../util.js';

export default function migration4(db) {
  ensureColumns(db, 'users', [
    ['is_private', 'INTEGER NOT NULL DEFAULT 0'],
    ['default_visibility', "TEXT NOT NULL DEFAULT 'public'"],
    ['publish_delay_hours', 'INTEGER NOT NULL DEFAULT 0'],
    ['hide_home', 'INTEGER NOT NULL DEFAULT 0'],
    ['notify_home_visits', 'INTEGER NOT NULL DEFAULT 1'],
    ['push_prefs', "TEXT NOT NULL DEFAULT '{}'"],
  ]);
  if (ensureColumns(db, 'checkins', [
    ['visibility', "TEXT NOT NULL DEFAULT 'public'"],
    ['publish_at', 'TEXT'],
  ])) {
    db.exec('UPDATE checkins SET publish_at = created_at WHERE publish_at IS NULL');
  }
  ensureColumns(db, 'follows', [['status', "TEXT NOT NULL DEFAULT 'accepted'"]]);

  // notifications byggs om: CHECK på typ utökas och kolumner för gruppering och data tillkommer.
  db.exec(`
    CREATE TABLE notifications_v3 (
      id         INTEGER PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT NOT NULL CHECK (type IN ('follow','follow_request','follow_accepted','comment','like','badge','home_visit','overtaken')),
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
    INSERT INTO notifications_v3 (id, user_id, type, actor_id, checkin_id, comment_id, iata, badge_id, badge_tier, read, created_at)
      SELECT id, user_id, type, actor_id, checkin_id, comment_id, iata, badge_id, badge_tier, read, created_at FROM notifications;
    DROP TABLE notifications;
    ALTER TABLE notifications_v3 RENAME TO notifications;
    CREATE INDEX idx_notifications_user ON notifications(user_id, id DESC);
    CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read = 0;
    CREATE UNIQUE INDEX idx_notifications_dedupe
      ON notifications(user_id, type, actor_id, IFNULL(checkin_id, 0), IFNULL(group_key, ''))
      WHERE type IN ('like', 'follow', 'follow_request', 'overtaken');

    CREATE INDEX IF NOT EXISTS idx_follows_status ON follows(followee_id, status);
    CREATE INDEX IF NOT EXISTS idx_checkins_visibility ON checkins(user_id, visibility, publish_at);

    CREATE TABLE IF NOT EXISTS sessions (
      id           TEXT PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      refresh_hash TEXT NOT NULL,
      prev_hash    TEXT,
      rotated_at   TEXT,
      client       TEXT,
      created_at   TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      expires_at   TEXT NOT NULL,
      revoked_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS blocks (
      blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (blocker_id, blocked_id),
      CHECK (blocker_id <> blocked_id)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id, blocker_id);

    CREATE TABLE IF NOT EXISTS reports (
      id          INTEGER PRIMARY KEY,
      reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        TEXT NOT NULL CHECK (type IN ('user', 'comment', 'checkin')),
      target_id   INTEGER NOT NULL,
      reason      TEXT NOT NULL CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'privacy', 'other')),
      note        TEXT,
      status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
      created_at  TEXT NOT NULL,
      resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, id);
    CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(type, target_id);

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id         INTEGER PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint   TEXT NOT NULL UNIQUE,
      p256dh     TEXT NOT NULL,
      auth       TEXT NOT NULL,
      failures   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
  `);
}
