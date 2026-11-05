import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const AIRPORTS_JSON = resolve(here, '../data/airports.json');
export const AIRLINES_JSON = resolve(here, '../data/airlines.json');
export const DEFAULT_DB_PATH = resolve(here, '../data/gatelog.db');

/** Gemener utan diakritiska tecken, för sökning ("Göteborg" -> "goteborg"). */
export function normalize(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ø/gi, 'o')
    .replace(/æ/gi, 'ae')
    .replace(/ß/g, 'ss')
    .toLowerCase();
}

/** Som normalize men skiljetecken blir mellanslag, för ord-prefixsökning ("Stockholm-Arlanda" -> "stockholm arlanda"). */
export function normalizeWords(s) {
  return normalize(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const svRegion = new Intl.DisplayNames('sv', { type: 'region' });
const enRegion = new Intl.DisplayNames('en', { type: 'region' });
export function countryNameSv(code) {
  if (!code) return null;
  try { return svRegion.of(code) || code; } catch { return code; }
}
function countrySearch(code) {
  if (!code) return '';
  let en = code;
  try { en = enRegion.of(code) || code; } catch { /* okänd kod */ }
  return normalizeWords(`${countryNameSv(code)} ${en}`);
}

const SCHEMA = `
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

// Index på kolumner som kan ha lagts till via migrering (ensureColumns) skapas efter den.
const LATE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_checkins_airline ON checkins(airline_iata);
CREATE INDEX IF NOT EXISTS idx_lounge_reviews_checkin ON lounge_reviews(checkin_id);
CREATE INDEX IF NOT EXISTS idx_checkins_user_iata ON checkins(user_id, iata);
CREATE INDEX IF NOT EXISTS idx_airports_country_region ON airports(country, region);
`;

function ensureColumns(db, table, cols) {
  const have = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  let added = false;
  for (const [name, def] of cols) {
    if (!have.has(name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
      added = true;
    }
  }
  return added;
}

/** Migrering 1: kolumner från v1.2/v1.3 för databaser skapade av äldre kod. */
function migration1(db, { airportsJson }) {
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

/** Migrering 2 (API v2): socialt lager, märkesnivåer och förberäknad statistik. */
function migration2(db) {
  ensureColumns(db, 'checkins', [['edited_at', 'TEXT']]);
  ensureColumns(db, 'lounges', [
    ['review_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['rating_sum', 'REAL NOT NULL DEFAULT 0'],
  ]);
  db.exec(SCHEMA_V2);
  db.exec(statsTriggers());
  rebuildStats(db);
}

/**
 * Migrering 3: FTS-index med flygplatskod som egen kolumn, så att sök med iata-filter avgörs i indexet,
 * och loungerecensioner indexeras via en vy som ger loungens flygplats.
 */
function migration3(db) {
  db.exec(`
    DROP TRIGGER IF EXISTS checkins_ai; DROP TRIGGER IF EXISTS checkins_ad; DROP TRIGGER IF EXISTS checkins_au;
    DROP TRIGGER IF EXISTS lounge_reviews_ai; DROP TRIGGER IF EXISTS lounge_reviews_ad; DROP TRIGGER IF EXISTS lounge_reviews_au;
    DROP TABLE IF EXISTS checkins_fts; DROP TABLE IF EXISTS lounge_reviews_fts;
    CREATE VIEW IF NOT EXISTS lounge_reviews_search AS
      SELECT r.id, r.comment, lo.iata FROM lounge_reviews r JOIN lounges lo ON lo.id = r.lounge_id;
    CREATE VIRTUAL TABLE checkins_fts USING fts5(
      comment, iata, content='checkins', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
    );
    CREATE VIRTUAL TABLE lounge_reviews_fts USING fts5(
      comment, iata, content='lounge_reviews_search', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER checkins_ai AFTER INSERT ON checkins BEGIN
      INSERT INTO checkins_fts(rowid, comment, iata) VALUES (new.id, new.comment, new.iata);
    END;
    CREATE TRIGGER checkins_ad AFTER DELETE ON checkins BEGIN
      INSERT INTO checkins_fts(checkins_fts, rowid, comment, iata) VALUES ('delete', old.id, old.comment, old.iata);
    END;
    CREATE TRIGGER checkins_au AFTER UPDATE OF comment, iata ON checkins BEGIN
      INSERT INTO checkins_fts(checkins_fts, rowid, comment, iata) VALUES ('delete', old.id, old.comment, old.iata);
      INSERT INTO checkins_fts(rowid, comment, iata) VALUES (new.id, new.comment, new.iata);
    END;
    CREATE TRIGGER lounge_reviews_ai AFTER INSERT ON lounge_reviews BEGIN
      INSERT INTO lounge_reviews_fts(rowid, comment, iata) VALUES (new.id, new.comment, (SELECT iata FROM lounges WHERE id = new.lounge_id));
    END;
    CREATE TRIGGER lounge_reviews_ad AFTER DELETE ON lounge_reviews BEGIN
      INSERT INTO lounge_reviews_fts(lounge_reviews_fts, rowid, comment, iata)
        VALUES ('delete', old.id, old.comment, (SELECT iata FROM lounges WHERE id = old.lounge_id));
    END;
    CREATE TRIGGER lounge_reviews_au AFTER UPDATE OF comment ON lounge_reviews BEGIN
      INSERT INTO lounge_reviews_fts(lounge_reviews_fts, rowid, comment, iata)
        SELECT 'delete', old.id, old.comment, (SELECT iata FROM lounges WHERE id = old.lounge_id);
      INSERT INTO lounge_reviews_fts(rowid, comment, iata)
        SELECT new.id, new.comment, (SELECT iata FROM lounges WHERE id = new.lounge_id);
    END;
    INSERT INTO checkins_fts(checkins_fts) VALUES ('rebuild');
    INSERT INTO lounge_reviews_fts(lounge_reviews_fts) VALUES ('rebuild');
  `);
}

const MIGRATIONS = [migration1, migration2, migration3];

const SUB = ['security', 'cleanliness', 'food', 'wifi', 'transfer', 'lounges'];
const CLASSES = ['economy', 'premium_economy', 'business', 'first'];

const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id, created_at);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY,
  checkin_id INTEGER NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  edited_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_comments_checkin ON comments(checkin_id, id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('follow','comment','like','badge','home_visit')),
  actor_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
  checkin_id INTEGER REFERENCES checkins(id) ON DELETE CASCADE,
  comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  iata       TEXT,
  badge_id   TEXT,
  badge_tier INTEGER,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read = 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe
  ON notifications(user_id, type, actor_id, IFNULL(checkin_id, 0)) WHERE type IN ('like', 'follow');

CREATE TABLE IF NOT EXISTS user_badges (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id   TEXT NOT NULL,
  tier_level INTEGER NOT NULL,
  earned_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, badge_id, tier_level)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_user_badges_badge ON user_badges(badge_id, tier_level);

-- Förberäknad statistik, hålls i synk av triggers (se statsTriggers) i samma transaktion som ändringen.
CREATE TABLE IF NOT EXISTS airport_stats (
  iata         TEXT PRIMARY KEY,
  checkins     INTEGER NOT NULL DEFAULT 0,
  visitors     INTEGER NOT NULL DEFAULT 0,
  rating_sum   REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  ${SUB.map((k) => `s_${k}_sum REAL NOT NULL DEFAULT 0, s_${k}_n INTEGER NOT NULL DEFAULT 0`).join(',\n  ')},
  ${CLASSES.map((c) => `cls_${c} INTEGER NOT NULL DEFAULT 0`).join(', ')}
);
CREATE TABLE IF NOT EXISTS user_stats (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  checkins         INTEGER NOT NULL DEFAULT 0,
  airports         INTEGER NOT NULL DEFAULT 0,
  countries        INTEGER NOT NULL DEFAULT 0,
  continents       INTEGER NOT NULL DEFAULT 0,
  rated            INTEGER NOT NULL DEFAULT 0,
  commented        INTEGER NOT NULL DEFAULT 0,
  transfers        INTEGER NOT NULL DEFAULT 0,
  front_cabin      INTEGER NOT NULL DEFAULT 0,
  reviews          INTEGER NOT NULL DEFAULT 0,
  photos           INTEGER NOT NULL DEFAULT 0,
  likes_received   INTEGER NOT NULL DEFAULT 0,
  comments_written INTEGER NOT NULL DEFAULT 0,
  -- XP och nivå enligt docs/API.md (v2, Level)
  xp INTEGER GENERATED ALWAYS AS (10 * checkins + 25 * airports + 50 * countries + 100 * continents
    + 5 * commented + 5 * rated + 10 * reviews + 5 * photos) STORED,
  level INTEGER GENERATED ALWAYS AS (CAST((1 + sqrt(1 + 4.0 * xp / 25)) / 2 AS INTEGER)) STORED
);
CREATE INDEX IF NOT EXISTS idx_user_stats_xp ON user_stats(xp DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_continents ON user_stats(continents DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_reviews ON user_stats(reviews DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_airports ON user_stats(airports DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_countries ON user_stats(countries DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_checkins ON user_stats(checkins DESC);
CREATE TABLE IF NOT EXISTS user_airports (
  user_id    INTEGER NOT NULL,
  iata       TEXT NOT NULL,
  visits     INTEGER NOT NULL,
  last_visit TEXT NOT NULL,
  PRIMARY KEY (user_id, iata)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_user_airports_iata ON user_airports(iata);
CREATE TABLE IF NOT EXISTS user_countries (
  user_id INTEGER NOT NULL, country TEXT NOT NULL, airports INTEGER NOT NULL, PRIMARY KEY (user_id, country)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS user_continents (
  user_id INTEGER NOT NULL, continent TEXT NOT NULL, airports INTEGER NOT NULL, PRIMARY KEY (user_id, continent)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_checkins_period ON checkins(visited_on, user_id, iata);
`;

function statsTriggers() {
  const airportDelta = (r, sign) => [
    `checkins = checkins ${sign} 1`,
    `rating_sum = rating_sum ${sign} IFNULL(${r}.rating, 0)`,
    `rating_count = rating_count ${sign} (${r}.rating IS NOT NULL)`,
    ...SUB.map((k) => `s_${k}_sum = s_${k}_sum ${sign} IFNULL(${r}.r_${k}, 0), s_${k}_n = s_${k}_n ${sign} (${r}.r_${k} IS NOT NULL)`),
    ...CLASSES.map((c) => `cls_${c} = cls_${c} ${sign} (IFNULL(${r}.travel_class, '') = '${c}')`),
  ].join(', ');
  const userDelta = (r, sign) => [
    `checkins = checkins ${sign} 1`,
    `rated = rated ${sign} (${r}.rating IS NOT NULL)`,
    `commented = commented ${sign} (${r}.comment IS NOT NULL)`,
    `transfers = transfers ${sign} (${r}.kind = 'transfer')`,
    `front_cabin = front_cabin ${sign} (IFNULL(${r}.travel_class, '') IN ('business', 'first'))`,
  ].join(', ');
  const lastVisit = (r) => `(SELECT MAX(visited_on) FROM checkins WHERE user_id = ${r}.user_id AND iata = ${r}.iata)`;
  return `
CREATE TRIGGER IF NOT EXISTS stats_users_ai AFTER INSERT ON users BEGIN
  INSERT OR IGNORE INTO user_stats(user_id) VALUES (new.id);
END;
CREATE TRIGGER IF NOT EXISTS stats_checkins_ai AFTER INSERT ON checkins BEGIN
  INSERT OR IGNORE INTO airport_stats(iata) VALUES (new.iata);
  UPDATE airport_stats SET ${airportDelta('new', '+')} WHERE iata = new.iata;
  UPDATE user_stats SET ${userDelta('new', '+')} WHERE user_id = new.user_id;
  INSERT INTO user_airports(user_id, iata, visits, last_visit) VALUES (new.user_id, new.iata, 1, new.visited_on)
    ON CONFLICT(user_id, iata) DO UPDATE SET visits = visits + 1, last_visit = max(last_visit, excluded.last_visit);
END;
CREATE TRIGGER IF NOT EXISTS stats_checkins_bd BEFORE DELETE ON checkins BEGIN
  UPDATE user_stats SET likes_received = likes_received - (SELECT COUNT(*) FROM likes WHERE checkin_id = old.id)
    WHERE user_id = old.user_id;
END;
CREATE TRIGGER IF NOT EXISTS stats_checkins_ad AFTER DELETE ON checkins BEGIN
  UPDATE airport_stats SET ${airportDelta('old', '-')} WHERE iata = old.iata;
  UPDATE user_stats SET ${userDelta('old', '-')} WHERE user_id = old.user_id;
  UPDATE user_airports SET visits = visits - 1, last_visit = IFNULL(${lastVisit('old')}, last_visit)
    WHERE user_id = old.user_id AND iata = old.iata;
  DELETE FROM user_airports WHERE user_id = old.user_id AND iata = old.iata AND visits <= 0;
END;
CREATE TRIGGER IF NOT EXISTS stats_checkins_au AFTER UPDATE ON checkins BEGIN
  UPDATE airport_stats SET ${airportDelta('old', '-')} WHERE iata = old.iata;
  UPDATE airport_stats SET ${airportDelta('new', '+')} WHERE iata = new.iata;
  UPDATE user_stats SET ${userDelta('old', '-')} WHERE user_id = old.user_id;
  UPDATE user_stats SET ${userDelta('new', '+')} WHERE user_id = new.user_id;
  UPDATE user_airports SET last_visit = ${lastVisit('new')} WHERE user_id = new.user_id AND iata = new.iata;
END;
CREATE TRIGGER IF NOT EXISTS stats_ua_ai AFTER INSERT ON user_airports BEGIN
  UPDATE airport_stats SET visitors = visitors + 1 WHERE iata = new.iata;
  UPDATE user_stats SET airports = airports + 1 WHERE user_id = new.user_id;
  INSERT INTO user_countries(user_id, country, airports)
    SELECT new.user_id, country, 1 FROM airports WHERE iata = new.iata AND country IS NOT NULL
    ON CONFLICT(user_id, country) DO UPDATE SET airports = airports + 1;
  INSERT INTO user_continents(user_id, continent, airports)
    SELECT new.user_id, continent, 1 FROM airports WHERE iata = new.iata AND continent IS NOT NULL
    ON CONFLICT(user_id, continent) DO UPDATE SET airports = airports + 1;
END;
CREATE TRIGGER IF NOT EXISTS stats_ua_ad AFTER DELETE ON user_airports BEGIN
  UPDATE airport_stats SET visitors = visitors - 1 WHERE iata = old.iata;
  UPDATE user_stats SET airports = airports - 1 WHERE user_id = old.user_id;
  UPDATE user_countries SET airports = airports - 1
    WHERE user_id = old.user_id AND country = (SELECT country FROM airports WHERE iata = old.iata);
  DELETE FROM user_countries WHERE user_id = old.user_id AND airports <= 0;
  UPDATE user_continents SET airports = airports - 1
    WHERE user_id = old.user_id AND continent = (SELECT continent FROM airports WHERE iata = old.iata);
  DELETE FROM user_continents WHERE user_id = old.user_id AND airports <= 0;
END;
CREATE TRIGGER IF NOT EXISTS stats_uc_ai AFTER INSERT ON user_countries BEGIN
  UPDATE user_stats SET countries = countries + 1 WHERE user_id = new.user_id;
END;
CREATE TRIGGER IF NOT EXISTS stats_uc_ad AFTER DELETE ON user_countries BEGIN
  UPDATE user_stats SET countries = countries - 1 WHERE user_id = old.user_id;
END;
CREATE TRIGGER IF NOT EXISTS stats_uk_ai AFTER INSERT ON user_continents BEGIN
  UPDATE user_stats SET continents = continents + 1 WHERE user_id = new.user_id;
END;
CREATE TRIGGER IF NOT EXISTS stats_uk_ad AFTER DELETE ON user_continents BEGIN
  UPDATE user_stats SET continents = continents - 1 WHERE user_id = old.user_id;
END;
CREATE TRIGGER IF NOT EXISTS stats_likes_ai AFTER INSERT ON likes BEGIN
  UPDATE user_stats SET likes_received = likes_received + 1
    WHERE user_id = (SELECT user_id FROM checkins WHERE id = new.checkin_id);
END;
CREATE TRIGGER IF NOT EXISTS stats_likes_ad AFTER DELETE ON likes BEGIN
  UPDATE user_stats SET likes_received = likes_received - 1
    WHERE user_id = (SELECT user_id FROM checkins WHERE id = old.checkin_id);
END;
CREATE TRIGGER IF NOT EXISTS stats_comments_ai AFTER INSERT ON comments BEGIN
  UPDATE user_stats SET comments_written = comments_written + 1 WHERE user_id = new.user_id;
END;
CREATE TRIGGER IF NOT EXISTS stats_comments_ad AFTER DELETE ON comments BEGIN
  UPDATE user_stats SET comments_written = comments_written - 1 WHERE user_id = old.user_id;
END;
CREATE TRIGGER IF NOT EXISTS stats_photos_ai AFTER INSERT ON photos BEGIN
  UPDATE user_stats SET photos = photos + 1 WHERE user_id = new.user_id;
END;
CREATE TRIGGER IF NOT EXISTS stats_photos_ad AFTER DELETE ON photos BEGIN
  UPDATE user_stats SET photos = photos - 1 WHERE user_id = old.user_id;
END;
CREATE TRIGGER IF NOT EXISTS stats_reviews_ai AFTER INSERT ON lounge_reviews BEGIN
  UPDATE user_stats SET reviews = reviews + 1 WHERE user_id = new.user_id;
  UPDATE lounges SET review_count = review_count + 1, rating_sum = rating_sum + new.rating WHERE id = new.lounge_id;
END;
CREATE TRIGGER IF NOT EXISTS stats_reviews_ad AFTER DELETE ON lounge_reviews BEGIN
  UPDATE user_stats SET reviews = reviews - 1 WHERE user_id = old.user_id;
  UPDATE lounges SET review_count = review_count - 1, rating_sum = rating_sum - old.rating WHERE id = old.lounge_id;
END;
CREATE TRIGGER IF NOT EXISTS stats_reviews_au AFTER UPDATE OF rating ON lounge_reviews BEGIN
  UPDATE lounges SET rating_sum = rating_sum - old.rating + new.rating WHERE id = new.lounge_id;
END;
`;
}

/** Räknar om all förberäknad statistik från grunddata (migrering, reparation, tester). */
export function rebuildStats(db) {
  const userAgg = [
    'COUNT(*)', 'SUM(rating IS NOT NULL)', 'SUM(comment IS NOT NULL)', "SUM(kind = 'transfer')",
    "SUM(IFNULL(travel_class, '') IN ('business', 'first'))",
  ];
  db.exec(`
    DELETE FROM user_continents; DELETE FROM user_countries; DELETE FROM user_airports;
    DELETE FROM user_stats; DELETE FROM airport_stats;
    INSERT INTO user_stats(user_id) SELECT id FROM users;
    UPDATE user_stats SET (checkins, rated, commented, transfers, front_cabin) =
      (SELECT ${userAgg.map((x) => `IFNULL(${x}, 0)`).join(', ')} FROM checkins c WHERE c.user_id = user_stats.user_id);
    UPDATE user_stats SET
      reviews = (SELECT COUNT(*) FROM lounge_reviews r WHERE r.user_id = user_stats.user_id),
      photos = (SELECT COUNT(*) FROM photos p WHERE p.user_id = user_stats.user_id),
      comments_written = (SELECT COUNT(*) FROM comments m WHERE m.user_id = user_stats.user_id),
      likes_received = (SELECT COUNT(*) FROM likes l JOIN checkins c ON c.id = l.checkin_id WHERE c.user_id = user_stats.user_id);
    INSERT INTO airport_stats (iata, checkins, rating_sum, rating_count,
      ${SUB.map((k) => `s_${k}_sum, s_${k}_n`).join(', ')}, ${CLASSES.map((c) => `cls_${c}`).join(', ')})
    SELECT iata, COUNT(*), IFNULL(SUM(rating), 0), COUNT(rating),
      ${SUB.map((k) => `IFNULL(SUM(r_${k}), 0), COUNT(r_${k})`).join(', ')},
      ${CLASSES.map((c) => `SUM(IFNULL(travel_class, '') = '${c}')`).join(', ')}
    FROM checkins GROUP BY iata;
    -- Triggers på user_airports fyller visitors, airports, länder och kontinenter.
    INSERT INTO user_airports(user_id, iata, visits, last_visit)
      SELECT user_id, iata, COUNT(*), MAX(visited_on) FROM checkins GROUP BY user_id, iata;
    UPDATE lounges SET
      review_count = (SELECT COUNT(*) FROM lounge_reviews r WHERE r.lounge_id = lounges.id),
      rating_sum = IFNULL((SELECT SUM(rating) FROM lounge_reviews r WHERE r.lounge_id = lounges.id), 0);
  `);
}

/** Kör migreringar som inte körts (PRAGMA user_version = antal körda). */
function migrate(db, opts) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      MIGRATIONS[v](db, opts);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

export const SCHEMA_VERSION = MIGRATIONS.length;

function seedAirlines(db, jsonPath) {
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

const TYPE_RANK = { large: 0, medium: 1, small: 2 };

export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function seedAirports(db, jsonPath) {
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

export function openDb(dbPath = process.env.DB_PATH || DEFAULT_DB_PATH, { airportsJson = AIRPORTS_JSON, airlinesJson = AIRLINES_JSON } = {}) {
  if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  if (dbPath !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  seedAirports(db, airportsJson);
  seedAirlines(db, airlinesJson);
  migrate(db, { airportsJson });
  return db;
}
