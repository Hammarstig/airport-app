// Användarprofil, egen flygplatslista, check-ins, märken och statistikkort.
import { Router } from 'express';
import {
  h, bad, notFound, paging, enumParam, round2, userSummary, levelInfo, AIRPORT_COLS, airportFrom,
  CHECKIN_SELECT, checkinsWithPhotos, escapeHtml,
} from '../util.js';
import { countryNameSv } from '../db/index.js';
import { getBadges, userStreak } from '../badges.js';
import { checkinVisible, profileAccess, requireProfileAccess } from '../visibility.js';
import { getChallenges, currentMonth, MONTH_RE } from '../challenges.js';

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
    const access = profileAccess(db, req.user?.id, u);
    const s = db.prepare(`
      SELECT us.*, (SELECT AVG(rating) FROM checkins WHERE user_id = us.user_id) AS avg_rating,
        (SELECT COUNT(*) FROM follows WHERE followee_id = us.user_id AND status = 'accepted') AS followers,
        (SELECT COUNT(*) FROM follows WHERE follower_id = us.user_id AND status = 'accepted') AS following,
        EXISTS (SELECT 1 FROM follows WHERE follower_id = us.user_id AND followee_id = ? AND status = 'accepted') AS follows_me
      FROM user_stats us WHERE us.user_id = ?`).get(viewer, u.id) ?? {};
    const self = req.user?.id === u.id;
    res.json({
      ...(self ? userSummary(db, u) : { ...userSummary(db, u), homeIata: u.hide_home ? null : u.home_iata }),
      isPrivate: !!u.is_private,
      canView: access.canView,
      stats: access.canView ? {
        uniqueAirports: s.airports ?? 0,
        totalCheckins: s.checkins ?? 0,
        countries: s.countries ?? 0,
        continents: s.continents ?? 0,
        avgGivenRating: round2(s.avg_rating ?? null),
        xp: s.xp ?? 0,
      } : null,
      followers: s.followers ?? 0,
      following: s.following ?? 0,
      followedByMe: access.following,
      followRequested: access.followRequested,
      followsMe: !!s.follows_me,
      levelInfo: levelInfo(s.xp ?? 0),
      streak: access.canView ? userStreak(db, u.id) : null,
    });
  }));

  r.get('/users/:username/airports', h((req, res) => {
    const u = userOr404(req.params.username);
    requireProfileAccess(db, req.user?.id, u);
    const order = {
      rating: 'my_rating IS NULL, my_rating DESC, visits DESC, last_visit DESC',
      visits: 'visits DESC, last_visit DESC',
      recent: 'last_visit DESC, visits DESC',
    }[enumParam(req.query, 'sort', ['recent', 'visits', 'rating'], 'recent')];
    // Räknas bara på check-ins som tittaren får se (ägaren ser allt).
    const vis = checkinVisible(req.user?.id);
    const rows = db.prepare(`
      SELECT ${AIRPORT_COLS('a', '')}, g.visits, g.last_visit,
        (SELECT c2.rating FROM checkins c2 WHERE c2.id = g.rated_id) AS my_rating
      FROM (SELECT c.iata, COUNT(*) AS visits, MAX(c.visited_on) AS last_visit,
              (SELECT c3.id FROM checkins c3 WHERE c3.user_id = c.user_id AND c3.iata = c.iata AND c3.rating IS NOT NULL
                 AND c3.id IN (SELECT c.id FROM checkins c JOIN users u ON u.id = c.user_id WHERE c.user_id = ? AND ${vis.sql})
               ORDER BY c3.visited_on DESC, c3.created_at DESC, c3.id DESC LIMIT 1) AS rated_id
            FROM checkins c JOIN users u ON u.id = c.user_id
            WHERE c.user_id = ? AND ${vis.sql} GROUP BY c.iata) g
      JOIN airports a ON a.iata = g.iata
      ORDER BY ${order}, a.iata`).all(u.id, ...vis.params, u.id, ...vis.params);
    res.json(rows.map((row) => ({
      airport: airportFrom(row),
      visits: row.visits,
      lastVisit: row.last_visit,
      myRating: row.my_rating ?? null,
    })));
  }));

  r.get('/users/:username/checkins', h((req, res) => {
    const u = userOr404(req.params.username);
    requireProfileAccess(db, req.user?.id, u);
    const { limit, offset } = paging(req.query);
    const vis = checkinVisible(req.user?.id);
    const rows = db.prepare(`${CHECKIN_SELECT} WHERE c.user_id = ? AND ${vis.sql}
      ORDER BY c.visited_on DESC, c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`)
      .all(req.user?.id ?? -1, u.id, ...vis.params, limit, offset);
    res.json(checkinsWithPhotos(db, rows));
  }));

  r.get('/users/:username/challenges', h((req, res) => {
    const u = userOr404(req.params.username);
    requireProfileAccess(db, req.user?.id, u);
    const month = req.query.month ?? currentMonth();
    if (typeof month !== 'string' || !MONTH_RE.test(month)) throw bad('month måste vara YYYY-MM');
    res.json({ month, challenges: getChallenges(db, u.id, month) });
  }));

  r.get('/users/:username/mayorships', h((req, res) => {
    const u = userOr404(req.params.username);
    requireProfileAccess(db, req.user?.id, u);
    const rows = db.prepare(`SELECT ${AIRPORT_COLS('a', '')}, am.checkins, am.since FROM airport_mayors am
      JOIN airports a ON a.iata = am.iata WHERE am.user_id = ? ORDER BY am.since DESC`).all(u.id);
    res.json(rows.map((x) => ({ airport: airportFrom(x), checkins: x.checkins, since: x.since })));
  }));

  r.get('/users/:username/badges', h((req, res) => {
    const u = userOr404(req.params.username);
    requireProfileAccess(db, req.user?.id, u);
    res.json(getBadges(db, u.id));
  }));

  // ---- Statistikkort för delning ----
  function cardData(u, yearRaw, viewerId) {
    let year = null;
    if (yearRaw !== undefined && yearRaw !== '') {
      year = Number(yearRaw);
      if (!Number.isInteger(year) || year < 1900 || year > 2100) throw bad('year måste vara ett årtal');
    }
    const from = year ? `${year}-01-01` : '0000-01-01';
    const to = year ? `${year}-12-31` : '9999-12-31';
    const vis = checkinVisible(viewerId);
    const base = `FROM checkins c JOIN airports a ON a.iata = c.iata JOIN users u ON u.id = c.user_id
      WHERE c.user_id = ? AND c.visited_on BETWEEN ? AND ? AND ${vis.sql}`;
    const p = [u.id, from, to, ...vis.params];
    const t = db.prepare(`SELECT COUNT(*) AS checkins, COUNT(DISTINCT c.iata) AS airports,
        COUNT(DISTINCT a.country) AS countries, COUNT(DISTINCT a.continent) AS continents,
        COUNT(DISTINCT CASE WHEN a.scheduled = 1 THEN c.iata END) AS scheduled,
        MIN(c.visited_on) AS first_visit, MAX(c.visited_on) AS last_visit ${base}`).get(...p);
    const newAirports = year ? db.prepare(`SELECT COUNT(*) AS n FROM (SELECT c.iata, MIN(c.visited_on) AS first
        FROM checkins c JOIN users u ON u.id = c.user_id WHERE c.user_id = ? AND ${vis.sql} GROUP BY c.iata)
        WHERE first BETWEEN ? AND ?`).get(u.id, ...vis.params, from, to).n : t.airports;
    const top = db.prepare(`SELECT ${AIRPORT_COLS('a', '')}, COUNT(*) AS n ${base} GROUP BY c.iata ORDER BY n DESC, a.iata LIMIT 1`).get(...p);
    const airline = db.prepare(`SELECT al.iata, al.name, COUNT(*) AS n ${base.replace('JOIN users u', 'JOIN airlines al ON al.iata = c.airline_iata JOIN users u')}
        GROUP BY al.iata ORDER BY n DESC, al.name LIMIT 1`).get(...p);
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
    requireProfileAccess(db, req.user?.id, u);
    res.json(cardData(u, req.query.year, req.user?.id));
  }));

  // Årsöversikt ("Ditt 2026"): statistikkortet för året plus månader, nya länder och höjdpunkter.
  r.get('/users/:username/year/:year', h((req, res) => {
    const u = userOr404(req.params.username);
    requireProfileAccess(db, req.user?.id, u);
    const year = Number(req.params.year);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) throw bad('year måste vara ett årtal');
    const card = cardData(u, String(year), req.user?.id);
    const vis = checkinVisible(req.user?.id);
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const vc = `FROM checkins c JOIN users u ON u.id = c.user_id JOIN airports a ON a.iata = c.iata
      WHERE c.user_id = ? AND ${vis.sql}`;
    const p = [u.id, ...vis.params];
    const firstVisits = db.prepare(`SELECT c.iata, a.country, MIN(c.visited_on) AS first ${vc} GROUP BY c.iata`).all(...p);
    const months = Array.from({ length: 12 }, (_, i) => ({ month: `${year}-${String(i + 1).padStart(2, '0')}`, checkins: 0, newAirports: 0 }));
    for (const row of db.prepare(`SELECT substr(c.visited_on, 1, 7) AS m, COUNT(*) AS n ${vc} AND c.visited_on BETWEEN ? AND ? GROUP BY m`)
      .all(...p, from, to)) months[Number(row.m.slice(5)) - 1].checkins = row.n;
    const countryFirst = new Map();
    for (const f of firstVisits) {
      if (f.first >= from && f.first <= to) months[Number(f.first.slice(5, 7)) - 1].newAirports++;
      if (f.country && (!countryFirst.has(f.country) || f.first < countryFirst.get(f.country))) countryFirst.set(f.country, f.first);
    }
    const newCountries = [...countryFirst].filter(([, d]) => d >= from && d <= to).sort((a, b) => (a[1] < b[1] ? -1 : 1))
      .map(([code, firstVisit]) => ({ code, name: countryNameSv(code), firstVisit }));
    const edge = (dir) => db.prepare(`SELECT ${AIRPORT_COLS('a', '')}, c.visited_on ${vc} AND c.visited_on BETWEEN ? AND ?
      ORDER BY c.visited_on ${dir}, c.id ${dir} LIMIT 1`).get(...p, from, to);
    const first = edge('ASC');
    const last = edge('DESC');
    const fav = db.prepare(`SELECT ${AIRPORT_COLS('a', '')}, AVG(c.rating) AS avg_rating, COUNT(*) AS n ${vc}
      AND c.visited_on BETWEEN ? AND ? AND c.rating IS NOT NULL GROUP BY c.iata ORDER BY avg_rating DESC, n DESC, a.iata LIMIT 1`)
      .get(...p, from, to);
    const badges = getBadges(db, u.id);
    const badgesEarned = [];
    for (const b of badges) {
      for (const t of b.tiers) {
        if (t.earnedAt && t.earnedAt.startsWith(String(year))) badgesEarned.push({ id: b.id, name: b.name, tier: t.tier, earnedAt: t.earnedAt });
      }
    }
    const challengesCompleted = db.prepare("SELECT COUNT(*) AS n FROM user_challenges WHERE user_id = ? AND month LIKE ?")
      .get(u.id, `${year}-%`).n;
    res.json({
      ...card,
      months,
      newCountries,
      firstCheckin: first ? { airport: airportFrom(first), visitedOn: first.visited_on } : null,
      lastCheckin: last ? { airport: airportFrom(last), visitedOn: last.visited_on } : null,
      favoriteAirport: fav ? { airport: airportFrom(fav), avgRating: round2(fav.avg_rating), checkins: fav.n } : null,
      badgesEarned: badgesEarned.sort((a, b) => (a.earnedAt < b.earnedAt ? -1 : 1)),
      challengesCompleted,
    });
  }));

  r.get('/users/:username/card.svg', h((req, res) => {
    const u = userOr404(req.params.username);
    requireProfileAccess(db, req.user?.id, u);
    const d = cardData(u, req.query.year, req.user?.id);
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
