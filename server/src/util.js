// Gemensamma hjälpfunktioner: fel, validering, mappning av rader till API-objekt.
import { createHmac, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  /** @param {number} status @param {string} message @param {object} [extra] fält som läggs till i felsvaret (t.ex. code) */
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
  set code(v) { this.extra = { ...this.extra, code: v }; }
  get code() { return this.extra?.code; }
}
export const bad = (msg) => new HttpError(400, msg);
export const notFound = (msg = 'Hittades inte') => new HttpError(404, msg);

/** Wrapper så att kastade fel i synkrona/asynkrona handlers hamnar i felhanteraren. */
export const h = (fn) => (req, res, next) => {
  try {
    const r = fn(req, res, next);
    if (r && typeof r.catch === 'function') r.catch(next);
  } catch (err) {
    next(err);
  }
};

/**
 * Uppräknad frågeparameter: saknas den ges `def`, okänt värde ger 400 med listan över giltiga värden.
 */
export function enumParam(query, name, allowed, def) {
  const v = query[name];
  if (v === undefined || v === '') return def;
  if (typeof v !== 'string' || !allowed.includes(v)) {
    throw new HttpError(400, `${name} måste vara en av ${allowed.join(', ')}`, { allowed });
  }
  return v;
}

export function round2(x) {
  return x == null ? null : Math.round(x * 100) / 100;
}

export function paging(query, { defLimit = 20, maxLimit = 100 } = {}) {
  let limit = parseInt(query.limit, 10);
  let offset = parseInt(query.offset, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = defLimit;
  if (limit > maxLimit) limit = maxLimit;
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  return { limit, offset };
}

export function normIata(v) {
  return typeof v === 'string' ? v.trim().toUpperCase() : '';
}

// ---- Datum ----
function dateInZone(tz) {
  // sv-SE ger formatet YYYY-MM-DD
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
/** Senaste tillåtna datum: dagens datum i UTC eller Europe/Stockholm, det som ligger senast. */
export function maxAllowedDate() {
  const a = dateInZone('UTC');
  const b = dateInZone('Europe/Stockholm');
  return a > b ? a : b;
}

export function validateDate(v, field = 'visitedOn') {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad(`${field} måste vara ett datum YYYY-MM-DD`);
  const d = new Date(v + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw bad(`${field} är inget giltigt datum`);
  if (v < '1900-01-01') throw bad(`${field} är för långt bak i tiden`);
  if (v > maxAllowedDate()) throw bad(`${field} får inte vara i framtiden`);
  return v;
}

// ---- Text ----
// Styrtecken och riktningsstyrning (bidi, SEC-20) tas bort ur all fritext.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/g;

export function cleanText(v, { field, max, required = false, min = 0 }) {
  if (v === undefined || v === null) {
    if (required) throw bad(`${field} krävs`);
    return null;
  }
  if (typeof v !== 'string') throw bad(`${field} måste vara text`);
  const s = v.replace(CONTROL, '').trim();
  if (!s) {
    if (required) throw bad(`${field} krävs`);
    return null;
  }
  if (s.length > max) throw bad(`${field} får vara max ${max} tecken`);
  if (s.length < min) throw bad(`${field} måste vara minst ${min} tecken`);
  return s;
}

export function validateHalfStep(v, { field, min, max, required = false }) {
  if (v === undefined || v === null) {
    if (required) throw bad(`${field} krävs`);
    return null;
  }
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || !Number.isInteger(v * 2)) {
    throw bad(`${field} måste vara ${min}-${max} i steg om 0.5`);
  }
  return v;
}

export const SUB_RATINGS = ['security', 'cleanliness', 'food', 'wifi', 'transfer', 'lounges'];

export function validateRatings(v) {
  const out = Object.fromEntries(SUB_RATINGS.map((k) => [k, null]));
  if (v === undefined || v === null) return out;
  if (typeof v !== 'object' || Array.isArray(v)) throw bad('ratings måste vara ett objekt');
  for (const k of SUB_RATINGS) {
    const x = v[k];
    if (x === undefined || x === null) continue;
    if (!Number.isInteger(x) || x < 1 || x > 5) throw bad(`ratings.${k} måste vara ett heltal 1-5`);
    out[k] = x;
  }
  return out;
}

export const KINDS = ['departure', 'arrival', 'transfer', 'layover'];

// ---- HTML ----
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- Mappning ----
export const AIRPORT_COLS = (t, p) =>
  ['iata', 'icao', 'name', 'city', 'country', 'continent', 'lat', 'lon', 'type', 'region', 'region_name']
    .map((c) => `${t}.${c} AS ${p}${c}`)
    .join(', ');

export function airportFrom(row, p = '') {
  return {
    iata: row[p + 'iata'],
    icao: row[p + 'icao'] ?? null,
    name: row[p + 'name'],
    city: row[p + 'city'] ?? null,
    country: row[p + 'country'] ?? null,
    continent: row[p + 'continent'] ?? null,
    lat: row[p + 'lat'] ?? null,
    lon: row[p + 'lon'] ?? null,
    type: row[p + 'type'],
    region: row[p + 'region'] ?? null,
    regionName: row[p + 'region_name'] ?? null,
  };
}

export const USER_COLS = (t, p) =>
  `${t}.username AS ${p}username, ${t}.display_name AS ${p}display_name,
   CASE WHEN ${t}.hide_home = 1 THEN NULL ELSE ${t}.home_iata END AS ${p}home_iata,
   IFNULL((SELECT ps.level FROM user_public_stats ps WHERE ps.user_id = ${t}.id), 1) AS ${p}level`;

export function userFrom(row, p = '') {
  return {
    username: row[p + 'username'],
    displayName: row[p + 'display_name'],
    homeIata: row[p + 'home_iata'] ?? null,
    level: row[p + 'level'] ?? 1,
  };
}

/**
 * UserSummary för en users-rad (SELECT *). För andra än ägaren (standard) visas nivån från den publika
 * statistiken och hemmaflygplatsen döljs om användaren valt det; `self` ger egen nivå och hemmaflygplats.
 */
export function userSummary(db, userRow, { self = false } = {}) {
  const s = self
    ? db.prepare('SELECT level FROM user_stats WHERE user_id = ?').get(userRow.id)
    : db.prepare('SELECT level FROM user_public_stats WHERE user_id = ?').get(userRow.id);
  const base = userFrom(userRow);
  if (!self && userRow.hide_home) base.homeIata = null;
  return { ...base, level: s?.level ?? 1 };
}

// ---- Nivåer och XP ----
const LEVEL_TITLES = [
  [1, 'Passagerare'], [3, 'Resenär'], [5, 'Pendlare'], [8, 'Globetrotter'], [12, 'Världsvan'],
  [16, 'Flygplatsveteran'], [20, 'Legend'],
];
export const levelThreshold = (L) => 25 * L * (L - 1);
export function levelInfo(xp) {
  const x = Math.max(0, xp || 0);
  let level = Math.floor((1 + Math.sqrt(1 + (4 * x) / 25)) / 2);
  while (levelThreshold(level + 1) <= x) level++;
  while (level > 1 && levelThreshold(level) > x) level--;
  const title = LEVEL_TITLES.filter(([min]) => level >= min).pop()[1];
  return { level, title, xp: x, levelXp: levelThreshold(level), nextLevelXp: levelThreshold(level + 1) };
}

// ---- Delade SQL-hjälpare ----
export const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);
export const code2 = (v) => (typeof v === 'string' && /^[A-Za-z]{2}$/.test(v.trim()) ? v.trim().toUpperCase() : null);

export const LOUNGE_SELECT = `
  SELECT lo.id, lo.iata, lo.name, lo.terminal, lo.review_count,
         CASE WHEN lo.review_count > 0 THEN lo.rating_sum / lo.review_count END AS avg_rating
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


/** SELECT-del för Checkin. Första parametern är tittarens user-id (eller -1) för likedByMe. */
export const CHECKIN_SELECT = `
  SELECT c.id, c.visited_on, c.kind, c.rating, c.r_security, c.r_cleanliness, c.r_food, c.r_wifi,
         c.r_transfer, c.r_lounges, c.comment, c.created_at, c.user_id,
         c.travel_class, c.flight_number, c.edited_at, c.visibility, c.source, IFNULL(c.publish_at, c.created_at) AS publish_at, al.iata AS al_iata, al.name AS al_name,
         lo.id AS lo_id, lo.name AS lo_name, lo.terminal AS lo_terminal,
         ${USER_COLS('u', 'u_')}, ${AIRPORT_COLS('a', 'a_')},
         (SELECT COUNT(*) FROM likes l WHERE l.checkin_id = c.id) AS like_count,
         (SELECT COUNT(*) FROM comments m WHERE m.checkin_id = c.id) AS comment_count,
         EXISTS (SELECT 1 FROM likes l WHERE l.checkin_id = c.id AND l.user_id = ?) AS liked_by_me
  FROM checkins c
  JOIN users u ON u.id = c.user_id
  JOIN airports a ON a.iata = c.iata
  LEFT JOIN airlines al ON al.iata = c.airline_iata
  LEFT JOIN lounges lo ON lo.id = c.lounge_id`;

export function checkinFrom(row, viewerId = null) {
  return {
    id: row.id,
    user: userFrom(row, 'u_'),
    airport: airportFrom(row, 'a_'),
    visitedOn: row.visited_on,
    kind: row.kind,
    rating: row.rating ?? null,
    ratings: Object.fromEntries(SUB_RATINGS.map((k) => [k, row['r_' + k] ?? null])),
    comment: row.comment ?? null,
    likes: row.like_count,
    likedByMe: !!row.liked_by_me,
    commentCount: row.comment_count ?? 0,
    // Andra än ägaren ser publiceringstiden, så att en fördröjning inte avslöjas i efterhand (SEC-04).
    createdAt: viewerId === row.user_id ? row.created_at : (row.publish_at ?? row.created_at),
    editedAt: row.edited_at ?? null,
    visibility: row.visibility ?? 'public',
    source: row.source ?? 'app',
    publishAt: row.publish_at ?? row.created_at,
    airline: row.al_iata ? { iata: row.al_iata, name: row.al_name } : null,
    travelClass: row.travel_class ?? null,
    lounge: row.lo_id ? { id: row.lo_id, name: row.lo_name, terminal: row.lo_terminal ?? null } : null,
    flightNumber: row.flight_number ?? null,
    photos: [],
  };
}

export const TRAVEL_CLASSES = ['economy', 'premium_economy', 'business', 'first'];

// Foton (SEC-09): foton som en utloggad får se har publik cache. Övriga kräver mediacookien
// (gl_media, HttpOnly, Path=/uploads) som bär sessions-id och signatur och förnyas vid varje
// inloggning och refresh. Nyckeln sätts av createApp.
let mediaKey = null;
export const MEDIA_COOKIE = 'gl_media';
export const MEDIA_TTL_S = 3600;
export function setPhotoKey(secret) { mediaKey = createHmac('sha256', String(secret)).update('gatelog-media').digest(); }
const mediaSig = (sid, exp) => createHmac('sha256', mediaKey).update(`${sid}|${exp}`).digest('base64url').slice(0, 22);
export function mediaToken(sid) {
  const exp = Math.floor(Date.now() / 1000) + MEDIA_TTL_S;
  return `${sid}.${exp}.${mediaSig(sid, exp)}`;
}
/** Sessions-id ur en giltig mediacookie, annars null (sessionens status kontrolleras av anroparen). */
export function mediaSession(token) {
  const m = /^([a-f0-9]{32})\.(\d{1,12})\.([A-Za-z0-9_-]{22})$/.exec(typeof token === 'string' ? token : '');
  if (!m || !mediaKey || Number(m[2]) * 1000 < Date.now()) return null;
  const want = Buffer.from(mediaSig(m[1], Number(m[2])));
  const got = Buffer.from(m[3]);
  return want.length === got.length && timingSafeEqual(want, got) ? m[1] : null;
}
/** SQL (check-in `c`, ägare `u`, en parameter: nu) för att en utloggad får se fotot. */
export const PHOTO_PUBLIC_SQL = "(IFNULL(c.publish_at, c.created_at) <= ? AND c.visibility = 'public' AND u.is_private = 0)";
export const photoUrl = (filename) => '/uploads/' + filename;

export function photoFrom(row) {
  return {
    id: row.id,
    url: photoUrl(row.filename),
    width: row.width ?? null,
    height: row.height ?? null,
    createdAt: row.created_at,
  };
}

/** Mappar Checkin-rader och hämtar foton för alla i en fråga. */
export function checkinsWithPhotos(db, rows, viewerId = null) {
  const list = rows.map((r) => checkinFrom(r, viewerId));
  if (!list.length) return list;
  const byId = new Map(list.map((c) => [c.id, c]));
  const ids = [...byId.keys()];
  const photos = db.prepare(`SELECT p.id, p.checkin_id, p.filename, p.width, p.height, p.created_at, ${PHOTO_PUBLIC_SQL} AS pub
    FROM photos p JOIN checkins c ON c.id = p.checkin_id JOIN users u ON u.id = c.user_id
    WHERE p.checkin_id IN (${ids.map(() => '?').join(',')}) ORDER BY p.id`).all(new Date().toISOString(), ...ids);
  for (const p of photos) byId.get(p.checkin_id).photos.push(photoFrom(p));
  return list;
}
