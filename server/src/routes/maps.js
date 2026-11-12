// v1.3: kartvyer med täckningsgrad. En aggregerad SQL-fråga per anrop.
import { Router } from 'express';
import { h, notFound, code2, enumParam } from '../util.js';
import { checkinVisible, requireProfileAccess } from '../visibility.js';
import { countryNameSv } from '../db/index.js';

const CONTINENT_NAMES = {
  EU: 'Europa', AS: 'Asien', AF: 'Afrika', NA: 'Nordamerika', SA: 'Sydamerika', OC: 'Oceanien', AN: 'Antarktis',
};
const pct = (v, t) => (t ? Math.round((v / t) * 1000) / 10 : 0);

export default function mapRoutes({ db }) {
  const r = Router();
  const userByName = db.prepare('SELECT * FROM users WHERE username = ?');

  /** Användarens id efter behörighetskontroll. */
  function userId(req) {
    const u = userByName.get(String(req.params.username).toLowerCase());
    if (!u) throw notFound('Användaren finns inte');
    requireProfileAccess(db, req.user?.id, u);
    return u.id;
  }
  const scopeAll = (q) => enumParam(q, 'scope', ['scheduled', 'all'], 'scheduled') === 'all';

  /**
   * Besökta flygplatser (iata, visits) som tittaren får se: ägaren läser förberäknad statistik,
   * andra räknas på synliga check-ins.
   */
  function visitedSql(req, uid) {
    if (req.user?.id === uid) return { sql: 'SELECT iata, visits FROM user_airports WHERE user_id = ?', params: [uid] };
    const vis = checkinVisible(req.user?.id);
    return {
      sql: `SELECT c.iata, COUNT(*) AS visits FROM checkins c JOIN users u ON u.id = c.user_id
        WHERE c.user_id = ? AND ${vis.sql} GROUP BY c.iata`,
      params: [uid, ...vis.params],
    };
  }
  const privateCache = (res) => res.set('Cache-Control', 'private, max-age=30');

  const overview = (v) => db.prepare(`
    SELECT a.country, a.continent, COUNT(*) AS total, COUNT(v.iata) AS visited
    FROM airports a
    LEFT JOIN (${v.sql}) v ON v.iata = a.iata
    WHERE (? = 1 OR a.scheduled = 1) AND a.country IS NOT NULL
    GROUP BY a.country, a.continent`);

  r.get('/users/:username/map', h((req, res) => {
    const uid = userId(req);
    const v = visitedSql(req, uid);
    const rows = overview(v).all(...v.params, scopeAll(req.query) ? 1 : 0);
    const countries = new Map();
    const continents = new Map();
    let visited = 0;
    let total = 0;
    for (const row of rows) {
      visited += row.visited;
      total += row.total;
      const k = continents.get(row.continent) ?? { code: row.continent, visited: 0, total: 0 };
      k.visited += row.visited;
      k.total += row.total;
      continents.set(row.continent, k);
      const c = countries.get(row.country) ?? { code: row.country, continent: row.continent, best: 0, visited: 0, total: 0 };
      if (row.total > c.best) { c.best = row.total; c.continent = row.continent; }
      c.visited += row.visited;
      c.total += row.total;
      countries.set(row.country, c);
    }
    privateCache(res);
    res.json({
      totals: { visited, total, pct: pct(visited, total) },
      continents: [...continents.values()]
        .map((k) => ({ code: k.code, name: CONTINENT_NAMES[k.code] ?? k.code, visited: k.visited, total: k.total, pct: pct(k.visited, k.total) }))
        .sort((a, b) => b.total - a.total),
      countries: [...countries.values()]
        .filter((c) => c.total > 0)
        .map((c) => ({ code: c.code, name: countryNameSv(c.code), continent: c.continent, visited: c.visited, total: c.total, pct: pct(c.visited, c.total) }))
        .sort((a, b) => b.visited - a.visited || b.pct - a.pct || a.name.localeCompare(b.name, 'sv')),
    });
  }));

  // Alla flygplatser i landet inom scope, plus besökta utanför scope (visas på kartan men räknas inte i total).
  const countryAirports = (v) => db.prepare(`
    SELECT a.iata, a.name, a.city, a.lat, a.lon, a.type, a.scheduled, a.region, a.region_name,
           IFNULL(v.visits, 0) AS visits, (? = 1 OR a.scheduled = 1) AS in_scope
    FROM airports a
    LEFT JOIN (${v.sql}) v ON v.iata = a.iata
    WHERE a.country = ? AND (? = 1 OR a.scheduled = 1 OR v.visits IS NOT NULL)
    ORDER BY a.type_rank, a.name`);

  r.get('/users/:username/map/:country', h((req, res) => {
    const uid = userId(req);
    const code = code2(req.params.country);
    const all = scopeAll(req.query) ? 1 : 0;
    const v = visitedSql(req, uid);
    const rows = code ? countryAirports(v).all(all, ...v.params, code, all) : [];
    if (!rows.length) {
      const exists = code && db.prepare('SELECT 1 FROM airports WHERE country = ? LIMIT 1').get(code);
      if (!exists) throw notFound('Landet finns inte');
    }
    const regions = new Map();
    let visited = 0;
    let total = 0;
    for (const a of rows) {
      if (!a.in_scope) continue;
      const v = a.visits > 0 ? 1 : 0;
      visited += v;
      total += 1;
      const key = a.region ?? '';
      const g = regions.get(key) ?? { code: a.region ?? null, name: a.region_name ?? 'Okänd region', visited: 0, total: 0 };
      g.visited += v;
      g.total += 1;
      regions.set(key, g);
    }
    privateCache(res);
    res.json({
      country: { code, name: countryNameSv(code), visited, total, pct: pct(visited, total) },
      regions: [...regions.values()]
        .map((g) => ({ ...g, pct: pct(g.visited, g.total) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'sv')),
      airports: rows.map((a) => ({
        iata: a.iata,
        name: a.name,
        city: a.city ?? null,
        lat: a.lat,
        lon: a.lon,
        type: a.type,
        scheduled: !!a.scheduled,
        region: a.region ?? null,
        regionName: a.region_name ?? null,
        visited: a.visits > 0,
        visits: a.visits,
      })),
    });
  }));

  return r;
}
