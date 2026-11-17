// Månadsutmaningar: samma fyra utmaningar varje kalendermånad, räknade på visitedOn.
import { notify } from './notify.js';
import { todayStockholm, visibleCheckinsCte } from './badges.js';

export const CHALLENGES = [
  { id: 'new-airports', name: 'Nya horisonter', description: 'Besök 3 flygplatser du aldrig varit på förut', target: 3 },
  { id: 'countries', name: 'Landhoppare', description: 'Checka in i 2 olika länder', target: 2 },
  { id: 'reviewer', name: 'Månadens recensent', description: 'Skriv kommentar på 3 check-ins', target: 3 },
  { id: 'rater', name: 'Betygsättare', description: 'Sätt totalbetyg på 5 check-ins', target: 5 },
];

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const currentMonth = () => todayStockholm().slice(0, 7);

function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  return { from: `${month}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

/** Progress räknad på check-ins som tittaren får se (ägaren ser alla, SEC-04). */
function progress(db, userId, month, viewerId = userId) {
  const { from, to } = monthRange(month);
  const vc = visibleCheckinsCte(userId, viewerId);
  const r = db.prepare(`WITH vc AS (${vc.sql}) SELECT COUNT(DISTINCT a.country) AS countries, IFNULL(SUM(c.comment IS NOT NULL), 0) AS commented,
      IFNULL(SUM(c.rating IS NOT NULL), 0) AS rated
    FROM vc c JOIN airports a ON a.iata = c.iata WHERE c.visited_on BETWEEN ? AND ?`).get(...vc.params, from, to);
  const fresh = db.prepare(`WITH vc AS (${vc.sql}) SELECT COUNT(*) AS n FROM (SELECT iata, MIN(visited_on) AS first FROM vc
    GROUP BY iata) WHERE first BETWEEN ? AND ?`).get(...vc.params, from, to).n;
  return { 'new-airports': fresh, countries: r.countries, reviewer: r.commented, rater: r.rated };
}

/** Utmaningar med progress för en månad. */
export function getChallenges(db, userId, month = currentMonth(), viewerId = userId) {
  const own = viewerId === userId;
  const p = progress(db, userId, month, viewerId);
  // Andra ser bara klarmarkering som följer av det de själva får se.
  const done = own ? new Map(db.prepare('SELECT challenge_id, completed_at FROM user_challenges WHERE user_id = ? AND month = ?')
    .all(userId, month).map((x) => [x.challenge_id, x.completed_at])) : new Map();
  return CHALLENGES.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    progress: { current: Math.min(p[c.id], c.target), target: c.target },
    completed: done.has(c.id) || p[c.id] >= c.target,
    completedAt: done.get(c.id) ?? null,
  }));
}

/** Registrerar nyss klarade utmaningar (med notis). Klarade utmaningar tas inte tillbaka. */
export function syncChallenges(db, userId, month = currentMonth(), { notify: doNotify = true } = {}) {
  const p = progress(db, userId, month);
  const now = new Date().toISOString();
  const ins = db.prepare('INSERT OR IGNORE INTO user_challenges (user_id, challenge_id, month, completed_at) VALUES (?, ?, ?, ?)');
  const out = [];
  for (const c of CHALLENGES) {
    if (p[c.id] < c.target) continue;
    if (!ins.run(userId, c.id, month, now).changes) continue;
    out.push(c.id);
    if (doNotify) {
      notify(db, { userId, type: 'challenge_completed', groupKey: `challenge:${c.id}:${month}`, data: { challengeId: c.id, name: c.name, month } });
    }
  }
  return out;
}
