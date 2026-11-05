import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { openDb } from './db.js';
import { loadConfig, resolveSecret } from './config.js';
import { optionalAuth, rateLimit } from './auth.js';
import { HttpError } from './util.js';
import authRoutes from './routes/auth.js';
import airportRoutes from './routes/airports.js';
import loungeRoutes from './routes/lounges.js';
import checkinRoutes from './routes/checkins.js';
import userRoutes from './routes/users.js';
import searchRoutes from './routes/search.js';
import exploreRoutes from './routes/explore.js';
import mapRoutes from './routes/maps.js';
import rankingRoutes from './routes/rankings.js';
import socialRoutes from './routes/social.js';
import accountRoutes from './routes/account.js';
import photoRoutes, { photoStore, uploadsStatic } from './routes/photos.js';

const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  // Typsnitten är självhostade under /fonts (client/public/fonts).
  "font-src 'self' data:",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

function securityHeaders(production) {
  return (_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(self)',
      'Content-Security-Policy': CSP,
    });
    if (production) res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    next();
  };
}

/** Request-id och en JSON-loggrad per anrop (metod, väg utan query, status, tid, användare). */
function requestLog(enabled) {
  return (req, res, next) => {
    const incoming = req.get('x-request-id');
    req.id = incoming && /^[\w.-]{1,64}$/.test(incoming) ? incoming : randomUUID();
    res.set('X-Request-Id', req.id);
    if (enabled) {
      const start = process.hrtime.bigint();
      res.on('finish', () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        console.log(JSON.stringify({
          t: new Date().toISOString(), level: res.statusCode >= 500 ? 'error' : 'info', reqId: req.id,
          method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, ms: Math.round(ms * 10) / 10,
          user: req.user?.id ?? null,
        }));
      });
    }
    next();
  };
}

/**
 * Skapar Express-appen.
 * @param {object} [opts]
 * @param {string} [opts.dbPath] sökväg till SQLite-fil eller ':memory:'
 * @param {import('node:sqlite').DatabaseSync} [opts.db] färdig databas (i stället för dbPath)
 * @param {string} [opts.jwtSecret]
 * @param {string} [opts.staticDir] katalog med byggd klient (SPA)
 * @param {string} [opts.uploadDir]
 * @param {{windowMs:number,max:number}} [opts.authRateLimit]
 * @param {Record<string,{windowMs:number,max:number}>} [opts.writeRateLimits] ersätter valda skrivgränser
 * @param {Record<string,string>} [opts.env] miljövariabler (default process.env)
 */
export function createApp(opts = {}) {
  const cfg = loadConfig(opts.env ?? process.env);
  const secret = resolveSecret(cfg, opts.jwtSecret);
  const database = opts.db ?? openDb(opts.dbPath ?? cfg.dbPath);
  const photos = photoStore(opts.uploadDir || cfg.uploadDir);
  const staticDir = opts.staticDir;
  const app = express();
  app.locals.db = database;
  app.locals.secret = secret;
  app.locals.uploadDir = photos.uploadDir;
  app.locals.config = cfg;

  app.disable('x-powered-by');
  app.set('etag', 'weak');
  if (cfg.trustProxy) app.set('trust proxy', /^\d+$/.test(cfg.trustProxy) ? Number(cfg.trustProxy) : cfg.trustProxy);
  app.use(requestLog(cfg.logRequests));
  app.use(compression({ threshold: 1024 }));
  app.use(securityHeaders(cfg.production));
  if (!cfg.production || cfg.corsOrigin) {
    app.use('/api', cors({ origin: cfg.corsOrigin || ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
  }
  app.use('/api', (_req, res, next) => {
    // Standard: får cachas men måste alltid valideras (ETag ger 304). Enskilda routes kan sätta annat.
    res.set('Cache-Control', 'private, no-cache');
    next();
  });
  app.use('/uploads', uploadsStatic(photos.uploadDir));
  app.use(express.json({ limit: '50kb' }));
  app.use('/api', optionalAuth(secret, database));

  app.use('/api/auth', rateLimit({ ...(opts.authRateLimit ?? cfg.authRateLimit), name: 'auth' }));
  const wl = { ...cfg.writeRateLimits, ...(opts.writeRateLimits ?? {}) };
  const limiters = Object.fromEntries(Object.entries(wl).map(([k, v]) => [k, rateLimit({ ...v, name: k })]));
  // Generell gräns för alla skrivande anrop (utom inloggning/registrering som har egen).
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS' || req.path.startsWith('/auth/')) return next();
    limiters.all(req, res, next);
  });

  app.get('/api/health', (_req, res) => {
    const { n } = database.prepare('SELECT COUNT(*) AS n FROM airports').get();
    res.json({ ok: true, airports: n });
  });

  const ctx = { db: database, secret, photos, limiters, config: cfg };
  for (const routes of [authRoutes, airportRoutes, loungeRoutes, checkinRoutes, userRoutes, searchRoutes,
    exploreRoutes, mapRoutes, rankingRoutes, socialRoutes, accountRoutes, photoRoutes]) {
    app.use('/api', routes(ctx));
  }

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Okänd API-väg')));

  if (staticDir && existsSync(staticDir)) {
    // Hashade byggfiler och typsnitt ändras aldrig under samma namn.
    app.use(['/assets', '/fonts'], express.static(staticDir, { index: false, maxAge: '1y', immutable: true, fallthrough: true }));
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
      res.set('Cache-Control', 'no-cache');
      res.sendFile('index.html', { root: staticDir });
    });
  }

  // Felhanterare
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'För stor förfrågan' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Ogiltig JSON' });
    if (err?.status && err.status >= 400 && err.status < 500) {
      return res.status(err.status).json({ error: err.message || 'Felaktig förfrågan' });
    }
    console.error(JSON.stringify({
      t: new Date().toISOString(), level: 'error', reqId: req.id, method: req.method, path: req.originalUrl.split('?')[0],
      error: err?.message, stack: err?.stack,
    }));
    res.status(500).json({ error: 'Internt serverfel', requestId: req.id });
  });

  return app;
}
