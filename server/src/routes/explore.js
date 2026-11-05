// v1.1: länder, lounger (sök + topplista), användarsök, önskelista och märken.
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { computeBadges } from '../badges.js';
import { h, bad, notFound, paging, round2, normIata, AIRPORT_COLS, airportFrom, USER_COLS, userFrom } from '../util.js';
import { LOUNGE_SELECT, loungeFrom, code2 } from './airports.js';
import { normalizeWords, countryNameSv } from '../db.js';

const countryName = countryNameSv;
const collator = new Intl.Collator('sv');
const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);

export default function exploreRoutes({ db }) {
  const r = Router();

  // Ett lands kontinent = den vanligaste kontinenten bland dess flygplatser (t.ex. RU, TR).
  // Flygplatsdata är statisk efter seed, så vi räknar fram tabellen en gång.
  let countryMeta = null;
  function meta() {
    if (countryMeta) return countryMeta;
    countryMeta = new Map();
    const rows = db.prepare(`SELECT country, continent, COUNT(*) AS n FROM airports
      WHERE country IS NOT NULL GROUP BY country, continent ORDER BY n DESC`).all();
    for (const row of rows) {
      const m = countryMeta.get(row.country);
      if (!m) countryMeta.set(row.country, { continent: row.continent, airports: row.n });
      else m.airports += row.n;
    }
    return countryMeta;
  }

  // ---- Länder ----
  r.get('/countries', h((req, res) => {
    const continent = code2(req.query.continent);
    const stats = new Map(db.prepare(`
      SELECT a.country, COUNT(*) AS checkins, AVG(c.rating) AS avg_rating
      FROM checkins c JOIN airports a ON a.iata = c.iata GROUP BY a.country`).all().map((x) => [x.country, x]));
    let list = [...meta()].map(([code, m]) => ({
      code,
      name: countryName(code),
      continent: m.continent,
      airports: m.airports,
      checkins: stats.get(code)?.checkins ?? 0,
      avgRating: round2(stats.get(code)?.avg_rating ?? null),
    }));
    if (continent) list = list.filter((c) => c.continent === continent);
    if (req.query.sort === 'checkins') list.sort((a, b) => b.checkins - a.checkins || collator.compare(a.name, b.name));
    else if (req.query.sort === 'rating') list.sort((a, b) => (b.avgRating ?? -1) - (a.avgRating ?? -1) || collator.compare(a.name, b.name));
    else list.sort((a, b) => collator.compare(a.name, b.name));
    res.json(list);
  }));

  r.get('/countries/:code', h((req, res) => {
    const code = code2(req.params.code);
    const m = code ? meta().get(code) : null;
    if (!m) throw notFound('Landet finns inte');
    const s = db.prepare(`
      SELECT COUNT(*) AS checkins, COUNT(DISTINCT c.user_id) AS visitors, AVG(c.rating) AS avg_rating
      FROM checkins c JOIN airports a ON a.iata = c.iata WHERE a.country = ?`).get(code);
    const top = db.prepare(`
      SELECT ${AIRPORT_COLS('a', '')}, s.avg_rating, IFNULL(s.rating_count, 0) AS rating_count, IFNULL(s.checkins, 0) AS checkins
      FROM airports a
      LEFT JOIN (SELECT iata, COUNT(*) AS checkins, AVG(rating) AS avg_rating, COUNT(rating) AS rating_count
                 FROM checkins GROUP BY iata) s ON s.iata = a.iata
      WHERE a.country = ?
      ORDER BY s.avg_rating IS NULL, s.avg_rating DESC, IFNULL(s.checkins, 0) DESC, a.type_rank, a.scheduled DESC, a.name
      LIMIT 10`).all(code);
    res.json({
      code,
      name: countryName(code),
      continent: m.continent,
      airports: m.airports,
      checkins: s.checkins,
      visitors: s.visitors,
      avgRating: round2(s.avg_rating),
      topAirports: top.map((row) => ({
        airport: airportFrom(row),
        avgRating: round2(row.avg_rating),
        ratingCount: row.rating_count,
        checkins: row.checkins,
      })),
    });
  }));

  // ---- Lounger ----
  const LOUNGE_WITH_AIRPORT = `
    SELECT * FROM (${LOUNGE_SELECT}) lo2 JOIN (SELECT ${AIRPORT_COLS('a', 'a_')} FROM airports a) ap ON ap.a_iata = lo2.iata`;

  r.get('/lounges', h((req, res) => {
    const { limit, offset } = paging(req.query);
    const where = [];
    const params = [];
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    if (q) {
      const like = '%' + escapeLike(q.toLowerCase()) + '%';
      where.push(`(lower(lo2.name) LIKE ? ESCAPE '\\' OR lo2.iata = ? OR lower(ap.a_city) LIKE ? ESCAPE '\\' OR lower(ap.a_name) LIKE ? ESCAPE '\\')`);
      params.push(like, q.toUpperCase(), like, like);
    }
    const iata = normIata(req.query.iata);
    if (iata) { where.push('lo2.iata = ?'); params.push(iata); }
    const country = code2(req.query.country);
    if (country) { where.push('ap.a_country = ?'); params.push(country); }
    const order = {
      rating: 'lo2.avg_rating IS NULL, lo2.avg_rating DESC, lo2.review_count DESC, lo2.name',
      reviews: 'lo2.review_count DESC, lo2.avg_rating DESC, lo2.name',
      name: 'lo2.name COLLATE NOCASE, lo2.iata',
    }[req.query.sort] ?? 'lo2.avg_rating IS NULL, lo2.avg_rating DESC, lo2.review_count DESC, lo2.name';
    const rows = db.prepare(`${LOUNGE_WITH_AIRPORT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, limit, offset);
    res.json(rows.map((row) => ({ ...loungeFrom(row), airport: airportFrom(row, 'a_') })));
  }));

  r.get('/rankings/lounges', h((req, res) => {
    const { limit } = paging(req.query, { defLimit: 50, maxLimit: 200 });
    let minReviews = parseInt(req.query.minReviews, 10);
    if (!Number.isFinite(minReviews) || minReviews < 1) minReviews = 1;
    const rows = db.prepare(`
      SELECT RANK() OVER (ORDER BY lo2.avg_rating DESC) AS rnk, lo2.*, ap.*
      FROM (${LOUNGE_SELECT}) lo2 JOIN (SELECT ${AIRPORT_COLS('a', 'a_')} FROM airports a) ap ON ap.a_iata = lo2.iata
      WHERE lo2.review_count >= ?
      ORDER BY lo2.avg_rating DESC, lo2.review_count DESC, lo2.name LIMIT ?`).all(minReviews, limit);
    res.json(rows.map((row) => ({
      rank: row.rnk,
      lounge: loungeFrom(row),
      airport: airportFrom(row, 'a_'),
      avgRating: round2(row.avg_rating),
      reviewCount: row.review_count,
    })));
  }));

  // ---- Flygbolag (v1.2) ----
  r.get('/airlines', h((req, res) => {
    const { limit } = paging(req.query, { defLimit: 10, maxLimit: 50 });
    const raw = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    res.set('Cache-Control', 'public, max-age=3600');
    if (!raw) return res.json([]);
    const up = raw.toUpperCase();
    const q = normalizeWords(raw);
    const pfx = escapeLike(q) + '%';
    const word = '% ' + escapeLike(q) + '%';
    const rows = db.prepare(`
      SELECT iata, icao, name, country,
        CASE WHEN iata = ? THEN 0 WHEN icao = ? THEN 1 WHEN search_name LIKE ? ESCAPE '\\' THEN 2 ELSE 3 END AS m
      FROM airlines
      WHERE iata = ? OR icao = ? OR (? <> '' AND (search_name LIKE ? ESCAPE '\\' OR search_name LIKE ? ESCAPE '\\'))
      ORDER BY m, name LIMIT ?`).all(up, up, pfx, up, up, q, pfx, word, limit);
    res.json(rows.map(({ iata, icao, name, country }) => ({ iata, icao: icao ?? null, name, country: country ?? null })));
  }));

  // ---- Användarsök ----
  r.get('/users', h((req, res) => {
    const { limit } = paging(req.query, { defLimit: 20, maxLimit: 100 });
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase().slice(0, 40) : '';
    const like = '%' + escapeLike(q) + '%';
    const pfx = escapeLike(q) + '%';
    const rows = db.prepare(`
      SELECT ${USER_COLS('u', '')}, (SELECT COUNT(DISTINCT c.iata) FROM checkins c WHERE c.user_id = u.id) AS unique_airports
      FROM users u
      WHERE ? = '' OR u.username LIKE ? ESCAPE '\\' OR lower(u.display_name) LIKE ? ESCAPE '\\'
      ORDER BY (u.username LIKE ? ESCAPE '\\') DESC, unique_airports DESC, u.username
      LIMIT ?`).all(q, like, like, pfx, limit);
    res.json(rows.map((row) => ({ ...userFrom(row), uniqueAirports: row.unique_airports })));
  }));

  // ---- Önskelista ----
  const userByName = db.prepare('SELECT id FROM users WHERE username = ?');
  const airportExists = db.prepare('SELECT 1 FROM airports WHERE iata = ?');

  r.get('/users/:username/wishlist', h((req, res) => {
    const u = userByName.get(String(req.params.username).toLowerCase());
    if (!u) throw notFound('Användaren finns inte');
    const rows = db.prepare(`SELECT ${AIRPORT_COLS('a', '')}, w.added_at FROM wishlist w
      JOIN airports a ON a.iata = w.iata WHERE w.user_id = ? ORDER BY w.added_at DESC, a.iata`).all(u.id);
    res.json(rows.map((row) => ({ airport: airportFrom(row), addedAt: row.added_at })));
  }));

  r.post('/wishlist', requireAuth, h((req, res) => {
    const iata = normIata(req.body?.iata);
    if (!/^[A-Z]{3}$/.test(iata) || !airportExists.get(iata)) throw bad('iata är ingen känd IATA-kod');
    db.prepare('INSERT OR IGNORE INTO wishlist (user_id, iata, added_at) VALUES (?, ?, ?)')
      .run(req.user.id, iata, new Date().toISOString());
    const row = db.prepare(`SELECT ${AIRPORT_COLS('a', '')}, w.added_at FROM wishlist w
      JOIN airports a ON a.iata = w.iata WHERE w.user_id = ? AND w.iata = ?`).get(req.user.id, iata);
    res.status(201).json({ airport: airportFrom(row), addedAt: row.added_at });
  }));

  r.delete('/wishlist/:iata', requireAuth, h((req, res) => {
    const iata = normIata(req.params.iata);
    if (!/^[A-Z]{3}$/.test(iata) || !airportExists.get(iata)) throw notFound('Flygplatsen finns inte (okänd IATA-kod)');
    db.prepare('DELETE FROM wishlist WHERE user_id = ? AND iata = ?').run(req.user.id, iata);
    res.status(204).end();
  }));

  // ---- Märken ----
  r.get('/users/:username/badges', h((req, res) => {
    const u = userByName.get(String(req.params.username).toLowerCase());
    if (!u) throw notFound('Användaren finns inte');
    res.json(computeBadges(db, u.id));
  }));

  return r;
}
