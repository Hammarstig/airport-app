// Statistik som andra än ägaren får se (SEC-01, SEC-02, SEC-04). Räknas bara på check-ins som en
// tittare får se. `user_public_stats` håller den anonyma vyn (publik profil, publika och publicerade
// check-ins) för topplistor, nivå i UserSummary och användarsök. Raden räknas om vid varje skrivning
// som påverkar användaren och av en sopare när en fördröjd check-in publiceras (valid_until).
import { checkinVisible, reviewVisible } from './visibility.js';
import { levelInfo } from './util.js';

const XP = (s) => 10 * s.checkins + 25 * s.airports + 50 * s.countries + 100 * s.continents
  + 5 * s.commented + 5 * s.rated + 10 * s.reviews + 5 * s.photos;

/** Statistik för `userId` räknad på det `viewerId` (null = utloggad) får se. */
export function visibleStats(db, userId, viewerId = null) {
  const vis = checkinVisible(viewerId);
  const c = db.prepare(`SELECT COUNT(*) AS checkins, COUNT(DISTINCT c.iata) AS airports, COUNT(DISTINCT a.country) AS countries,
      COUNT(DISTINCT a.continent) AS continents, IFNULL(SUM(c.comment IS NOT NULL), 0) AS commented,
      IFNULL(SUM(c.rating IS NOT NULL), 0) AS rated, AVG(c.rating) AS avg_rating
    FROM checkins c JOIN users u ON u.id = c.user_id JOIN airports a ON a.iata = c.iata
    WHERE c.user_id = ? AND ${vis.sql}`).get(userId, ...vis.params);
  const rv = reviewVisible(viewerId);
  const reviews = db.prepare(`SELECT COUNT(*) AS n FROM lounge_reviews r JOIN users u ON u.id = r.user_id
    LEFT JOIN checkins lc ON lc.id = r.checkin_id WHERE r.user_id = ? AND ${rv.sql}`).get(userId, ...rv.params).n;
  const photos = db.prepare(`SELECT COUNT(*) AS n FROM photos p JOIN checkins c ON c.id = p.checkin_id JOIN users u ON u.id = c.user_id
    WHERE p.user_id = ? AND ${vis.sql}`).get(userId, ...vis.params).n;
  const s = { ...c, reviews, photos };
  s.xp = XP(s);
  s.level = levelInfo(s.xp).level;
  return s;
}

/** Räknar om den anonyma vyn för en användare. */
export function refreshPublicStats(db, userId) {
  if (!userId) return;
  const s = visibleStats(db, userId, null);
  const next = db.prepare(`SELECT MIN(publish_at) AS t FROM checkins WHERE user_id = ? AND visibility = 'public' AND publish_at > ?`)
    .get(userId, new Date().toISOString()).t;
  db.prepare(`INSERT INTO user_public_stats (user_id, checkins, airports, countries, continents, reviews, xp, level, valid_until)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET checkins = excluded.checkins, airports = excluded.airports, countries = excluded.countries,
      continents = excluded.continents, reviews = excluded.reviews, xp = excluded.xp, level = excluded.level,
      valid_until = excluded.valid_until`)
    .run(userId, s.checkins, s.airports, s.countries, s.continents, s.reviews, s.xp, s.level, next ?? null);
}

export function refreshAllPublicStats(db) {
  for (const { id } of db.prepare('SELECT id FROM users').all()) refreshPublicStats(db, id);
}

/** Räknar om rader där en fördröjd check-in har publicerats sedan senast. */
export function sweepPublicStats(db) {
  const due = db.prepare('SELECT user_id FROM user_public_stats WHERE valid_until IS NOT NULL AND valid_until <= ?')
    .all(new Date().toISOString());
  for (const { user_id: id } of due) refreshPublicStats(db, id);
  return due.length;
}
