// Gemensamma hjälpare för säkerhetstesterna (docs/SECURITY-REVIEW.md).
// Appen startas i processen med PRODUKTIONSKONFIGURATION (NODE_ENV=production, egen JWT-nyckel,
// fördröjd publicering och dold hemmaflygplats som förval) mot en tillfällig databas.
// Web Push ersätts av en uppsamlare så att inga riktiga utskick görs, men endpoint-validering och
// payload testas på riktigt.
//
// Kör alla: node --disable-warning=ExperimentalWarning --test "tests/security/*.test.mjs"
//
// Konvention: ett test som visar ett ÖPPET fynd markeras { todo: 'SEC-xx' } och påstår det SÄKRA
// beteendet. Det rapporteras då som "todo" (sviten blir inte röd). När fyndet är åtgärdat tas todo
// bort och testet blir ett vanligt regressionstest.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from '../../server/src/app.js';

export const PASSWORD = 'Sakert-Flyg-2026!';

/**
 * Startar en server. `env` läggs ovanpå produktionsmiljön. `limits: true` behåller produktionens
 * rate limits för inloggning, annars höjs de så att funktionstester inte slår i dem.
 */
export async function startServer({ env = {}, limits = false, ...opts } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gatelog-sec-'));
  const pushed = [];
  const fullEnv = {
    NODE_ENV: 'production',
    JWT_SECRET: randomBytes(48).toString('base64url'),
    LOG_REQUESTS: '0',
    RANKING_CACHE_MS: '0',
    MODERATORS: 'modbob',
    ...(limits ? {} : { AUTH_RATE_MAX: '100000', LOGIN_FAIL_MAX: '100000', LOGIN_FAIL_ACCOUNT_MAX: '100000', WRITE_RATE_SCALE: '1000' }),
    ...env,
  };
  const app = createApp({
    dbPath: join(dir, 'sec.db'),
    uploadDir: join(dir, 'uploads'),
    env: fullEnv,
    pushSender: async (sub, payload) => { pushed.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) }); },
    ...opts,
  });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function api(method, path, { token, body, cookie, headers = {}, raw = false } = {}) {
    const h = { ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    if (cookie) h.Cookie = cookie;
    let payload;
    if (body instanceof FormData || typeof body === 'string' || body instanceof Uint8Array) payload = body;
    else if (body !== undefined) {
      h['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(base + path, { method, headers: h, body: payload, redirect: 'manual' });
    if (raw) return res;
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers, text };
  }

  let seq = 0;
  /** Registrerar en användare. `privacy` skickas som privacy-objektet vid registrering. */
  async function user(prefix = 'u', { privacy, homeIata, password = PASSWORD, username } = {}) {
    seq += 1;
    const name = username ?? `${prefix}_${seq}_${randomBytes(3).toString('hex')}`.slice(0, 20).toLowerCase();
    const r = await api('POST', '/api/auth/register', { body: { username: name, password, privacy, homeIata } });
    if (r.status !== 201) throw new Error(`register ${name}: ${r.status} ${JSON.stringify(r.body)}`);
    return { username: name, token: r.body.token, cookie: refreshCookie(r), id: app.locals.db.prepare('SELECT id FROM users WHERE username = ?').get(name).id };
  }

  async function checkin(u, extra = {}) {
    const r = await api('POST', '/api/checkins', {
      token: u.token, body: { iata: 'GOT', visitedOn: daysAgo(1), kind: 'departure', ...extra },
    });
    if (r.status !== 201) throw new Error(`checkin: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  }

  async function follow(a, b) {
    return api('POST', `/api/users/${b.username}/follow`, { token: a.token });
  }

  function close() {
    server.close();
    try { app.locals.db.close(); } catch { /* redan stängd */ }
    rmSync(dir, { recursive: true, force: true });
  }

  return { app, db: app.locals.db, base, api, user, checkin, follow, close, pushed, push: app.locals.push, dir };
}

/** Plockar ut refresh-cookien ("gl_refresh=...") ur Set-Cookie. */
export function refreshCookie(res) {
  const raw = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')];
  const c = raw.find((x) => x && x.startsWith('gl_refresh='));
  return c ? c.split(';')[0] : null;
}

/** Hela Set-Cookie-raden för refresh-cookien (för att granska attribut). */
export function refreshCookieLine(res) {
  const raw = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')];
  return raw.find((x) => x && x.startsWith('gl_refresh=')) ?? null;
}

/** Dagens datum minus n dagar (Europe/Stockholm), YYYY-MM-DD. */
export function daysAgo(n) {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date());
  return new Date(Date.parse(today + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);
}
