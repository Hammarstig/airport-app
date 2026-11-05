import jwt from 'jsonwebtoken';
import { HttpError } from './util.js';

export function signToken(secret, user) {
  return jwt.sign({ sub: String(user.id), username: user.username }, secret, { expiresIn: '30d', algorithm: 'HS256' });
}

/** Sätter req.user = {id, username} om giltig token finns. Ogiltig token ignoreras (anonym). */
export function optionalAuth(secret, db) {
  const findUser = db.prepare('SELECT id, username FROM users WHERE id = ?');
  return (req, _res, next) => {
    req.user = null;
    const hdr = req.get('authorization') || '';
    const m = /^Bearer\s+(.+)$/i.exec(hdr);
    if (m) {
      try {
        const payload = jwt.verify(m[1].trim(), secret, { algorithms: ['HS256'] });
        const u = findUser.get(Number(payload.sub));
        if (u) req.user = { id: u.id, username: u.username };
      } catch {
        /* ogiltig/utgången token -> anonym */
      }
    }
    next();
  };
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Inloggning krävs'));
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
