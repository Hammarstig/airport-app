// Gemensamma hjälpare för servertesterna.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

process.env.NODE_ENV = 'test';

export async function startServer(opts = {}) {
  const uploadDir = mkdtempSync(join(tmpdir(), 'gatelog-up-'));
  const app = createApp({ dbPath: ':memory:', jwtSecret: 'test-secret', uploadDir, ...opts });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function api(method, path, { token, body, headers = {} } = {}) {
    const h = { ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      h['Content-Type'] = 'application/json';
      payload = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(base + path, { method, headers: h, body: payload });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers };
  }

  async function register(username, extra = {}) {
    const r = await api('POST', '/api/auth/register', { body: { username, password: 'hemligt123', ...extra } });
    if (r.status !== 201) throw new Error(`register ${username}: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.token;
  }

  async function login(username, password = 'demo1234') {
    return (await api('POST', '/api/auth/login', { body: { username, password } })).body.token;
  }

  function close() {
    server.close();
    rmSync(uploadDir, { recursive: true, force: true });
  }

  return { app, db: app.locals.db, base, api, register, login, close, uploadDir };
}

/** Dagens datum minus n dagar (Europe/Stockholm), YYYY-MM-DD. */
export function daysAgo(n) {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date());
  return new Date(Date.parse(today + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);
}
