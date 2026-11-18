import jwt from 'jsonwebtoken';
import { HttpError } from './util.js';

/**
 * Sätter req.user = { id, username, sid } om access-token är giltig och sessionen aktiv.
 * Annars är anropet anonymt och req.authError anger varför (token_expired, session_revoked).
 */
export function optionalAuth(secret, db) {
  const findSession = db.prepare(`SELECT s.user_id, s.revoked_at, s.expires_at, u.username
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`);
  return (req, _res, next) => {
    req.user = null;
    req.authError = null;
    const m = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (m) {
      try {
        const payload = jwt.verify(m[1].trim(), secret, { algorithms: ['HS256'] });
        const s = typeof payload.sid === 'string' ? findSession.get(payload.sid) : null;
        if (s && !s.revoked_at && s.expires_at > new Date().toISOString() && String(s.user_id) === payload.sub) {
          req.user = { id: s.user_id, username: s.username, sid: payload.sid };
        } else {
          req.authError = 'session_revoked';
        }
      } catch (e) {
        req.authError = e?.name === 'TokenExpiredError' ? 'token_expired' : 'invalid_token';
      }
    }
    next();
  };
}

export function requireAuth(req, _res, next) {
  if (!req.user) {
    return next(new HttpError(401, req.authError === 'token_expired' ? 'Inloggningen har gått ut' : 'Inloggning krävs',
      req.authError ? { code: req.authError } : {}));
  }
  next();
}

/**
 * Enkel in-memory rate limit med fast fönster. Nyckel: inloggad användare, annars IP
 * (bakom proxy måste TRUST_PROXY sättas så att req.ip blir klientens adress).
 */
export function rateLimit({ windowMs, max, name = 'default' }) {
  const hits = new Map();
  let lastSweep = Date.now();
  return (req, res, next) => {
    if (req.method === 'OPTIONS') return next(); // förfrågningar före CORS räknas inte (SEC-28)
    const now = Date.now();
    if (now - lastSweep > windowMs) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      lastSweep = now;
    }
    const key = req.user ? `u:${req.user.id}` : `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    let e = hits.get(key);
    if (!e || e.resetAt <= now) {
      e = { count: 0, resetAt: now + windowMs };
      hits.set(key, e);
    }
    e.count++;
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(Math.max(0, max - e.count)));
    if (e.count > max) {
      req.app?.locals?.securityLog?.(req, 'rate_limited', { limiter: name });
      res.set('Retry-After', String(Math.ceil((e.resetAt - now) / 1000)));
      return res.status(429).json({ error: name === 'auth'
        ? 'För många försök, vänta en stund och försök igen'
        : name === 'read' ? 'För många sökningar på kort tid, vänta en stund och försök igen'
          : 'För många ändringar på kort tid, vänta en stund och försök igen' });
    }
    next();
  };
}

/**
 * Spärr för misslyckade inloggningar (SEC-16).
 * - Konto+IP (`a:`-nycklar): hård spärr efter `perAccountIp` fel.
 * - Konto totalt (`t:`-nycklar): ingen hård spärr vid `perAccount` utan växande fördröjning
 *   (`delayStepMs` per fel över gränsen, högst `maxDelayMs`), så att en angripare från andra IP
 *   inte kan låsa ute ägaren. Först vid `accountHardMax` fel spärras kontot helt, utom för en
 *   känd enhet (giltig refresh-cookie för kontot).
 * `blocked(keys, { knownDevice })` ger sekunder att vänta, `delay(keys)` ms att fördröja svaret.
 */
export function failureGuard({ windowMs, perAccountIp, perAccount, accountHardMax = perAccount * 20, delayStepMs = 250, maxDelayMs = 5000 }) {
  const hits = new Map();
  const live = (k, now) => {
    const e = hits.get(k);
    if (e && e.resetAt <= now) { hits.delete(k); return null; }
    return e ?? null;
  };
  return {
    blocked(keys, { knownDevice = false } = {}) {
      const now = Date.now();
      let wait = 0;
      for (const k of keys) {
        const e = live(k, now);
        if (!e) continue;
        const max = k.startsWith('a:') ? perAccountIp : (knownDevice ? Infinity : accountHardMax);
        if (e.count >= max) wait = Math.max(wait, Math.ceil((e.resetAt - now) / 1000));
      }
      return wait;
    },
    delay(keys) {
      const now = Date.now();
      let ms = 0;
      for (const k of keys) {
        if (k.startsWith('a:')) continue;
        const e = live(k, now);
        if (e && e.count >= perAccount) ms = Math.max(ms, Math.min(maxDelayMs, (e.count - perAccount + 1) * delayStepMs));
      }
      return ms;
    },
    count(key) {
      return live(key, Date.now())?.count ?? 0;
    },
    fail(keys) {
      const now = Date.now();
      if (hits.size > 50_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      for (const k of keys) {
        const e = live(k, now) ?? { count: 0, resetAt: now + windowMs };
        e.count++;
        hits.set(k, e);
      }
    },
    reset(key) {
      hits.delete(key);
    },
  };
}
