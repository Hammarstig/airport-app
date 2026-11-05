import { Router } from 'express';
import { code2 } from './airports.js';
import { h, notFound, SUB_RATINGS, paging, round2, userFrom, USER_COLS, AIRPORT_COLS, airportFrom, CHECKIN_SELECT, checkinsWithPhotos } from '../util.js';

const METRICS = {
  airports: 'COUNT(DISTINCT c.iata)',
  countries: 'COUNT(DISTINCT a.country)',
  checkins: 'COUNT(*)',
};

export default function userRoutes({ db }) {
  const r = Router();
  const byUsername = db.prepare('SELECT * FROM users WHERE username = ?');

  function userOr404(raw) {
    const u = typeof raw === 'string' ? byUsername.get(raw.toLowerCase()) : null;
    if (!u) throw notFound('Användaren finns inte');
    return u;
  }

  r.get('/users/:username', h((req, res) => {
    const u = userOr404(req.params.username);
    const s = db.prepare(`
      SELECT COUNT(DISTINCT c.iata) AS unique_airports, COUNT(c.id) AS total,
             COUNT(DISTINCT a.country) AS countries, COUNT(DISTINCT a.continent) AS continents,
             AVG(c.rating) AS avg_rating
      FROM checkins c JOIN airports a ON a.iata = c.iata WHERE c.user_id = ?`).get(u.id);
    res.json({
      ...userFrom(u),
      stats: {
        uniqueAirports: s.unique_airports,
        totalCheckins: s.total,
        countries: s.countries,
        continents: s.continents,
        avgGivenRating: round2(s.avg_rating),
      },
    });
  }));

  r.get('/users/:username/airports', h((req, res) => {
    const u = userOr404(req.params.username);
    const order = {
      rating: 'my_rating IS NULL, my_rating DESC, visits DESC, last_visit DESC',
      visits: 'visits DESC, last_visit DESC',
      recent: 'last_visit DESC, visits DESC',
    }[req.query.sort] ?? 'last_visit DESC, visits DESC';
    const rows = db.prepare(`
      SELECT ${AIRPORT_COLS('a', '')}, g.visits, g.last_visit,
        (SELECT c2.rating FROM checkins c2 WHERE c2.user_id = ? AND c2.iata = a.iata AND c2.rating IS NOT NULL
          ORDER BY c2.visited_on DESC, c2.created_at DESC, c2.id DESC LIMIT 1) AS my_rating
      FROM (SELECT iata, COUNT(*) AS visits, MAX(visited_on) AS last_visit FROM checkins WHERE user_id = ? GROUP BY iata) g
      JOIN airports a ON a.iata = g.iata
      ORDER BY ${order}, a.iata`).all(u.id, u.id);
    res.json(rows.map((row) => ({
      airport: airportFrom(row),
      visits: row.visits,
      lastVisit: row.last_visit,
      myRating: row.my_rating ?? null,
    })));
  }));

  r.get('/users/:username/checkins', h((req, res) => {
    const u = userOr404(req.params.username);
    const { limit, offset } = paging(req.query);
    const rows = db.prepare(`${CHECKIN_SELECT} WHERE c.user_id = ?
      ORDER BY c.visited_on DESC, c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`)
      .all(req.user?.id ?? -1, u.id, limit, offset);
    res.json(checkinsWithPhotos(db, rows));
  }));

  r.get('/leaderboard', h((req, res) => {
    const metric = METRICS[req.query.metric] ? req.query.metric : 'airports';
    const { limit } = paging(req.query, { defLimit: 50, maxLimit: 200 });
    const rows = db.prepare(`
      SELECT RANK() OVER (ORDER BY t.value DESC) AS rnk, t.* FROM (
        SELECT ${USER_COLS('u', '')}, ${METRICS[metric]} AS value
        FROM checkins c JOIN users u ON u.id = c.user_id JOIN airports a ON a.iata = c.iata
        GROUP BY u.id
      ) t ORDER BY t.value DESC, t.username LIMIT ?`).all(limit);
    res.json(rows.map((row) => ({ rank: row.rnk, user: userFrom(row), value: row.value })));
  }));

  r.get('/rankings/airports', h((req, res) => {
    let minRatings = parseInt(req.query.minRatings, 10);
    if (!Number.isFinite(minRatings) || minRatings < 1) minRatings = 1;
    const { limit } = paging(req.query, { defLimit: 50, maxLimit: 200 });
    const category = SUB_RATINGS.includes(req.query.category) ? req.query.category : 'overall';
    const col = category === 'overall' ? 'c.rating' : `c.r_${category}`;
    const country = code2(req.query.country);
    const continent = code2(req.query.continent);
    const type = ['large', 'medium', 'small'].includes(req.query.type) ? req.query.type : null;
    const rows = db.prepare(`
      SELECT RANK() OVER (ORDER BY t.avg_rating DESC) AS rnk, t.* FROM (
        SELECT ${AIRPORT_COLS('a', '')}, AVG(${col}) AS avg_rating, COUNT(${col}) AS rating_count
        FROM checkins c JOIN airports a ON a.iata = c.iata
        WHERE ${col} IS NOT NULL AND (? IS NULL OR a.country = ?) AND (? IS NULL OR a.continent = ?)
          AND (? IS NULL OR a.type = ?)
        GROUP BY a.iata HAVING COUNT(${col}) >= ?
      ) t ORDER BY t.avg_rating DESC, t.rating_count DESC, t.iata LIMIT ?`)
      .all(country, country, continent, continent, type, type, minRatings, limit);
    res.json(rows.map((row) => ({
      rank: row.rnk,
      airport: airportFrom(row),
      avgRating: round2(row.avg_rating),
      ratingCount: row.rating_count,
    })));
  }));

  return r;
}
