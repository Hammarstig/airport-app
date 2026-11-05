// Märken räknas fram från data (ingen egen tabell). earnedAt = visitedOn för den check-in/recension
// som (i kronologisk ordning efter besöksdatum) gjorde att målet nåddes.

const MAIN_CONTINENTS = new Set(['EU', 'AS', 'AF', 'NA', 'SA', 'OC']);
const NORDIC = new Set(['SE', 'NO', 'DK', 'FI', 'IS']);

export const BADGE_DEFS = [
  { id: 'first-checkin', name: 'Första check-in', description: 'Gör din första check-in', icon: '🛫', target: 1, m: (s) => s.total },
  { id: 'airports-10', name: '10 flygplatser', description: 'Besök 10 unika flygplatser', icon: '🧭', target: 10, m: (s) => s.airports.size },
  { id: 'airports-25', name: '25 flygplatser', description: 'Besök 25 unika flygplatser', icon: '🗺️', target: 25, m: (s) => s.airports.size },
  { id: 'airports-50', name: '50 flygplatser', description: 'Besök 50 unika flygplatser', icon: '✈️', target: 50, m: (s) => s.airports.size },
  { id: 'airports-100', name: '100 flygplatser', description: 'Besök 100 unika flygplatser', icon: '🏆', target: 100, m: (s) => s.airports.size },
  { id: 'countries-5', name: '5 länder', description: 'Besök flygplatser i 5 länder', icon: '🌍', target: 5, m: (s) => s.countries.size },
  { id: 'countries-15', name: '15 länder', description: 'Besök flygplatser i 15 länder', icon: '🌎', target: 15, m: (s) => s.countries.size },
  { id: 'countries-30', name: '30 länder', description: 'Besök flygplatser i 30 länder', icon: '🌏', target: 30, m: (s) => s.countries.size },
  { id: 'all-continents', name: 'Alla kontinenter', description: 'Besök alla 6 bebodda kontinenter (Antarktis räknas inte)', icon: '🌐', target: 6, m: (s) => s.continents.size },
  { id: 'nordic', name: 'Nordisk resenär', description: 'Besök Sverige, Norge, Danmark, Finland och Island', icon: '🧊', target: 5, m: (s) => s.nordic.size },
  { id: 'transfer-king', name: 'Transferkung', description: 'Logga 10 transfer-check-ins', icon: '🔁', target: 10, m: (s) => s.transfers },
  { id: 'home-turf', name: 'Hemmaplan', description: 'Gör 5 check-ins på din hemmaflygplats', icon: '🏠', target: 5, m: (s) => s.home },
  { id: 'reviewer', name: 'Recensent', description: 'Skriv kommentar på 20 check-ins', icon: '✍️', target: 20, m: (s) => s.comments },
  { id: 'lounge-expert', name: 'Loungeexpert', description: 'Recensera 5 lounger', icon: '🛋️', target: 5, m: (s) => s.reviews, source: 'reviews' },
];

export function computeBadges(db, userId) {
  const user = db.prepare('SELECT home_iata FROM users WHERE id = ?').get(userId);
  const home = user?.home_iata ?? null;
  const checkins = db.prepare(`
    SELECT c.iata, c.visited_on, c.kind, c.comment IS NOT NULL AS has_comment, a.country, a.continent
    FROM checkins c JOIN airports a ON a.iata = c.iata
    WHERE c.user_id = ? ORDER BY c.visited_on, c.id`).all(userId);
  const reviews = db.prepare('SELECT visited_on FROM lounge_reviews WHERE user_id = ? ORDER BY visited_on, id').all(userId);

  const s = { total: 0, airports: new Set(), countries: new Set(), continents: new Set(), nordic: new Set(), transfers: 0, home: 0, comments: 0, reviews: 0 };
  const earned = {};
  const check = (source, date) => {
    for (const d of BADGE_DEFS) {
      if ((d.source ?? 'checkins') !== source || earned[d.id]) continue;
      if (d.m(s) >= d.target) earned[d.id] = date;
    }
  };
  for (const c of checkins) {
    s.total++;
    s.airports.add(c.iata);
    if (c.country) s.countries.add(c.country);
    if (MAIN_CONTINENTS.has(c.continent)) s.continents.add(c.continent);
    if (NORDIC.has(c.country)) s.nordic.add(c.country);
    if (c.kind === 'transfer') s.transfers++;
    if (home && c.iata === home) s.home++;
    if (c.has_comment) s.comments++;
    check('checkins', c.visited_on);
  }
  for (const r of reviews) {
    s.reviews++;
    check('reviews', r.visited_on);
  }

  return BADGE_DEFS.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    icon: d.icon,
    earnedAt: earned[d.id] ?? null,
    progress: { current: Math.min(d.m(s), d.target), target: d.target },
  }));
}

export function earnedIds(badges) {
  return new Set(badges.filter((b) => b.earnedAt).map((b) => b.id));
}
