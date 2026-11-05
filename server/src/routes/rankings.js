// Topplistor: resenärer (period/scope/egen placering) och bäst betygsatta flygplatser (Bayesianskt snitt).
import { Router } from 'express';
import { h, bad, HttpError, paging, round2, code2, SUB_RATINGS, AIRPORT_COLS, airportFrom, USER_COLS, userFrom } from '../util.js';
import { globalMeans, bayesSql, categoryCols, AIRPORT_PRIOR } from '../stats.js';
import { todayStockholm, mondayOf } from '../badges.js';

const METRICS = ['airports', 'countries', 'continents', 'checkins', 'reviews', 'xp'];
const PERIODS = ['week', 'month', 'year', 'all'];
const PERIOD_EXPR = {
  airports: 'COUNT(DISTINCT x.iata)',
  countries: 'COUNT(DISTINCT a.country)',
  continents: 'COUNT(DISTINCT a.continent)',
  checkins: 'COUNT(*)',
};

const iso = (d) => d.toISOString().slice(0, 10);
/** Kalenderperiod som innehåller `day` (YYYY-MM-DD), samt föregående period. */
export function periodRange(period, day = todayStockholm()) {
  const d = new Date(day + 'T00:00:00Z');
  if (period === 'week') {
    const from = new Date(mondayOf(day) + 'T00:00:00Z');
    const to = new Date(from.getTime() + 6 * 86400000);
    const prevFrom = new Date(from.getTime() - 7 * 86400000);
    return { from: iso(from), to: iso(to), prev: { from: iso(prevFrom), to: iso(new Date(from.getTime() - 86400000)) } };
  }
  if (period === 'month') {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    return {
      from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))),
      prev: { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) },
    };
  }
  if (period === 'year') {
    const y = d.getUTCFullYear();
    return { from: `${y}-01-01`, to: `${y}-12-31`, prev: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` } };
  }
  return { from: null, to: null, prev: null };
}

/** Sätter tävlingsrankning (lika värde ger samma plats) på en sorterad lista. */
function assignRanks(rows) {
  let rank = 0;
  rows.forEach((r, i) => {
    if (i === 0 || r.value !== rows[i - 1].value) rank = i + 1;
    r.rank = rank;
  });
  return rows;
}

/**
 * Rankad lista [{ user_id, value, rank }]. Periodlistor räknas globalt och cachas (cacheMs);
 * vänlistan filtreras fram ur den globala listan eftersom värdena inte beror på scope.
 */
const caches = new WeakMap();
function ranking(db, opts, cacheMs = 0) {
  if (opts.from === null || !cacheMs) return computeRanking(db, opts);
  const key = `${opts.metric}|${opts.from}|${opts.to}|${opts.scope === 'country' ? opts.country : ''}`;
  let cache = caches.get(db);
  if (!cache) caches.set(db, (cache = new Map()));
  let hit = cache.get(key);
  if (!hit || hit.at < Date.now() - cacheMs) {
    hit = { at: Date.now(), rows: computeRanking(db, { ...opts, scope: opts.scope === 'country' ? 'country' : 'global' }) };
    cache.set(key, hit);
    if (cache.size > 100) cache.delete(cache.keys().next().value);
  }
  if (opts.scope !== 'friends') return hit.rows;
  const friends = new Set(db.prepare('SELECT followee_id AS id FROM follows WHERE follower_id = ?').all(opts.viewerId).map((r) => r.id));
  friends.add(opts.viewerId);
  return assignRanks(hit.rows.filter((r) => friends.has(r.user_id)).map((r) => ({ ...r })));
}

function computeRanking(db, { metric, scope, country, viewerId, from, to }) {
  const where = [];
  const params = [];
  if (scope === 'friends') {
    where.push('x.user_id IN (SELECT ? UNION SELECT followee_id FROM follows WHERE follower_id = ?)');
    params.push(viewerId, viewerId);
  }
  let sql;
  if (from === null && scope !== 'country') {
    // Hela tiden: direkt från förberäknad statistik.
    sql = `SELECT x.user_id, x.${metric} AS value FROM user_stats x WHERE x.${metric} > 0
      ${where.length ? 'AND ' + where.join(' AND ') : ''}`;
  } else if (from === null) {
    // Hela tiden inom ett land: från user_airports (en rad per användare och flygplats).
    const expr = { airports: 'COUNT(*)', countries: '1', continents: 'COUNT(DISTINCT a.continent)', checkins: 'SUM(x.visits)' }[metric];
    sql = `SELECT x.user_id, ${expr} AS value FROM user_airports x JOIN airports a ON a.iata = x.iata
      WHERE a.country = ? ${where.length ? 'AND ' + where.join(' AND ') : ''} GROUP BY x.user_id`;
    params.unshift(country);
  } else {
    sql = `SELECT x.user_id, ${PERIOD_EXPR[metric]} AS value FROM checkins x
      JOIN airports a ON a.iata = x.iata
      WHERE x.visited_on BETWEEN ? AND ? ${scope === 'country' ? 'AND a.country = ?' : ''}
      ${where.length ? 'AND ' + where.join(' AND ') : ''} GROUP BY x.user_id`;
    params.unshift(...(scope === 'country' ? [from, to, country] : [from, to]));
  }
  const rows = db.prepare(sql).all(...params).filter((r) => r.value > 0);
  rows.sort((a, b) => b.value - a.value || a.user_id - b.user_id);
  return assignRanks(rows);
}

export function userRanking(db, query, viewerId, cacheMs = 0) {
  const metric = METRICS.includes(query.metric) ? query.metric : 'airports';
  const period = PERIODS.includes(query.period) ? query.period : 'all';
  const scope = ['global', 'friends', 'country'].includes(query.scope) ? query.scope : 'global';
  const { limit } = paging(query, { defLimit: 50, maxLimit: 200 });
  if (scope === 'friends' && !viewerId) throw new HttpError(401, 'Inloggning krävs för scope=friends');
  let country = null;
  if (scope === 'country') {
    country = code2(query.country);
    if (!country) throw bad('scope=country kräver country (landskod)');
  }
  if (['xp', 'reviews'].includes(metric) && (period !== 'all' || scope === 'country')) {
    throw bad(`metric=${metric} stöds bara för period=all och scope global/friends`);
  }
  const range = periodRange(period);
  const list = ranking(db, { metric, scope, country, viewerId, from: range.from, to: range.to }, cacheMs);
  const prev = range.prev
    ? new Map(ranking(db, { metric, scope, country, viewerId, ...range.prev }, cacheMs).map((r) => [r.user_id, r.rank]))
    : null;
  const change = (r) => (prev && prev.has(r.user_id) ? prev.get(r.user_id) - r.rank : null);

  const myIdx = viewerId ? list.findIndex((r) => r.user_id === viewerId) : -1;
  const aroundRows = myIdx >= 0 ? list.slice(Math.max(0, myIdx - 2), myIdx + 3) : [];
  const top = list.slice(0, limit);
  const ids = [...new Set([...top, ...aroundRows].map((r) => r.user_id))];
  const users = new Map();
  if (ids.length) {
    for (const u of db.prepare(`SELECT u.id, ${USER_COLS('u', '')} FROM users u WHERE u.id IN (${ids.map(() => '?').join(',')})`).all(...ids)) {
      users.set(u.id, userFrom(u));
    }
  }
  const entry = (r) => ({ rank: r.rank, user: users.get(r.user_id), value: r.value, change: change(r) });
  return {
    metric,
    period,
    from: range.from,
    to: range.to,
    items: top.map(entry),
    me: myIdx >= 0 ? { rank: list[myIdx].rank, value: list[myIdx].value, change: change(list[myIdx]) } : null,
    around: aroundRows.map(entry),
  };
}

export default function rankingRoutes({ db, config }) {
  const r = Router();
  const cacheMs = config?.rankingCacheMs ?? 0;

  r.get('/rankings/users', h((req, res) => {
    res.json(userRanking(db, req.query, req.user?.id ?? null, cacheMs));
  }));

  // Äldre form (array). Tar samma period/scope/country som /rankings/users.
  r.get('/leaderboard', h((req, res) => {
    const out = userRanking(db, req.query, req.user?.id ?? null, cacheMs);
    res.json(out.items.map(({ rank, user, value }) => ({ rank, user, value })));
  }));

  r.get('/rankings/airports', h((req, res) => {
    let minRatings = parseInt(req.query.minRatings, 10);
    if (!Number.isFinite(minRatings) || minRatings < 1) minRatings = 1;
    const { limit } = paging(req.query, { defLimit: 50, maxLimit: 200 });
    const category = SUB_RATINGS.includes(req.query.category) ? req.query.category : 'overall';
    const c = categoryCols(category);
    const score = bayesSql(`s.${c.sum}`, `s.${c.n}`, globalMeans(db)[category], AIRPORT_PRIOR);
    const country = code2(req.query.country);
    const continent = code2(req.query.continent);
    const type = ['large', 'medium', 'small'].includes(req.query.type) ? req.query.type : null;
    const rows = db.prepare(`
      SELECT RANK() OVER (ORDER BY t.score DESC) AS rnk, t.* FROM (
        SELECT ${AIRPORT_COLS('a', '')}, s.${c.sum} * 1.0 / s.${c.n} AS avg_rating, s.${c.n} AS rating_count, ${score} AS score
        FROM airport_stats s JOIN airports a ON a.iata = s.iata
        WHERE s.${c.n} >= ? AND (? IS NULL OR a.country = ?) AND (? IS NULL OR a.continent = ?) AND (? IS NULL OR a.type = ?)
      ) t ORDER BY t.score DESC, t.rating_count DESC, t.iata LIMIT ?`)
      .all(minRatings, country, country, continent, continent, type, type, limit);
    res.json(rows.map((row) => ({
      rank: row.rnk,
      airport: airportFrom(row),
      avgRating: round2(row.avg_rating),
      score: round2(row.score),
      ratingCount: row.rating_count,
    })));
  }));

  return r;
}
