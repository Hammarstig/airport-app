// Enda stället som läser process.env. Se server/.env.example för alla variabler.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DEV_SECRET = 'gatelog-dev-secret-change-me-not-for-production';
const MIN = 60_000;

export class ConfigError extends Error {}

const num = (v, def) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) && n > 0 ? n : def;
};

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const production = nodeEnv === 'production';
  const test = nodeEnv === 'test';
  // I tester skalas skrivgränserna upp så att testsviter inte slår i dem (egna gränser kan skickas till createApp).
  const scale = num(env.WRITE_RATE_SCALE, test ? 1000 : 1);
  const lim = (windowMs, max) => ({ windowMs, max: Math.ceil(max * scale) });
  return {
    nodeEnv,
    production,
    port: num(env.PORT, 8787),
    dbPath: env.DB_PATH || resolve(here, '../data/gatelog.db'),
    uploadDir: env.UPLOAD_DIR || resolve(here, '../data/uploads'),
    staticDir: env.STATIC_DIR || resolve(here, '../../client/dist'),
    jwtSecret: env.JWT_SECRET || null,
    trustProxy: env.TRUST_PROXY || null,
    corsOrigin: env.CORS_ORIGIN || null,
    // Topplistor för perioder (vecka/månad/år) cachas en kort stund; tid i ms.
    rankingCacheMs: env.RANKING_CACHE_MS !== undefined ? Math.max(0, Number(env.RANKING_CACHE_MS) || 0) : (test ? 0 : 30_000),
    logRequests: env.LOG_REQUESTS ? env.LOG_REQUESTS !== '0' : !test,
    authRateLimit: { windowMs: num(env.AUTH_RATE_WINDOW_MS, 15 * MIN), max: num(env.AUTH_RATE_MAX, test ? 100000 : 100) },
    writeRateLimits: {
      all: lim(15 * MIN, num(env.WRITE_RATE_MAX, 300)),
      checkin: lim(60 * MIN, 60),
      photo: lim(60 * MIN, 20),
      comment: lim(60 * MIN, 60),
      follow: lim(60 * MIN, 100),
      like: lim(60 * MIN, 300),
      review: lim(60 * MIN, 30),
    },
  };
}

/** Väljer JWT-nyckel. I produktion krävs en riktig nyckel, annars vägrar servern starta. */
export function resolveSecret(cfg, explicit, log = console) {
  const secret = explicit || cfg.jwtSecret;
  if (cfg.production) {
    if (!secret || secret.length < 32) {
      throw new ConfigError('JWT_SECRET måste vara satt (minst 32 tecken) när NODE_ENV=production');
    }
    return secret;
  }
  if (!secret) {
    if (cfg.nodeEnv !== 'test') log.warn('[gatelog] VARNING: JWT_SECRET saknas - använder osäker dev-nyckel. Krävs i produktion.');
    return DEV_SECRET;
  }
  return secret;
}
