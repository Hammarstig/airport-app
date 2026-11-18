// S1 Autentisering och sessioner. Se docs/SECURITY-REVIEW.md.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { startServer, refreshCookie, refreshCookieLine, PASSWORD } from './helpers.mjs';

describe('S1 sessioner och tokens', () => {
  let s;
  before(async () => { s = await startServer(); });
  after(() => s.close());

  test('refresh-cookien är HttpOnly, Secure, SameSite=Strict och begränsad till /api/auth', async () => {
    const r = await s.api('POST', '/api/auth/register', { body: { username: 'cookiecheck', password: PASSWORD } });
    const line = refreshCookieLine(r);
    assert.match(line, /HttpOnly/i);
    assert.match(line, /Secure/i);
    assert.match(line, /SameSite=Strict/i);
    assert.match(line, /Path=\/api\/auth/i);
    assert.equal(typeof r.body.token, 'string');
  });

  test('JWT med alg=none, fel nyckel, HS512 eller manipulerad sub avvisas', async () => {
    const u = await s.user('jwt');
    const payload = jwt.decode(u.token);
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.`;
    const wrongKey = jwt.sign({ sub: payload.sub, sid: payload.sid, username: payload.username }, 'x'.repeat(48), { algorithm: 'HS256' });
    const hs512 = jwt.sign({ sub: payload.sub, sid: payload.sid }, s.app.locals.secret, { algorithm: 'HS512' });
    const otherSub = jwt.sign({ sub: '999999', sid: payload.sid }, s.app.locals.secret, { algorithm: 'HS256' });
    for (const t of [none, wrongKey, hs512, otherSub]) {
      const r = await s.api('GET', '/api/me', { token: t });
      assert.equal(r.status, 401, `token borde avvisas: ${t.slice(0, 30)}`);
    }
  });

  test('utloggning återkallar sessionen direkt (access-token slutar gälla)', async () => {
    const u = await s.user('logout');
    assert.equal((await s.api('GET', '/api/me', { token: u.token })).status, 200);
    assert.equal((await s.api('POST', '/api/auth/logout', { token: u.token })).status, 204);
    assert.equal((await s.api('GET', '/api/me', { token: u.token })).status, 401);
    assert.equal((await s.api('POST', '/api/auth/refresh', { cookie: u.cookie })).status, 401);
  });

  test('återanvänd (roterad) refresh-token efter nådatiden återkallar hela sessionen', async () => {
    const u = await s.user('reuse');
    const r1 = await s.api('POST', '/api/auth/refresh', { cookie: u.cookie });
    assert.equal(r1.status, 200);
    const newer = refreshCookie(r1);
    // Flytta rotationstiden bakåt så att nådatiden (30 s) passerats.
    s.db.prepare("UPDATE sessions SET rotated_at = '2000-01-01T00:00:00.000Z' WHERE user_id = ?").run(u.id);
    const reuse = await s.api('POST', '/api/auth/refresh', { cookie: u.cookie });
    assert.equal(reuse.status, 401);
    // Även den nyare token är nu död (stöld antas).
    assert.equal((await s.api('POST', '/api/auth/refresh', { cookie: newer })).status, 401);
  });

  test('logga ut alla återkallar alla sessioner, lösenordsbyte alla utom den aktuella', async () => {
    const u = await s.user('all');
    const second = await s.api('POST', '/api/auth/login', { body: { username: u.username, password: PASSWORD } });
    const t2 = second.body.token;
    const pw = await s.api('POST', '/api/me/password', { token: u.token, body: { currentPassword: PASSWORD, newPassword: 'Annat-Langt-Losen-77' } });
    assert.equal(pw.status, 200);
    assert.equal((await s.api('GET', '/api/me', { token: t2 })).status, 401, 'andra sessionen ska vara utloggad');
    assert.equal((await s.api('GET', '/api/me', { token: pw.body.token })).status, 200);
    assert.equal((await s.api('POST', '/api/auth/logout-all', { token: pw.body.token })).status, 204);
    assert.equal((await s.api('GET', '/api/me', { token: pw.body.token })).status, 401);
  });

  test('inloggning ger samma felmeddelande för okänt konto och fel lösenord', async () => {
    const u = await s.user('enum');
    const a = await s.api('POST', '/api/auth/login', { body: { username: u.username, password: 'fel-losenord-123' } });
    const b = await s.api('POST', '/api/auth/login', { body: { username: 'finns_inte_alls', password: 'fel-losenord-123' } });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.deepEqual(a.body, b.body);
  });

  test('ny inloggning ger nytt sessions-id (ingen session fixation)', async () => {
    const u = await s.user('fix');
    const r = await s.api('POST', '/api/auth/login', { body: { username: u.username, password: PASSWORD }, cookie: u.cookie });
    assert.notEqual(refreshCookie(r).split('.')[0], u.cookie.split('.')[0]);
  });

  test('SEC-15: trasig refresh-cookie ger 4xx, inte 500', async () => {
    const r = await s.api('POST', '/api/auth/refresh', { cookie: 'gl_refresh=%E0%A4%A' });
    assert.ok(r.status < 500, `fick ${r.status}`);
  });

  test('SEC-12: lösenordspolicyn stoppar vanliga läckta lösenord', { todo: 'SEC-12' }, async () => {
    // Alla finns högt upp på listor över läckta lösenord men godtas idag (listan har ~70 poster).
    for (const pw of ['qwerty12', 'football1', 'Summer2026', 'iloveyou1', 'password2', 'Welcome2026']) {
      const r = await s.api('POST', '/api/auth/register', { body: { username: `pw_${Math.random().toString(36).slice(2, 8)}`, password: pw } });
      assert.equal(r.status, 400, `${pw} godtogs`);
    }
  });
});

describe('S1 moderatorroll knuten till användarnamn', () => {
  let s;
  before(async () => { s = await startServer({ env: { MODERATORS: 'modbob' } }); });
  after(() => s.close());

  test('SEC-03: den som registrerar ett ledigt moderatornamn blir inte moderator', async () => {
    // Moderatorer anges med användarnamn i MODERATORS. Är namnet ledigt (aldrig skapat eller raderat
    // konto) kan vem som helst registrera det och får moderatorrättigheter.
    const r = await s.api('POST', '/api/auth/register', { body: { username: 'modbob', password: PASSWORD } });
    assert.equal(r.status, 201);
    assert.equal(r.body.user.isModerator, false, 'nyregistrerat konto fick moderatorroll');
    const q = await s.api('GET', '/api/moderation/reports', { token: r.body.token });
    assert.equal(q.status, 403);
  });
});

describe('S1 brute force och kontospärr (produktionsgränser)', () => {
  let s;
  before(async () => { s = await startServer({ limits: true, env: { TRUST_PROXY: '1' } }); });
  after(() => s.close());

  test('10 felaktiga försök från samma IP spärrar kontot för den IP:n', async () => {
    const u = await s.user('bf');
    const h = { 'X-Forwarded-For': '203.0.113.10' };
    for (let i = 0; i < 10; i++) {
      assert.equal((await s.api('POST', '/api/auth/login', { headers: h, body: { username: u.username, password: 'fel-fel-fel-1' } })).status, 401);
    }
    const r = await s.api('POST', '/api/auth/login', { headers: h, body: { username: u.username, password: PASSWORD } });
    assert.equal(r.status, 429);
  });

  test('SEC-16: en angripare kan inte låsa ute offret från offrets egen IP', async () => {
    const u = await s.user('lock');
    // 50 felförsök fördelade på 5 IP-adresser (10 per IP) når kontogränsen.
    for (let ip = 1; ip <= 5; ip++) {
      for (let i = 0; i < 10; i++) {
        await s.api('POST', '/api/auth/login', { headers: { 'X-Forwarded-For': `198.51.100.${ip}` }, body: { username: u.username, password: 'gissning-123' } });
      }
    }
    const victim = await s.api('POST', '/api/auth/login', { headers: { 'X-Forwarded-For': '192.0.2.77' }, body: { username: u.username, password: PASSWORD } });
    assert.equal(victim.status, 200, `offret fick ${victim.status} med rätt lösenord`);
  });
});
