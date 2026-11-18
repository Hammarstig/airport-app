import { Router } from 'express';
import { normalizeWords, countryNameSv } from '../db/index.js';
import {
  h, bad, notFound, HttpError, cleanText, normIata, paging, enumParam, round2, escapeLike, code2, LOUNGE_SELECT, loungeFrom,
  AIRPORT_COLS, airportFrom, CHECKIN_SELECT, checkinsWithPhotos, SUB_RATINGS, TRAVEL_CLASSES, photoFrom, PHOTO_PUBLIC_SQL,
  USER_COLS, userFrom,
} from '../util.js';
import { globalMeans, bayesSql, AIRPORT_PRIOR } from '../stats.js';
import { checkinVisible } from '../visibility.js';
import { regulars, MAYOR_DAYS } from '../regulars.js';
import { requireAuth } from '../auth.js';

const MATCHED_ON = ['iata', 'icao', 'country', 'city', 'name', 'country'];

/** Avstånd i km (haversine). */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(x)));
}

export default function airportRoutes({ db }) {
  const r = Router();
  const getAirport = db.prepare(`SELECT ${AIRPORT_COLS('a', '')} FROM airports a WHERE a.iata = ?`);
  const loungesFor = db.prepare(`${LOUNGE_SELECT} WHERE lo.iata = ? ORDER BY lower(lo.name)`);

  function airportOr404(iataRaw) {
    const iata = normIata(iataRaw);
    const row = /^[A-Z]{3}$/.test(iata) ? getAirport.get(iata) : null;
    if (!row) throw notFound('Flygplatsen finns inte (okänd IATA-kod)');
    return row;
  }

  // Sök/lista flygplatser (v1.2). Nivåer: IATA exakt, ICAO exakt, exakt landskod, stad, flygplatsnamn,
  // land (svenska/engelska namn). Inom nivå: large > medium > small, sedan antal check-ins.
  // Filter: country, continent, type, minRating, visited (kräver inloggning).
  r.get('/airports', h((req, res) => {
    const raw = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    const { limit, offset } = paging(req.query, { defLimit: 20, maxLimit: 100 });
    const where = [];
    const params = [];
    let matchExpr = 'NULL';
    const matchParams = [];
    const q = raw ? normalizeWords(raw) : '';
    const up = raw.toUpperCase();
    if (raw && (q || /^[A-Z0-9]{3,4}$/.test(up))) {
      const pfx = escapeLike(q) + '%';
      const word = '% ' + escapeLike(q) + '%';
      const cc = /^[A-Z]{2}$/.test(up) ? up : null;
      const cityM = `(a.search_city LIKE ? ESCAPE '\\' OR a.search_city LIKE ? ESCAPE '\\')`;
      const nameM = `(a.search_name LIKE ? ESCAPE '\\' OR a.search_name LIKE ? ESCAPE '\\')`;
      const countryM = `(a.country = ? OR a.search_country LIKE ? ESCAPE '\\' OR a.search_country LIKE ? ESCAPE '\\')`;
      // En exakt landskod ("se") rankas direkt efter IATA/ICAO, annars drunknar landet i stadsprefix.
      matchExpr = `CASE WHEN a.iata = ? THEN 0 WHEN a.icao = ? THEN 1 WHEN a.country = ? THEN 2
        WHEN ${cityM} THEN 3 WHEN ${nameM} THEN 4 ELSE 5 END`;
      matchParams.push(up, up, cc, pfx, word, pfx, word);
      where.push(`(a.iata = ? OR a.icao = ? OR ${cityM} OR ${nameM} OR ${countryM})`);
      params.push(up, up, pfx, word, pfx, word, cc, pfx, word);
    } else if (raw) {
      return res.json([]);
    }
    const country = code2(req.query.country);
    if (country) { where.push('a.country = ?'); params.push(country); }
    const continent = code2(req.query.continent);
    if (continent) { where.push('a.continent = ?'); params.push(continent); }
    const type = enumParam(req.query, 'type', ['large', 'medium', 'small'], null);
    if (type) { where.push('a.type = ?'); params.push(type); }
    const minRating = Number(req.query.minRating);
    if (req.query.minRating !== undefined && req.query.minRating !== '' && Number.isFinite(minRating)) {
      where.push('s.rating_count > 0 AND s.rating_sum / s.rating_count >= ?'); params.push(minRating);
    }
    const visited = enumParam(req.query, 'visited', ['any', 'mine', 'notmine'], 'any');
    if (req.user && visited === 'mine') {
      where.push('EXISTS (SELECT 1 FROM user_airports m WHERE m.user_id = ? AND m.iata = a.iata)'); params.push(req.user.id);
    } else if (req.user && visited === 'notmine') {
      where.push('NOT EXISTS (SELECT 1 FROM user_airports m WHERE m.user_id = ? AND m.iata = a.iata)'); params.push(req.user.id);
    }
    const sort = enumParam(req.query, 'sort', ['relevance', 'rating', 'checkins', 'name'], raw ? 'relevance' : 'checkins');
    const score = sort === 'rating' ? bayesSql('s.rating_sum', 's.rating_count', globalMeans(db).overall, AIRPORT_PRIOR) : 'NULL';
    const order = {
      relevance: 'm, a.type_rank, IFNULL(s.checkins, 0) DESC, a.scheduled DESC, a.search_name',
      rating: 'score IS NULL, score DESC, IFNULL(s.rating_count, 0) DESC, a.type_rank, a.name',
      checkins: 'IFNULL(s.checkins, 0) DESC, a.type_rank, a.scheduled DESC, a.name',
      name: 'a.name COLLATE NOCASE, a.iata',
    }[sort];
    const rows = db.prepare(`
      SELECT ${AIRPORT_COLS('a', '')}, ${matchExpr} AS m, ${score} AS score,
             s.rating_sum / NULLIF(s.rating_count, 0) AS avg_rating,
             IFNULL(s.rating_count, 0) AS rating_count, IFNULL(s.checkins, 0) AS checkins
      FROM airports a
      LEFT JOIN airport_stats s ON s.iata = a.iata
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY ${order}
      LIMIT ? OFFSET ?`).all(...matchParams, ...params, limit, offset);
    res.json(rows.map((row) => ({
      ...airportFrom(row),
      countryName: countryNameSv(row.country),
      matchedOn: row.m == null ? null : MATCHED_ON[row.m],
      avgRating: round2(row.avg_rating),
      ratingCount: row.rating_count,
      checkins: row.checkins,
    })));
  }));

  // Flygplatser nära en position (för snabb check-in). Grov bbox i SQL, exakt avstånd i JS.
  r.get('/airports/nearby', h((req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (req.query.lat === undefined || req.query.lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)
      || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw bad('lat och lon krävs (grader, -90..90 och -180..180)');
    }
    const { limit } = paging(req.query, { defLimit: 10, maxLimit: 50 });
    let radius = Number(req.query.radiusKm);
    if (!Number.isFinite(radius) || radius <= 0) radius = 500;
    radius = Math.min(radius, 2000);
    const all = enumParam(req.query, 'scope', ['scheduled', 'all'], 'scheduled') === 'all' ? 1 : 0;
    const dLat = radius / 111;
    const cos = Math.cos((lat * Math.PI) / 180);
    const dLon = cos > 0.01 ? radius / (111 * cos) : 360;
    const lonFilter = lon - dLon < -180 || lon + dLon > 180 ? '' : 'AND a.lon BETWEEN ? AND ?';
    const params = [all, lat - dLat, lat + dLat];
    if (lonFilter) params.push(lon - dLon, lon + dLon);
    const rows = db.prepare(`SELECT ${AIRPORT_COLS('a', '')} FROM airports a
      WHERE (? = 1 OR a.scheduled = 1) AND a.lat BETWEEN ? AND ? ${lonFilter}`).all(...params);
    const list = rows
      .map((row) => ({ row, d: distanceKm(lat, lon, row.lat, row.lon) }))
      .filter((x) => x.d <= radius)
      .sort((x, y) => x.d - y.d)
      .slice(0, limit)
      .map(({ row, d }) => ({ ...airportFrom(row), countryName: countryNameSv(row.country), distanceKm: Math.round(d * 10) / 10 }));
    res.set('Cache-Control', 'private, max-age=60');
    res.json(list);
  }));

  r.get('/airports/:iata', h((req, res) => {
    const a = airportOr404(req.params.iata);
    const s = db.prepare('SELECT * FROM airport_stats WHERE iata = ?').get(a.iata) ?? {};
    const topAirlines = db.prepare(`
      SELECT al.iata, al.name, COUNT(*) AS n FROM checkins c JOIN airlines al ON al.iata = c.airline_iata
      WHERE c.iata = ? GROUP BY al.iata ORDER BY n DESC, al.name LIMIT 5`).all(a.iata);
    const avg = (sum, n) => (n ? round2(sum / n) : null);
    const stats = {
      visitors: s.visitors ?? 0,
      checkins: s.checkins ?? 0,
      avgRating: avg(s.rating_sum, s.rating_count),
      ratingCount: s.rating_count ?? 0,
      subAverages: Object.fromEntries(SUB_RATINGS.map((k) => [k, avg(s[`s_${k}_sum`], s[`s_${k}_n`])])),
      topAirlines: topAirlines.map((x) => ({ airline: { iata: x.iata, name: x.name }, checkins: x.n })),
      classMix: Object.fromEntries(TRAVEL_CLASSES.map((k) => [k, s['cls_' + k] ?? 0])),
    };
    const pv = checkinVisible(req.user?.id);
    const photos = db.prepare(`SELECT p.*, ${PHOTO_PUBLIC_SQL} AS pub FROM photos p JOIN checkins c ON c.id = p.checkin_id
      JOIN users u ON u.id = c.user_id WHERE c.iata = ? AND ${pv.sql} ORDER BY p.id DESC LIMIT 12`)
      .all(new Date().toISOString(), a.iata, ...pv.params).map(photoFrom);
    let onMyWishlist = false;
    let myVisits = 0;
    let friendsVisited = [];
    if (req.user) {
      const me = db.prepare(`SELECT EXISTS (SELECT 1 FROM wishlist WHERE user_id = ? AND iata = ?) AS w,
        (SELECT visits FROM user_airports WHERE user_id = ? AND iata = ?) AS v`).get(req.user.id, a.iata, req.user.id, a.iata);
      onMyWishlist = !!me.w;
      myVisits = me.v ?? 0;
      // Personer jag följer som har minst en check-in här som jag får se.
      const fv = checkinVisible(req.user.id);
      friendsVisited = db.prepare(`SELECT ${USER_COLS('u', '')} FROM follows f
        JOIN users u ON u.id = f.followee_id
        WHERE f.follower_id = ? AND f.status = 'accepted' AND EXISTS (
          SELECT 1 FROM checkins c WHERE c.user_id = u.id AND c.iata = ? AND ${fv.sql})
        ORDER BY u.username LIMIT 10`).all(req.user.id, a.iata, ...fv.params).map((x) => userFrom(x));
    }
    const m = db.prepare(`SELECT am.checkins, am.since, ${USER_COLS('u', '')} FROM airport_mayors am
      JOIN users u ON u.id = am.user_id WHERE am.iata = ?`).get(a.iata);
    res.json({
      ...airportFrom(a),
      countryName: countryNameSv(a.country),
      mayor: m ? { user: userFrom(m), checkins: m.checkins, since: m.since } : null,
      stats,
      lounges: loungesFor.all(a.iata).map(loungeFrom),
      photos,
      onMyWishlist,
      myVisits,
      friendsVisited,
    });
  }));

  r.get('/airports/:iata/checkins', h((req, res) => {
    const a = airportOr404(req.params.iata);
    const { limit, offset } = paging(req.query);
    const vis = checkinVisible(req.user?.id);
    const rows = db.prepare(`${CHECKIN_SELECT} WHERE c.iata = ? AND ${vis.sql}
      ORDER BY c.visited_on DESC, c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`)
      .all(req.user?.id ?? -1, a.iata, ...vis.params, limit, offset);
    res.json(checkinsWithPhotos(db, rows, req.user?.id ?? null));
  }));

  // Stammisar: flest publika check-ins de senaste `days` dagarna (standard 60).
  r.get('/airports/:iata/regulars', h((req, res) => {
    const a = airportOr404(req.params.iata);
    let days = req.query.days === undefined ? MAYOR_DAYS : Number(req.query.days);
    if (!Number.isInteger(days) || days < 7 || days > 365) throw bad('days måste vara ett heltal 7-365');
    const rows = regulars(db, a.iata, { days, limit: 10 });
    const users = rows.length ? new Map(db.prepare(`SELECT u.id, ${USER_COLS('u', '')} FROM users u
      WHERE u.id IN (${rows.map(() => '?').join(',')})`).all(...rows.map((x) => x.user_id)).map((u) => [u.id, userFrom(u)])) : new Map();
    let rank = 0;
    const list = rows.map((x, i) => {
      if (i === 0 || x.checkins !== rows[i - 1].checkins) rank = i + 1;
      return { rank, user: users.get(x.user_id), checkins: x.checkins, lastVisit: x.last_visit };
    });
    const m = db.prepare(`SELECT am.checkins, am.since, ${USER_COLS('u', '')} FROM airport_mayors am
      JOIN users u ON u.id = am.user_id WHERE am.iata = ?`).get(a.iata);
    res.json({ days, mayor: m ? { user: userFrom(m), checkins: m.checkins, since: m.since } : null, regulars: list });
  }));

  r.get('/airports/:iata/lounges', h((req, res) => {
    const a = airportOr404(req.params.iata);
    res.json(loungesFor.all(a.iata).map(loungeFrom));
  }));

  r.post('/airports/:iata/lounges', requireAuth, h((req, res) => {
    const a = airportOr404(req.params.iata);
    const b = req.body ?? {};
    const name = cleanText(b.name, { field: 'name', max: 80, min: 2, required: true });
    const terminal = cleanText(b.terminal, { field: 'terminal', max: 40 });
    let info;
    try {
      info = db.prepare('INSERT INTO lounges (iata, name, terminal, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(a.iata, name, terminal, req.user.id, new Date().toISOString());
    } catch (e) {
      if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'Det finns redan en lounge med det namnet här');
      throw e;
    }
    const row = db.prepare(`${LOUNGE_SELECT} WHERE lo.id = ?`).get(Number(info.lastInsertRowid));
    res.status(201).json(loungeFrom(row));
  }));

  return r;
}
