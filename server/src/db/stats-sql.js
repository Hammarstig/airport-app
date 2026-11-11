// Förberäknad statistik: tabeller, triggers och omräkning.
export const SUB = ['security', 'cleanliness', 'food', 'wifi', 'transfer', 'lounges'];
export const CLASSES = ['economy', 'premium_economy', 'business', 'first'];

export const SCHEMA_V2 = `
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

export function statsTriggers() {
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
