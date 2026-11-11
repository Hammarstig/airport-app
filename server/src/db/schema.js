// Grundschema (v1). Allt som tillkommit därefter ligger i db/migrations/.
export const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  home_iata     TEXT REFERENCES airports(iata),
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS airports (
  iata        TEXT PRIMARY KEY,
  icao        TEXT,
  name        TEXT NOT NULL,
  city        TEXT,
  country     TEXT,
  continent   TEXT,
  lat         REAL,
  lon         REAL,
  type        TEXT NOT NULL,
  type_rank   INTEGER NOT NULL,
  scheduled   INTEGER NOT NULL DEFAULT 0,
  search_name TEXT NOT NULL,
  search_city TEXT NOT NULL,
  search_country TEXT NOT NULL DEFAULT '',
  region      TEXT,
  region_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_airports_icao ON airports(icao);
CREATE INDEX IF NOT EXISTS idx_airports_country ON airports(country);

CREATE TABLE IF NOT EXISTS checkins (
  id                INTEGER PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  iata              TEXT NOT NULL REFERENCES airports(iata),
  visited_on        TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('departure','arrival','transfer','layover')),
  rating            REAL CHECK (rating IS NULL OR (rating >= 0.5 AND rating <= 5)),
  r_security        INTEGER CHECK (r_security    IS NULL OR r_security    BETWEEN 1 AND 5),
  r_cleanliness     INTEGER CHECK (r_cleanliness IS NULL OR r_cleanliness BETWEEN 1 AND 5),
  r_food            INTEGER CHECK (r_food        IS NULL OR r_food        BETWEEN 1 AND 5),
  r_wifi            INTEGER CHECK (r_wifi        IS NULL OR r_wifi        BETWEEN 1 AND 5),
  r_transfer        INTEGER CHECK (r_transfer    IS NULL OR r_transfer    BETWEEN 1 AND 5),
  r_lounges         INTEGER CHECK (r_lounges     IS NULL OR r_lounges     BETWEEN 1 AND 5),
  comment           TEXT,
  created_at        TEXT NOT NULL,
  airline_iata      TEXT REFERENCES airlines(iata),
  travel_class      TEXT CHECK (travel_class IS NULL OR travel_class IN ('economy','premium_economy','business','first')),
  lounge_id         INTEGER REFERENCES lounges(id) ON DELETE SET NULL,
  flight_number     TEXT
);
CREATE INDEX IF NOT EXISTS idx_checkins_iata ON checkins(iata, visited_on DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins(user_id, visited_on DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_created ON checkins(created_at DESC);

CREATE TABLE IF NOT EXISTS likes (
  checkin_id INTEGER NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (checkin_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_likes_user ON likes(user_id);

CREATE TABLE IF NOT EXISTS lounges (
  id         INTEGER PRIMARY KEY,
  iata       TEXT NOT NULL REFERENCES airports(iata),
  name       TEXT NOT NULL,
  terminal   TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lounges_unique ON lounges(iata, lower(name));

CREATE TABLE IF NOT EXISTS lounge_reviews (
  id         INTEGER PRIMARY KEY,
  lounge_id  INTEGER NOT NULL REFERENCES lounges(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating     REAL NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment    TEXT,
  visited_on TEXT NOT NULL,
  created_at TEXT NOT NULL,
  checkin_id INTEGER REFERENCES checkins(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lounge_reviews_lounge ON lounge_reviews(lounge_id, created_at DESC);

CREATE TABLE IF NOT EXISTS airlines (
  iata        TEXT PRIMARY KEY,
  icao        TEXT,
  name        TEXT NOT NULL,
  country     TEXT,
  search_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
  id         INTEGER PRIMARY KEY,
  checkin_id INTEGER NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL UNIQUE,
  width      INTEGER,
  height     INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_checkin ON photos(checkin_id);

CREATE TABLE IF NOT EXISTS wishlist (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  iata     TEXT NOT NULL REFERENCES airports(iata),
  added_at TEXT NOT NULL,
  PRIMARY KEY (user_id, iata)
);

-- Fulltextsök: external content-tabeller som hålls i synk med triggers.
CREATE VIRTUAL TABLE IF NOT EXISTS checkins_fts USING fts5(
  comment, content='checkins', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS checkins_ai AFTER INSERT ON checkins WHEN new.comment IS NOT NULL BEGIN
  INSERT INTO checkins_fts(rowid, comment) VALUES (new.id, new.comment);
END;
CREATE TRIGGER IF NOT EXISTS checkins_ad AFTER DELETE ON checkins WHEN old.comment IS NOT NULL BEGIN
  INSERT INTO checkins_fts(checkins_fts, rowid, comment) VALUES ('delete', old.id, old.comment);
END;
CREATE TRIGGER IF NOT EXISTS checkins_au AFTER UPDATE OF comment ON checkins BEGIN
  INSERT INTO checkins_fts(checkins_fts, rowid, comment) SELECT 'delete', old.id, old.comment WHERE old.comment IS NOT NULL;
  INSERT INTO checkins_fts(rowid, comment) SELECT new.id, new.comment WHERE new.comment IS NOT NULL;
END;

CREATE VIRTUAL TABLE IF NOT EXISTS lounge_reviews_fts USING fts5(
  comment, content='lounge_reviews', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS lounge_reviews_ai AFTER INSERT ON lounge_reviews WHEN new.comment IS NOT NULL BEGIN
  INSERT INTO lounge_reviews_fts(rowid, comment) VALUES (new.id, new.comment);
END;
CREATE TRIGGER IF NOT EXISTS lounge_reviews_ad AFTER DELETE ON lounge_reviews WHEN old.comment IS NOT NULL BEGIN
  INSERT INTO lounge_reviews_fts(lounge_reviews_fts, rowid, comment) VALUES ('delete', old.id, old.comment);
END;
CREATE TRIGGER IF NOT EXISTS lounge_reviews_au AFTER UPDATE OF comment ON lounge_reviews BEGIN
  INSERT INTO lounge_reviews_fts(lounge_reviews_fts, rowid, comment) SELECT 'delete', old.id, old.comment WHERE old.comment IS NOT NULL;
  INSERT INTO lounge_reviews_fts(rowid, comment) SELECT new.id, new.comment WHERE new.comment IS NOT NULL;
END;
`;
