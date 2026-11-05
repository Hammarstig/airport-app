// Användarprofil, egen flygplatslista, check-ins, märken och statistikkort.
import { Router } from 'express';
import {
  h, bad, notFound, paging, round2, userSummary, levelInfo, AIRPORT_COLS, airportFrom,
  CHECKIN_SELECT, checkinsWithPhotos, escapeHtml,
} from '../util.js';
import { countryNameSv } from '../db.js';
import { getBadges, userStreak } from '../badges.js';

export default function userRoutes({ db }) {
  const r = Router();
  const byUsername = db.prepare('SELECT * FROM users WHERE username = ?');
  const scheduledTotal = () => db.prepare('SELECT COUNT(*) AS n FROM airports WHERE scheduled = 1').get().n || 1;

  function userOr404(raw) {
    const u = typeof raw === 'string' ? byUsername.get(raw.toLowerCase()) : null;
    if (!u) throw notFound('Användaren finns inte');
    return u;
  }

  r.get('/users/:username', h((req, res) => {
    const u = userOr404(req.params.username);
    const viewer = req.user?.id ?? -1;
    const s = db.prepare(`
      SELECT us.*, (SELECT AVG(rating) FROM checkins WHERE user_id = us.user_id) AS avg_rating,
        (SELECT COUNT(*) FROM follows WHERE followee_id = us.user_id) AS followers,
        (SELECT COUNT(*) FROM follows WHERE follower_id = us.user_id) AS following,
        EXISTS (SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = us.user_id) AS followed_by_me,
        EXISTS (SELECT 1 FROM follows WHERE follower_id = us.user_id AND followee_id = ?) AS follows_me
      FROM user_stats us WHERE us.user_id = ?`).get(viewer, viewer, u.id) ?? {};
    res.json({
      ...userSummary(db, u),
      stats: {
        uniqueAirports: s.airports ?? 0,
        totalCheckins: s.checkins ?? 0,
        countries: s.countries ?? 0,
        continents: s.continents ?? 0,
        avgGivenRating: round2(s.avg_rating ?? null),
        xp: s.xp ?? 0,
      },
      followers: s.followers ?? 0,
      following: s.following ?? 0,
      followedByMe: !!s.followed_by_me,
      followsMe: !!s.follows_me,
      levelInfo: levelInfo(s.xp ?? 0),
      streak: userStreak(db, u.id),
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
      SELECT ${AIRPORT_COLS('a', '')}, ua.visits, ua.last_visit,
        (SELECT c2.rating FROM checkins c2 WHERE c2.user_id = ua.user_id AND c2.iata = ua.iata AND c2.rating IS NOT NULL
          ORDER BY c2.visited_on DESC, c2.created_at DESC, c2.id DESC LIMIT 1) AS my_rating
      FROM user_airports ua JOIN airports a ON a.iata = ua.iata
      WHERE ua.user_id = ?
      ORDER BY ${order}, a.iata`).all(u.id);
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

  r.get('/users/:username/badges', h((req, res) => {
    const u = userOr404(req.params.username);
    res.json(getBadges(db, u.id));
  }));

  // ---- Statistikkort för delning ----
  function cardData(u, yearRaw) {
    let year = null;
    if (yearRaw !== undefined && yearRaw !== '') {
      year = Number(yearRaw);
      if (!Number.isInteger(year) || year < 1900 || year > 2100) throw bad('year måste vara ett årtal');
    }
    const from = year ? `${year}-01-01` : '0000-01-01';
    const to = year ? `${year}-12-31` : '9999-12-31';
    const base = `FROM checkins c JOIN airports a ON a.iata = c.iata WHERE c.user_id = ? AND c.visited_on BETWEEN ? AND ?`;
    const p = [u.id, from, to];
    const t = db.prepare(`SELECT COUNT(*) AS checkins, COUNT(DISTINCT c.iata) AS airports,
        COUNT(DISTINCT a.country) AS countries, COUNT(DISTINCT a.continent) AS continents,
        COUNT(DISTINCT CASE WHEN a.scheduled = 1 THEN c.iata END) AS scheduled,
        MIN(c.visited_on) AS first_visit, MAX(c.visited_on) AS last_visit ${base}`).get(...p);
    const newAirports = year ? db.prepare(`SELECT COUNT(*) AS n FROM (SELECT iata, MIN(visited_on) AS first
        FROM checkins WHERE user_id = ? GROUP BY iata) WHERE first BETWEEN ? AND ?`).get(...p).n : t.airports;
    const top = db.prepare(`SELECT ${AIRPORT_COLS('a', '')}, COUNT(*) AS n ${base} GROUP BY c.iata ORDER BY n DESC, a.iata LIMIT 1`).get(...p);
    const airline = db.prepare(`SELECT al.iata, al.name, COUNT(*) AS n FROM checkins c JOIN airlines al ON al.iata = c.airline_iata
        WHERE c.user_id = ? AND c.visited_on BETWEEN ? AND ? GROUP BY al.iata ORDER BY n DESC, al.name LIMIT 1`).get(...p);
    const countries = db.prepare(`SELECT a.country, COUNT(DISTINCT c.iata) AS n ${base} AND a.country IS NOT NULL
        GROUP BY a.country ORDER BY n DESC, a.country LIMIT 3`).all(...p);
    const badges = db.prepare('SELECT COUNT(*) AS n FROM user_badges WHERE user_id = ?').get(u.id).n;
    const xp = db.prepare('SELECT xp FROM user_stats WHERE user_id = ?').get(u.id)?.xp ?? 0;
    return {
      user: userSummary(db, u),
      year,
      checkins: t.checkins,
      uniqueAirports: t.airports,
      newAirports,
      countries: t.countries,
      continents: t.continents,
      worldPct: Math.round((t.scheduled / scheduledTotal()) * 1000) / 10,
      topAirport: top ? { airport: airportFrom(top), visits: top.n } : null,
      topAirline: airline ? { iata: airline.iata, name: airline.name, checkins: airline.n } : null,
      longestStreak: userStreak(db, u.id).longest,
      levelInfo: levelInfo(xp),
      badges,
      topCountries: countries.map((c) => ({ code: c.country, name: countryNameSv(c.country), airports: c.n })),
      firstVisit: t.first_visit ?? null,
      lastVisit: t.last_visit ?? null,
    };
  }

  r.get('/users/:username/card', h((req, res) => {
    const u = userOr404(req.params.username);
    res.set('Cache-Control', 'public, max-age=300');
    res.json(cardData(u, req.query.year));
  }));

  r.get('/users/:username/card.svg', h((req, res) => {
    const u = userOr404(req.params.username);
    const d = cardData(u, req.query.year);
    const e = (x) => escapeHtml(String(x ?? ''));
    const stat = (x, label, value) => `
      <text x="${x}" y="360" font-size="88" font-weight="800" fill="#FFC22E">${e(value)}</text>
      <text x="${x}" y="410" font-size="28" fill="#C9D6EA">${e(label)}</text>`;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="Arial Narrow, Arial, sans-serif">
  <rect width="1200" height="630" fill="#08111E"/>
  <rect x="0" y="600" width="1200" height="30" fill="#FFC22E"/>
  <text x="80" y="120" font-size="40" fill="#C9D6EA">Gatelog${d.year ? ` ${d.year}` : ''}</text>
  <text x="80" y="200" font-size="64" font-weight="800" fill="#FFFFFF">${e(d.user.displayName)}</text>
  <text x="80" y="250" font-size="30" fill="#C9D6EA">@${e(d.user.username)} · Nivå ${d.levelInfo.level} ${e(d.levelInfo.title)}</text>
  ${stat(80, 'flygplatser', d.uniqueAirports)}
  ${stat(380, 'länder', d.countries)}
  ${stat(640, 'check-ins', d.checkins)}
  ${stat(900, 'av världen', `${String(d.worldPct).replace('.', ',')} %`)}
  <text x="80" y="520" font-size="30" fill="#FFFFFF">${d.topAirport ? `Mest besökt: ${e(d.topAirport.airport.iata)} (${d.topAirport.visits} gånger)` : ''}</text>
  <text x="80" y="565" font-size="26" fill="#C9D6EA">Längsta svit: ${d.longestStreak} veckor · ${d.badges} märkesnivåer</text>
</svg>`;
    res.set({ 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
    res.send(svg);
  }));

  return r;
}
