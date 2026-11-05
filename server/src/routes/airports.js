import { Router } from 'express';
import { normalizeWords, countryNameSv } from '../db.js';
import {
  h, notFound, HttpError, cleanText, normIata, paging, round2,
  AIRPORT_COLS, airportFrom, CHECKIN_SELECT, checkinsWithPhotos, SUB_RATINGS, TRAVEL_CLASSES, photoFrom,
} from '../util.js';
import { requireAuth } from '../auth.js';

export const LOUNGE_SELECT = `
  SELECT lo.id, lo.iata, lo.name, lo.terminal,
         (SELECT AVG(rating) FROM lounge_reviews r WHERE r.lounge_id = lo.id) AS avg_rating,
         (SELECT COUNT(*) FROM lounge_reviews r WHERE r.lounge_id = lo.id) AS review_count
  FROM lounges lo`;

export function loungeFrom(row) {
  return {
    id: row.id,
    iata: row.iata,
    name: row.name,
    terminal: row.terminal ?? null,
    avgRating: round2(row.avg_rating),
    reviewCount: row.review_count,
  };
}

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);
const MATCHED_ON = ['iata', 'icao', 'country', 'city', 'name', 'country'];
export const code2 = (v) => (typeof v === 'string' && /^[A-Za-z]{2}$/.test(v.trim()) ? v.trim().toUpperCase() : null);

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
    if (['large', 'medium', 'small'].includes(req.query.type)) { where.push('a.type = ?'); params.push(req.query.type); }
    const minRating = Number(req.query.minRating);
    if (req.query.minRating !== undefined && req.query.minRating !== '' && Number.isFinite(minRating)) {
      where.push('s.avg_rating >= ?'); params.push(minRating);
    }
    if (req.user && req.query.visited === 'mine') {
      where.push('EXISTS (SELECT 1 FROM checkins m WHERE m.user_id = ? AND m.iata = a.iata)'); params.push(req.user.id);
    } else if (req.user && req.query.visited === 'notmine') {
      where.push('NOT EXISTS (SELECT 1 FROM checkins m WHERE m.user_id = ? AND m.iata = a.iata)'); params.push(req.user.id);
    }
    const sort = ['relevance', 'rating', 'checkins', 'name'].includes(req.query.sort)
      ? req.query.sort : (raw ? 'relevance' : 'checkins');
    const order = {
      relevance: 'm, a.type_rank, IFNULL(s.checkins, 0) DESC, a.scheduled DESC, a.search_name',
      rating: 's.avg_rating IS NULL, s.avg_rating DESC, IFNULL(s.rating_count, 0) DESC, a.type_rank, a.name',
      checkins: 'IFNULL(s.checkins, 0) DESC, a.type_rank, a.scheduled DESC, a.name',
      name: 'a.name COLLATE NOCASE, a.iata',
    }[sort];
    const rows = db.prepare(`
      SELECT ${AIRPORT_COLS('a', '')}, ${matchExpr} AS m,
             s.avg_rating, IFNULL(s.rating_count, 0) AS rating_count, IFNULL(s.checkins, 0) AS checkins
      FROM airports a
      LEFT JOIN (SELECT iata, COUNT(*) AS checkins, AVG(rating) AS avg_rating, COUNT(rating) AS rating_count
                 FROM checkins GROUP BY iata) s ON s.iata = a.iata
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

  r.get('/airports/:iata', h((req, res) => {
    const a = airportOr404(req.params.iata);
    const s = db.prepare(`
      SELECT COUNT(DISTINCT user_id) AS visitors, COUNT(*) AS checkins,
             AVG(rating) AS avg_rating, COUNT(rating) AS rating_count,
             ${SUB_RATINGS.map((k) => `AVG(r_${k}) AS s_${k}`).join(', ')},
             ${TRAVEL_CLASSES.map((k) => `SUM(travel_class = '${k}') AS cls_${k}`).join(', ')}
      FROM checkins WHERE iata = ?`).get(a.iata);
    const topAirlines = db.prepare(`
      SELECT al.iata, al.name, COUNT(*) AS n FROM checkins c JOIN airlines al ON al.iata = c.airline_iata
      WHERE c.iata = ? GROUP BY al.iata ORDER BY n DESC, al.name LIMIT 5`).all(a.iata);
    const stats = {
      visitors: s.visitors,
      checkins: s.checkins,
      avgRating: round2(s.avg_rating),
      ratingCount: s.rating_count,
      subAverages: Object.fromEntries(SUB_RATINGS.map((k) => [k, round2(s['s_' + k])])),
      topAirlines: topAirlines.map((x) => ({ airline: { iata: x.iata, name: x.name }, checkins: x.n })),
      classMix: Object.fromEntries(TRAVEL_CLASSES.map((k) => [k, s['cls_' + k] ?? 0])),
    };
    const photos = db.prepare(`SELECT p.* FROM photos p JOIN checkins c ON c.id = p.checkin_id
      WHERE c.iata = ? ORDER BY p.created_at DESC, p.id DESC LIMIT 12`).all(a.iata).map(photoFrom);
    let onMyWishlist = false;
    let myVisits = 0;
    if (req.user) {
      const me = db.prepare(`SELECT EXISTS (SELECT 1 FROM wishlist WHERE user_id = ? AND iata = ?) AS w,
        (SELECT COUNT(*) FROM checkins WHERE user_id = ? AND iata = ?) AS v`).get(req.user.id, a.iata, req.user.id, a.iata);
      onMyWishlist = !!me.w;
      myVisits = me.v;
    }
    res.json({
      ...airportFrom(a),
      countryName: countryNameSv(a.country),
      stats,
      lounges: loungesFor.all(a.iata).map(loungeFrom),
      photos,
      onMyWishlist,
      myVisits,
    });
  }));

  r.get('/airports/:iata/checkins', h((req, res) => {
    const a = airportOr404(req.params.iata);
    const { limit, offset } = paging(req.query);
    const rows = db.prepare(`${CHECKIN_SELECT} WHERE c.iata = ?
      ORDER BY c.visited_on DESC, c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`)
      .all(req.user?.id ?? -1, a.iata, limit, offset);
    res.json(checkinsWithPhotos(db, rows));
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
