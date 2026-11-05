import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { openDb } from './db.js';
import { getSecret, optionalAuth, rateLimit } from './auth.js';
import { HttpError } from './util.js';
import authRoutes from './routes/auth.js';
import airportRoutes from './routes/airports.js';
import loungeRoutes from './routes/lounges.js';
import checkinRoutes from './routes/checkins.js';
import userRoutes from './routes/users.js';
import searchRoutes from './routes/search.js';
import exploreRoutes from './routes/explore.js';
import mapRoutes from './routes/maps.js';
import photoRoutes, { photoStore, uploadsStatic } from './routes/photos.js';

const DEFAULT_UPLOAD_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../data/uploads');

function securityHeaders(_req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; " +
      "script-src 'self'; connect-src 'self'; font-src 'self' data:; object-src 'none'; " +
      "base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  });
  if (process.env.NODE_ENV === 'production') {
    res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}

/**
 * Skapar Express-appen.
 * @param {object} opts
 * @param {string} [opts.dbPath] sökväg till SQLite-fil eller ':memory:'
 * @param {string} [opts.jwtSecret]
 * @param {string} [opts.staticDir] katalog med byggd klient (SPA)
 * @param {{windowMs:number,max:number}} [opts.authRateLimit]
 */
export function createApp({ dbPath, db, jwtSecret, staticDir, authRateLimit, uploadDir } = {}) {
  const database = db ?? openDb(dbPath);
  const secret = getSecret(jwtSecret);
  const photos = photoStore(uploadDir || process.env.UPLOAD_DIR || DEFAULT_UPLOAD_DIR);
  const app = express();
  app.locals.db = database;
  app.locals.secret = secret;
  app.locals.uploadDir = photos.uploadDir;

  app.disable('x-powered-by');
  app.set('etag', 'weak');
  app.use(compression({ threshold: 1024 }));
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);
  app.use(securityHeaders);
  if (process.env.NODE_ENV !== 'production' || process.env.CORS_ORIGIN) {
    app.use('/api', cors({ origin: process.env.CORS_ORIGIN || ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
  }
  app.use('/api', (_req, res, next) => {
    // Standard: får cachas men måste alltid valideras (ETag ger 304). Enskilda routes kan sätta annat.
    res.set('Cache-Control', 'private, no-cache');
    next();
  });
  app.use('/uploads', uploadsStatic(photos.uploadDir));
  app.use(express.json({ limit: '50kb' }));
  app.use('/api', optionalAuth(secret, database));

  const rl = authRateLimit ?? {
    windowMs: Number(process.env.AUTH_RATE_WINDOW_MS) || 15 * 60 * 1000,
    max: Number(process.env.AUTH_RATE_MAX) || 100,
  };
  app.use('/api/auth', rateLimit(rl));

  app.get('/api/health', (_req, res) => {
    const { n } = database.prepare('SELECT COUNT(*) AS n FROM airports').get();
    res.json({ ok: true, airports: n });
  });

  const ctx = { db: database, secret, photos };
  app.use('/api', authRoutes(ctx));
  app.use('/api', airportRoutes(ctx));
  app.use('/api', loungeRoutes(ctx));
  app.use('/api', checkinRoutes(ctx));
  app.use('/api', userRoutes(ctx));
  app.use('/api', searchRoutes(ctx));
  app.use('/api', exploreRoutes(ctx));
  app.use('/api', mapRoutes(ctx));
  app.use('/api', photoRoutes(ctx));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Okänd API-väg')));

  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.set('Cache-Control', 'no-cache');
      res.sendFile('index.html', { root: staticDir });
    });
  }

  // Felhanterare
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'För stor förfrågan' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Ogiltig JSON' });
    if (err?.status && err.status >= 400 && err.status < 500) {
      return res.status(err.status).json({ error: err.message || 'Felaktig förfrågan' });
    }
    console.error('[gatelog] Internt fel:', err);
    res.status(500).json({ error: 'Internt serverfel' });
  });

  return app;
}
