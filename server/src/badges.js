// Märken med nivåer, XP/nivå och streaks (API v2).
// Nivåer lagras i user_badges när de nås (syncBadges) och tas inte tillbaka. Måtten räknas fram ur
// förberäknad statistik (user_stats, user_airports) med ett fåtal indexerade frågor per användare.
import { levelInfo } from './util.js';

let rarityCache = null;
export const TIERS = ['bronze', 'silver', 'gold', 'platinum'];
const NORDIC = ['SE', 'NO', 'DK', 'FI', 'IS'];
const MAIN_CONTINENTS = ['EU', 'AS', 'AF', 'NA', 'SA', 'OC'];

export const BADGE_DEFS = [
  { id: 'checkins', name: 'Incheckad', description: 'Gör check-ins', category: 'traveller', tiers: [1, 25, 100, 250], m: 'checkins' },
  { id: 'airports', name: 'Flygplatssamlare', description: 'Besök unika flygplatser', category: 'explorer', tiers: [10, 25, 50, 100], m: 'airports' },
  { id: 'countries', name: 'Gränslös', description: 'Besök flygplatser i olika länder', category: 'explorer', tiers: [5, 15, 30, 50], m: 'countries' },
  { id: 'continents', name: 'Världsresenär', description: 'Besök bebodda kontinenter (Antarktis räknas inte)', category: 'explorer', tiers: [2, 3, 4, 6], m: 'continents' },
  { id: 'nordic', name: 'Nordisk resenär', description: 'Besök Sverige, Norge, Danmark, Finland och Island', category: 'explorer', tiers: [2, 3, 4, 5], m: 'nordic' },
  { id: 'hubs', name: 'Hubbjägare', description: 'Besök stora flygplatser', category: 'explorer', tiers: [5, 15, 30, 60], m: 'hubs' },
  { id: 'alphabet', name: 'IATA-alfabetet', description: 'Samla IATA-koder som börjar på olika bokstäver', category: 'explorer', tiers: [5, 10, 18, 26], m: 'alphabet' },
  { id: 'regions-se', name: 'Länsresenär', description: 'Besök flygplatser i olika svenska län', category: 'explorer', tiers: [2, 4, 8, 12], m: 'regionsSe' },
  { id: 'airlines', name: 'Bolagsbytare', description: 'Flyg med olika flygbolag', category: 'traveller', tiers: [3, 10, 20, 40], m: 'airlines' },
  { id: 'front-cabin', name: 'Främre kabinen', description: 'Check-ins i business eller first', category: 'traveller', tiers: [1, 5, 15, 30], m: 'frontCabin' },
  { id: 'transfer-king', name: 'Transferkung', description: 'Logga transfer-check-ins', category: 'traveller', tiers: [3, 10, 25, 50], m: 'transfers' },
  { id: 'home-turf', name: 'Hemmaplan', description: 'Check-ins på din hemmaflygplats', category: 'traveller', tiers: [5, 15, 30, 60], m: 'home' },
  { id: 'streak', name: 'Vanefluga', description: 'Veckor i rad med minst en check-in (längsta svit)', category: 'traveller', tiers: [2, 4, 8, 16], m: 'longestStreak' },
  { id: 'reviewer', name: 'Recensent', description: 'Check-ins med kommentar', category: 'social', tiers: [5, 20, 50, 100], m: 'commented' },
  { id: 'lounge-expert', name: 'Loungeexpert', description: 'Recensera lounger', category: 'social', tiers: [1, 5, 15, 30], m: 'reviews' },
  { id: 'photographer', name: 'Fotograf', description: 'Ladda upp foton', category: 'social', tiers: [1, 10, 30, 75], m: 'photos' },
  { id: 'popular', name: 'Populär', description: 'Få gilla på dina check-ins', category: 'social', tiers: [5, 25, 100, 250], m: 'likesReceived' },
  { id: 'conversationalist', name: 'Samtalare', description: 'Skriv kommentarer på check-ins', category: 'social', tiers: [5, 25, 100, 250], m: 'commentsWritten' },
];
const BY_ID = new Map(BADGE_DEFS.map((d) => [d.id, d]));
export const badgeDef = (id) => BY_ID.get(id);
export const tierName = (level) => (level >= 1 ? TIERS[level - 1] : null);

// ---- Datum (veckor i Europe/Stockholm) ----
export function todayStockholm() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
const DAY = 86400000;
/** Måndagen (YYYY-MM-DD) i veckan för ett datum. */
export function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const wd = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - wd * DAY).toISOString().slice(0, 10);
}

/** Streak i veckor. `mondays` = sorterade unika måndagar (YYYY-MM-DD) med minst en check-in. */
export function streakFrom(mondays, today = todayStockholm()) {
  const weeks = mondays.map((m) => Math.round(Date.parse(m + 'T00:00:00Z') / (7 * DAY)));
  let longest = 0;
  let run = 0;
  for (let i = 0; i < weeks.length; i++) {
    run = i > 0 && weeks[i] === weeks[i - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const thisW = Math.round(Date.parse(mondayOf(today) + 'T00:00:00Z') / (7 * DAY));
  const set = new Set(weeks);
  const thisWeek = set.has(thisW);
  let current = 0;
  for (let w = thisWeek ? thisW : thisW - 1; set.has(w); w--) current++;
  return { current, longest, thisWeek };
}

export function userStreak(db, userId) {
  const rows = db.prepare(`SELECT DISTINCT date(visited_on, '-' || ((CAST(strftime('%w', visited_on) AS INTEGER) + 6) % 7) || ' days') AS monday
    FROM checkins WHERE user_id = ? ORDER BY monday`).all(userId);
  return streakFrom(rows.map((r) => r.monday));
}

/** Alla mått som märkena bygger på. */
export function userMetrics(db, userId) {
  const s = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId) ?? {};
  const home = db.prepare('SELECT home_iata FROM users WHERE id = ?').get(userId)?.home_iata ?? null;
  const ph = (list) => list.map(() => '?').join(', ');
  const a = db.prepare(`
    SELECT IFNULL(SUM(a.type = 'large'), 0) AS hubs,
      COUNT(DISTINCT substr(ua.iata, 1, 1)) AS alphabet,
      COUNT(DISTINCT CASE WHEN a.country = 'SE' THEN a.region END) AS regions_se,
      COUNT(DISTINCT CASE WHEN a.country IN (${ph(NORDIC)}) THEN a.country END) AS nordic,
      COUNT(DISTINCT CASE WHEN a.continent IN (${ph(MAIN_CONTINENTS)}) THEN a.continent END) AS continents,
      IFNULL(SUM(CASE WHEN ua.iata = ? THEN ua.visits END), 0) AS home
    FROM user_airports ua JOIN airports a ON a.iata = ua.iata WHERE ua.user_id = ?`)
    .get(...NORDIC, ...MAIN_CONTINENTS, home, userId);
  const airlines = db.prepare('SELECT COUNT(DISTINCT airline_iata) AS n FROM checkins WHERE user_id = ?').get(userId).n;
  const streak = userStreak(db, userId);
  return {
    checkins: s.checkins ?? 0,
    airports: s.airports ?? 0,
    countries: s.countries ?? 0,
    continents: a.continents,
    nordic: a.nordic,
    hubs: a.hubs,
    alphabet: a.alphabet,
    regionsSe: a.regions_se,
    airlines,
    frontCabin: s.front_cabin ?? 0,
    transfers: s.transfers ?? 0,
    home: a.home,
    longestStreak: streak.longest,
    commented: s.commented ?? 0,
    reviews: s.reviews ?? 0,
    photos: s.photos ?? 0,
    likesReceived: s.likes_received ?? 0,
    commentsWritten: s.comments_written ?? 0,
    xp: s.xp ?? 0,
    streak,
  };
}

/**
 * Registrerar nya märkesnivåer för användaren. Returnerar [{ badgeId, tierLevel }] för de märken där
 * en ny högsta nivå nåddes. Med notify skapas en notis per sådant märke.
 */
export function syncBadges(db, userId, { notify = false, metrics } = {}) {
  const m = metrics ?? userMetrics(db, userId);
  const have = new Map();
  for (const r of db.prepare('SELECT badge_id, MAX(tier_level) AS t FROM user_badges WHERE user_id = ? GROUP BY badge_id').all(userId)) {
    have.set(r.badge_id, r.t);
  }
  const now = new Date().toISOString();
  const ins = db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id, tier_level, earned_at) VALUES (?, ?, ?, ?)');
  const note = db.prepare(`INSERT INTO notifications (user_id, type, badge_id, badge_tier, created_at)
    VALUES (?, 'badge', ?, ?, ?)`);
  const out = [];
  for (const d of BADGE_DEFS) {
    const value = m[d.m] ?? 0;
    const reached = d.tiers.filter((t) => value >= t).length;
    const before = have.get(d.id) ?? 0;
    if (reached <= before) continue;
    for (let t = before + 1; t <= reached; t++) ins.run(userId, d.id, t, now);
    out.push({ badgeId: d.id, tierLevel: reached });
    rarityCache = null;
    if (notify) note.run(userId, d.id, reached, now);
  }
  return out;
}

function rarity(db) {
  if (rarityCache && rarityCache.db === db && rarityCache.at > Date.now() - 30_000) return rarityCache.value;
  const total = db.prepare('SELECT COUNT(*) AS n FROM users').get().n || 1;
  const value = new Map(db.prepare('SELECT badge_id, COUNT(*) AS n FROM user_badges WHERE tier_level = 1 GROUP BY badge_id').all()
    .map((r) => [r.badge_id, Math.round((r.n / total) * 1000) / 10]));
  rarityCache = { db, at: Date.now(), value };
  return value;
}

export function badgeObject(def, value, earnedRows, rarityMap) {
  const earned = new Map(earnedRows.map((r) => [r.tier_level, r.earned_at]));
  const tierLevel = earned.size ? Math.max(...earned.keys()) : 0;
  const next = def.tiers[Math.min(tierLevel, def.tiers.length - 1)];
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    category: def.category,
    tier: tierName(tierLevel),
    tierLevel,
    earnedAt: tierLevel ? earned.get(tierLevel) : null,
    tiers: def.tiers.map((target, i) => ({ tier: TIERS[i], target, earnedAt: earned.get(i + 1) ?? null })),
    progress: { current: Math.min(value, next), target: next },
    rarity: rarityMap.get(def.id) ?? 0,
  };
}

/** Alla märken för en användare (synkar först så att nivåer som redan nåtts registreras). */
export function getBadges(db, userId, { metrics } = {}) {
  const m = metrics ?? userMetrics(db, userId);
  syncBadges(db, userId, { metrics: m });
  const rows = db.prepare('SELECT badge_id, tier_level, earned_at FROM user_badges WHERE user_id = ?').all(userId);
  const byBadge = new Map();
  for (const r of rows) {
    if (!byBadge.has(r.badge_id)) byBadge.set(r.badge_id, []);
    byBadge.get(r.badge_id).push(r);
  }
  const rm = rarity(db);
  return BADGE_DEFS.map((d) => badgeObject(d, m[d.m] ?? 0, byBadge.get(d.id) ?? [], rm));
}

/** Synkar märken efter en händelse och returnerar Badge-objekt för de nya nivåerna (med notiser). */
export function awardBadges(db, userId) {
  const m = userMetrics(db, userId);
  const fresh = syncBadges(db, userId, { notify: true, metrics: m });
  if (!fresh.length) return [];
  const ids = new Set(fresh.map((f) => f.badgeId));
  return getBadges(db, userId, { metrics: m }).filter((b) => ids.has(b.id));
}

export function userLevel(db, userId) {
  const xp = db.prepare('SELECT xp FROM user_stats WHERE user_id = ?').get(userId)?.xp ?? 0;
  return levelInfo(xp);
}
