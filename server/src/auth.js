import jwt from 'jsonwebtoken';
import { HttpError } from './util.js';

const DEV_SECRET = 'gatelog-dev-secret-change-me';
let warned = false;

export function getSecret(explicit) {
  if (explicit) return explicit;
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (!warned && process.env.NODE_ENV !== 'test') {
    console.warn('[gatelog] VARNING: JWT_SECRET saknas i miljön - använder osäker dev-nyckel. Sätt JWT_SECRET i produktion.');
  }
  warned = true;
  return DEV_SECRET;
}

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

/** Enkel in-memory rate limit (fast fönster per IP). */
export function rateLimit({ windowMs, max }) {
  const hits = new Map();
  let lastSweep = Date.now();
  return (req, res, next) => {
    const now = Date.now();
    if (now - lastSweep > windowMs) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      lastSweep = now;
    }
    const key = req.ip || req.socket.remoteAddress || 'unknown';
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
      return res.status(429).json({ error: 'För många försök, vänta en stund och försök igen' });
    }
    next();
  };
}
