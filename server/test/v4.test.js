// Tester för API v4: säkerhetsfixar, skyddade standardval, inbjudningar och tillväxtfunktioner.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { startServer, daysAgo } from './helpers.js';

const ok = { visitedOn: daysAgo(0), kind: 'departure' };

async function loginRaw(s, username, password = 'hemligt123') {
  const res = await fetch(`${s.base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
  });
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('gl_refresh='))?.split(';')[0] ?? null;
  return { status: res.status, body: await res.json(), cookie, headers: res.headers };
}

// ---------------------------------------------------------------------------------------------
describe('säkerhet: utloggning, sessioner och inloggningsgräns', () => {
  let s;
  before(async () => {
    s = await startServer({ env: { NODE_ENV: 'test', LOGIN_FAIL_MAX: '3', LOGIN_FAIL_ACCOUNT_MAX: '5' } });
    await s.register('offer');
    await s.register('angripare');
  });
  after(() => s.close());

  test('utloggning med påhittad cookie återkallar inte någon annans session (IDOR)', async () => {
    const victim = await loginRaw(s, 'offer');
    const { sid } = jwt.decode(victim.body.token);
    const fake = await fetch(`${s.base}/api/auth/logout`, { method: 'POST', headers: { Cookie: `gl_refresh=${sid}.${'x'.repeat(43)}` } });
    assert.equal(fake.status, 204);
    assert.equal((await s.api('GET', '/api/me', { token: victim.body.token })).status, 200, 'offrets session lever');
    // Inloggad angripare med eget token kan inte heller logga ut offret via cookie
    const att = await loginRaw(s, 'angripare');
    await fetch(`${s.base}/api/auth/logout`, {
      method: 'POST', headers: { Cookie: `gl_refresh=${sid}.${'y'.repeat(43)}`, Authorization: `Bearer ${att.body.token}` },
    });
    assert.equal((await s.api('GET', '/api/me', { token: victim.body.token })).status, 200);
    assert.equal((await s.api('GET', '/api/me', { token: att.body.token })).status, 401, 'angriparens egen session avslutades');
    // Med rätt cookie fungerar utloggning
    const real = await fetch(`${s.base}/api/auth/logout`, { method: 'POST', headers: { Cookie: victim.cookie } });
    assert.equal(real.status, 204);
    assert.equal((await s.api('GET', '/api/me', { token: victim.body.token })).status, 401);
  });

  test('sessioner kan bara återkallas av ägaren (IDOR)', async () => {
    const victim = await loginRaw(s, 'offer');
    const att = await loginRaw(s, 'angripare');
    const { sid } = jwt.decode(victim.body.token);
    assert.equal((await s.api('DELETE', `/api/me/sessions/${sid}`, { token: att.body.token })).status, 404);
    assert.equal((await s.api('GET', '/api/me', { token: victim.body.token })).status, 200);
    const list = await s.api('GET', '/api/me/sessions', { token: att.body.token });
    assert.ok(!list.body.some((x) => x.id === sid));
  });

  test('gräns för misslyckade inloggningar per konto och IP', async () => {
    await s.register('gissad');
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await loginRaw(s, 'gissad', 'fel-losen-1')).status);
    assert.deepEqual(statuses, [401, 401, 401, 429]);
    const blocked = await loginRaw(s, 'gissad');
    assert.equal(blocked.status, 429, 'även rätt lösenord spärras under fönstret');
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.equal((await loginRaw(s, 'offer')).status, 200, 'andra konton påverkas inte');
  });

  test('lyckad inloggning nollställer räknaren för konto+IP', async () => {
    await s.register('glomsk');
    await loginRaw(s, 'glomsk', 'fel-losen-1');
    await loginRaw(s, 'glomsk', 'fel-losen-2');
    assert.equal((await loginRaw(s, 'glomsk')).status, 200);
    await loginRaw(s, 'glomsk', 'fel-losen-3');
    await loginRaw(s, 'glomsk', 'fel-losen-4');
    assert.equal((await loginRaw(s, 'glomsk')).status, 200);
    // Kontots totala gräns (5) räknas fortfarande över fönstret
    assert.equal((await loginRaw(s, 'glomsk', 'fel-losen-5')).status, 401);
    assert.equal((await loginRaw(s, 'glomsk')).status, 429);
  });
});

// ---------------------------------------------------------------------------------------------
describe('skyddade standardval för nya konton', () => {
  let s;
  before(async () => {
    s = await startServer({ env: { NODE_ENV: 'test', NEW_ACCOUNT_PUBLISH_DELAY_HOURS: '1', NEW_ACCOUNT_HIDE_HOME: '1' } });
  });
  after(() => s.close());

  test('registreringssvaret visar fördröjning och dold hemmaflygplats', async () => {
    const r = await s.api('POST', '/api/auth/register', { body: { username: 'nyborjare', password: 'hemligt123', homeIata: 'GOT' } });
    assert.equal(r.status, 201);
    assert.equal(r.body.settings.publishDelayHours, 1);
    assert.equal(r.body.settings.hideHomeAirport, true);
    assert.equal(r.body.settings.isPrivate, false);
    assert.equal(r.body.user.homeIata, 'GOT', 'man ser alltid sin egen hemmaflygplats');
    assert.equal(r.body.invitedBy, null);
    const other = await s.register('granne');
    assert.equal((await s.api('GET', '/api/users/nyborjare', { token: other })).body.homeIata, null);
    const c = await s.api('POST', '/api/checkins', { token: r.body.token, body: { ...ok, iata: 'GOT' } });
    assert.ok(Date.parse(c.body.publishAt) - Date.parse(c.body.createdAt) >= 3600_000 - 1000);
    assert.equal((await s.api('GET', `/api/checkins/${c.body.id}`, { token: other })).status, 404);
  });

  test('val vid registrering via privacy', async () => {
    const r = await s.api('POST', '/api/auth/register', {
      body: { username: 'oppen', password: 'hemligt123', privacy: { publishDelayHours: 0, hideHomeAirport: false, defaultVisibility: 'friends' } },
    });
    assert.equal(r.status, 201);
    assert.deepEqual(
      { d: r.body.settings.publishDelayHours, h: r.body.settings.hideHomeAirport, v: r.body.settings.defaultVisibility },
      { d: 0, h: false, v: 'friends' },
    );
    for (const privacy of ['ja', [1], { publishDelayHours: 3 }, { push: { like: false } }]) {
      const bad = await s.api('POST', '/api/auth/register', { body: { username: 'fel_val', password: 'hemligt123', privacy } });
      assert.equal(bad.status, 400, JSON.stringify(privacy));
    }
  });
});
