// Topplistor: resenärer (period/scope/egen placering) och bäst betygsatta flygplatser (Bayesianskt snitt).
import { Router } from 'express';
import { h, bad, HttpError, paging, enumParam, round2, code2, SUB_RATINGS, AIRPORT_COLS, airportFrom, USER_COLS, userFrom } from '../util.js';
import { globalMeans, bayesSql, categoryCols, AIRPORT_PRIOR } from '../stats.js';
import { todayStockholm, mondayOf } from '../badges.js';
import { checkinVisible } from '../visibility.js';
import { visibleStats } from '../publicstats.js';

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

/** Rankad lista [{ user_id, value, rank }]. Globala periodlistor (anonym vy) cachas i cacheMs. */
const caches = new WeakMap();
function ranking(db, opts, cacheMs = 0) {
  // Vänlistan beror på tittaren och är liten: räknas alltid direkt.
  if (opts.from === null || !cacheMs || opts.scope === 'friends') return computeRanking(db, opts);
  const key = `${opts.metric}|${opts.from}|${opts.to}|${opts.scope === 'country' ? opts.country : ''}`;
  let cache = caches.get(db);
  if (!cache) caches.set(db, (cache = new Map()));
  let hit = cache.get(key);
  if (!hit || hit.at < Date.now() - cacheMs) {
    hit = { at: Date.now(), rows: computeRanking(db, { ...opts, scope: opts.scope === 'country' ? 'country' : 'global' }) };
    cache.set(key, hit);
    if (cache.size > 100) cache.delete(cache.keys().next().value);
  }
  return hit.rows;
}

/**
 * Räknar en topplista på check-ins som tittaren får se (SEC-01): globala och landslistor på den anonyma
 * vyn (publika, publicerade check-ins), vänlistan på det tittaren själv får se hos sina vänner.
 */
function computeRanking(db, { metric, scope, country, viewerId, from, to }) {
  const friends = scope === 'friends';
  let rows;
  if (from === null && scope === 'global') {
    rows = db.prepare(`SELECT user_id, ${metric} AS value FROM user_public_stats WHERE ${metric} > 0`).all();
  } else if (from === null && friends && ['xp', 'reviews'].includes(metric)) {
    const ids = db.prepare("SELECT ? AS id UNION SELECT followee_id FROM follows WHERE follower_id = ? AND status = 'accepted'")
      .all(viewerId, viewerId).map((x) => x.id);
    rows = ids.map((id) => ({ user_id: id, value: visibleStats(db, id, id === viewerId ? id : viewerId)[metric] }));
  } else {
    const vis = checkinVisible(friends ? viewerId : null, { c: 'x', u: 'u' });
    const where = [vis.sql];
    const params = [...vis.params];
    if (from !== null) { where.push('x.visited_on BETWEEN ? AND ?'); params.push(from, to); }
    if (scope === 'country') { where.push('a.country = ?'); params.push(country); }
    if (friends) {
      where.push("x.user_id IN (SELECT ? UNION SELECT followee_id FROM follows WHERE follower_id = ? AND status = 'accepted')");
      params.push(viewerId, viewerId);
    }
    rows = db.prepare(`SELECT x.user_id, ${PERIOD_EXPR[metric]} AS value FROM checkins x
      JOIN users u ON u.id = x.user_id JOIN airports a ON a.iata = x.iata
      WHERE ${where.join(' AND ')} GROUP BY x.user_id`).all(...params);
  }
  rows = rows.filter((r) => r.value > 0);
  rows.sort((a, b) => b.value - a.value || a.user_id - b.user_id);
  return assignRanks(rows);
}

/**
 * Privata profiler syns bara för sig själva och sina godkända följare; blockerade döljs.
 * Returnerar en funktion som filtrerar och rankar om en lista.
 */
function privacyFilter(db, viewerId) {
  const hidden = new Set(db.prepare(`SELECT id FROM users u WHERE (u.is_private = 1 AND u.id <> ? AND NOT EXISTS (
      SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followee_id = u.id AND f.status = 'accepted'))
    OR EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = u.id AND b.blocked_id = ?) OR (b.blocker_id = ? AND b.blocked_id = u.id))`)
    .all(viewerId ?? -1, viewerId ?? -1, viewerId ?? -1, viewerId ?? -1).map((r) => r.id));
  return (rows) => (hidden.size ? assignRanks(rows.filter((r) => !hidden.has(r.user_id)).map((r) => ({ ...r }))) : rows);
}

export function userRanking(db, query, viewerId, cacheMs = 0) {
  const metric = enumParam(query, 'metric', METRICS, 'airports');
  const period = enumParam(query, 'period', PERIODS, 'all');
  const scope = enumParam(query, 'scope', ['global', 'friends', 'country'], 'global');
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
  const seen = privacyFilter(db, viewerId);
  const list = seen(ranking(db, { metric, scope, country, viewerId, from: range.from, to: range.to }, cacheMs));
  const prev = range.prev
    ? new Map(seen(ranking(db, { metric, scope, country, viewerId, ...range.prev }, cacheMs)).map((r) => [r.user_id, r.rank]))
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
    const category = enumParam(req.query, 'category', ['overall', ...SUB_RATINGS], 'overall');
    const c = categoryCols(category);
    const score = bayesSql(`s.${c.sum}`, `s.${c.n}`, globalMeans(db)[category], AIRPORT_PRIOR);
    const country = code2(req.query.country);
    const continent = code2(req.query.continent);
    const type = enumParam(req.query, 'type', ['large', 'medium', 'small'], null);
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
