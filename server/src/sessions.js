// Sessioner (API v3): kortlivad access-token (JWT, 15 min) + roterande refresh-token i HttpOnly-cookie.
// Varje inloggning är en rad i `sessions`; access-token bär sessionens id (sid) och kontrolleras mot
// tabellen vid varje anrop, så att utloggning, lösenordsbyte och "logga ut överallt" gäller direkt.
import jwt from 'jsonwebtoken';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError } from './util.js';

export const ACCESS_TTL_S = 15 * 60;
export const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;
export const REFRESH_COOKIE = 'gl_refresh';
const GRACE_MS = 30_000; // samtidiga refresh-anrop från flera flikar

const sha = (s) => createHash('sha256').update(s).digest('hex');
const sameHash = (a, b) => !!a && !!b && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function signAccess(secret, user, sid) {
  return jwt.sign({ sub: String(user.id), sid, username: user.username }, secret, { expiresIn: ACCESS_TTL_S, algorithm: 'HS256' });
}

/** Skapar en session och returnerar { sid, refresh } där refresh = "<sid>.<hemlighet>". */
export function createSession(db, userId, client) {
  const sid = randomBytes(16).toString('hex');
  const secret = randomBytes(32).toString('base64url');
  const now = new Date();
  db.prepare(`INSERT INTO sessions (id, user_id, refresh_hash, client, created_at, last_used_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(sid, userId, sha(secret), clip(client), now.toISOString(), now.toISOString(),
    new Date(now.getTime() + REFRESH_TTL_MS).toISOString());
  return { sid, refresh: `${sid}.${secret}` };
}

const clip = (s) => (typeof s === 'string' ? s.slice(0, 160) : null);

/**
 * Validerar och roterar en refresh-token. Returnerar { session, refresh | null }.
 * refresh är null när en nyss roterad token används inom kort tid (ingen ny cookie behövs).
 * En äldre, redan roterad token tyder på stöld: hela sessionen återkallas.
 */
export function rotateRefresh(db, token) {
  const m = /^([a-f0-9]{32})\.([A-Za-z0-9_-]{20,100})$/.exec(typeof token === 'string' ? token : '');
  if (!m) throw new HttpError(401, 'Ogiltig session', { code: 'session_revoked' });
  const [, sid, secret] = m;
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sid);
  const nowIso = new Date().toISOString();
  if (!s || s.revoked_at || s.expires_at <= nowIso) throw new HttpError(401, 'Sessionen har gått ut', { code: 'session_revoked' });
  const h = sha(secret);
  if (sameHash(h, s.refresh_hash)) {
    const next = randomBytes(32).toString('base64url');
    db.prepare('UPDATE sessions SET prev_hash = refresh_hash, refresh_hash = ?, rotated_at = ?, last_used_at = ? WHERE id = ?')
      .run(sha(next), nowIso, nowIso, sid);
    return { session: s, refresh: `${sid}.${next}` };
  }
  if (sameHash(h, s.prev_hash) && Date.parse(s.rotated_at) > Date.now() - GRACE_MS) {
    return { session: s, refresh: null };
  }
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(nowIso, sid);
  const err = new HttpError(401, 'Sessionen har återkallats', { code: 'session_revoked' });
  err.reuse = { sessionId: sid, userId: s.user_id };
  throw err;
}

/**
 * Kontrollerar en refresh-token utan att rotera. Returnerar sessionen om hemligheten stämmer
 * (aktuell eller föregående inom fönstret), annars null. Används vid utloggning så att bara
 * den som har cookien kan logga ut sessionen.
 */
export function verifyRefresh(db, token) {
  const m = /^([a-f0-9]{32})\.([A-Za-z0-9_-]{20,100})$/.exec(typeof token === 'string' ? token : '');
  if (!m) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(m[1]);
  if (!s) return null;
  const h = sha(m[2]);
  if (sameHash(h, s.refresh_hash)) return s;
  if (sameHash(h, s.prev_hash) && Date.parse(s.rotated_at) > Date.now() - GRACE_MS) return s;
  return null;
}

export function revokeSession(db, sid) {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(new Date().toISOString(), sid);
}

export function revokeAll(db, userId, { except } = {}) {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id <> ?')
    .run(new Date().toISOString(), userId, except ?? '');
}

export function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const raw = part.slice(i + 1).trim();
    // Trasig procentkodning ger 4xx längre fram, aldrig 500 (SEC-15).
    try { out[part.slice(0, i).trim()] = decodeURIComponent(raw); } catch { out[part.slice(0, i).trim()] = raw; }
  }
  return out;
}

export function setRefreshCookie(res, value, production) {
  res.cookie(REFRESH_COOKIE, value, {
    httpOnly: true, sameSite: 'strict', secure: production, path: '/api/auth', maxAge: REFRESH_TTL_MS,
  });
}

export function clearRefreshCookie(res, production) {
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, sameSite: 'strict', secure: production, path: '/api/auth' });
}
