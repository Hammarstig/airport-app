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
      res.set('Retry-After', String(Math.ceil((e.resetAt - now) / 1000)));
      return res.status(429).json({ error: name === 'auth'
        ? 'För många försök, vänta en stund och försök igen'
        : 'För många ändringar på kort tid, vänta en stund och försök igen' });
    }
    next();
  };
}
