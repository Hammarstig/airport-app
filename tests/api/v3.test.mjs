// API-kanttester för v3 (testagenten): sessioner, lösenord, synlighet, privat profil, blockering,
// rapporter/moderering, Web Push (utan riktiga utskick) och grupperade notiser.
// Kör: npm run test:api
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import jwt from 'jsonwebtoken';
import { createApp } from '../../server/src/app.js';

const SECRET = 'v3-edge-secret-som-ar-langre-an-32-tecken';
let uploadDir;
let server;
let app;
let base;
const pushed = []; // { endpoint, payload } - ersätter web-push, inget skickas på riktigt

async function call(method, path, { token, body, cookie, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (cookie) h.Cookie = cookie;
  let payload;
  if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + path, { method, headers: h, body: payload });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}

/** Plockar ut refresh-cookien ("gl_refresh=...") ur Set-Cookie. */
function refreshCookie(res) {
  const raw = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')];
  const c = raw.find((x) => x && x.startsWith('gl_refresh='));
  return c ? c.split(';')[0] : null;
}

let seq = 0;
async function user(prefix = 'v3') {
  seq += 1;
  const username = `${prefix}_${seq}_${Math.random().toString(36).slice(2, 6)}`.slice(0, 20);
  const r = await call('POST', '/api/auth/register', { body: { username, password: 'Flygplats-2026!' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { username, token: r.body.token, cookie: refreshCookie(r), user: r.body.user };
}

const yesterday = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);

async function checkin(u, extra = {}) {
  const r = await call('POST', '/api/checkins', {
    token: u.token,
    body: { iata: 'GOT', visitedOn: yesterday(), kind: 'departure', ...extra },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}

const settings = (u, patch) => call('PATCH', '/api/me/settings', { token: u.token, body: patch });
const follow = (a, b) => call('POST', `/api/users/${b.username}/follow`, { token: a.token });
const ids = (list) => list.map((c) => c.id);

before(async () => {
  uploadDir = mkdtempSync(join(tmpdir(), 'gatelog-v3-'));
  app = createApp({
    dbPath: ':memory:',
    jwtSecret: SECRET,
    uploadDir,
    env: { NODE_ENV: 'test', MODERATORS: 'v3mod' },
    pushSender: async (sub, payload) => {
      pushed.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
      if (sub.endpoint.includes('/gone')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
    },
  });
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  rmSync(uploadDir, { recursive: true, force: true });
});

describe('sessioner och refresh-rotation', () => {
  test('register/login sätter HttpOnly refresh-cookie med rätt attribut', async () => {
    const u = await user();
    const r = await call('POST', '/api/auth/login', { body: { username: u.username, password: 'Flygplats-2026!' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.expiresIn, 900);
    const raw = (r.headers.getSetCookie?.() ?? []).find((x) => x.startsWith('gl_refresh='));
    assert.ok(raw, 'cookie saknas');
    assert.match(raw, /HttpOnly/i);
    assert.match(raw, /SameSite=Strict/i);
    assert.match(raw, /Path=\/api\/auth/i);
    assert.doesNotMatch(r.body.token, /gl_refresh/);
    assert.equal(typeof r.body.user.isModerator, 'boolean');
  });

  test('refresh roterar cookien och ger ny fungerande access-token', async () => {
    const u = await user();
    const r1 = await call('POST', '/api/auth/refresh', { cookie: u.cookie });
    assert.equal(r1.status, 200);
    const c2 = refreshCookie(r1);
    assert.ok(c2 && c2 !== u.cookie, 'cookien ska roteras');
    assert.equal((await call('GET', '/api/me', { token: r1.body.token })).status, 200);
    const r2 = await call('POST', '/api/auth/refresh', { cookie: c2 });
    assert.equal(r2.status, 200);
    assert.notEqual(refreshCookie(r2), c2);
  });

  test('återanvänd token inom 30 s godtas (flera flikar) utan ny cookie', async () => {
    const u = await user();
    const r1 = await call('POST', '/api/auth/refresh', { cookie: u.cookie });
    assert.equal(r1.status, 200);
    const again = await call('POST', '/api/auth/refresh', { cookie: u.cookie });
    assert.equal(again.status, 200);
    assert.equal(refreshCookie(again), null);
  });

  test('återanvänd gammal token efter respitid återkallar hela sessionen', async () => {
    const u = await user();
    const r1 = await call('POST', '/api/auth/refresh', { cookie: u.cookie });
    const fresh = refreshCookie(r1);
    // Simulera att 30 s respit har passerat.
    const sid = u.cookie.split('=')[1].split('.')[0];
    app.locals.db.prepare('UPDATE sessions SET rotated_at = ? WHERE id = ?').run(new Date(Date.now() - 60_000).toISOString(), sid);
    const stolen = await call('POST', '/api/auth/refresh', { cookie: u.cookie });
    assert.equal(stolen.status, 401);
    assert.equal(stolen.body.code, 'session_revoked');
    // Även den legitima, nyaste cookien och access-tokens för sessionen är nu ogiltiga.
    assert.equal((await call('POST', '/api/auth/refresh', { cookie: fresh })).status, 401);
    const me = await call('GET', '/api/me', { token: r1.body.token });
    assert.equal(me.status, 401);
    assert.equal(me.body.code, 'session_revoked');
  });

  test('refresh utan, med trasig eller förfalskad cookie ger 401', async () => {
    assert.equal((await call('POST', '/api/auth/refresh')).status, 401);
    for (const c of ['gl_refresh=', 'gl_refresh=abc', `gl_refresh=${'a'.repeat(32)}.${'b'.repeat(43)}`, 'gl_refresh=../../etc']) {
      const r = await call('POST', '/api/auth/refresh', { cookie: c });
      assert.equal(r.status, 401, c);
    }
  });

  test('utgången access-token ger 401 token_expired, v2-token utan sid ger session_revoked, alg=none avvisas', async () => {
    const u = await user();
    const decoded = jwt.decode(u.token);
    const expired = jwt.sign({ sub: decoded.sub, sid: decoded.sid, username: u.username, iat: 1, exp: 2 }, SECRET);
    const r = await call('GET', '/api/me', { token: expired });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'token_expired');
    const v2 = jwt.sign({ sub: decoded.sub, username: u.username }, SECRET, { expiresIn: '30d' });
    assert.equal((await call('GET', '/api/me', { token: v2 })).body.code, 'session_revoked');
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: decoded.sub, sid: decoded.sid })).toString('base64url')}.`;
    assert.equal((await call('GET', '/api/me', { token: none })).status, 401);
    // Token för en annan användares session (sub stämmer inte) godtas inte.
    const other = await user();
    const forged = jwt.sign({ sub: jwt.decode(other.token).sub, sid: decoded.sid, username: other.username }, SECRET, { expiresIn: 900 });
    assert.equal((await call('GET', '/api/me', { token: forged })).status, 401);
  });

  test('logout återkallar aktuell session men inte andra', async () => {
    const u = await user();
    const second = await call('POST', '/api/auth/login', { body: { username: u.username, password: 'Flygplats-2026!' } });
    const out = await call('POST', '/api/auth/logout', { token: u.token, cookie: u.cookie });
    assert.equal(out.status, 204);
    assert.match((out.headers.getSetCookie?.() ?? []).join(';'), /gl_refresh=;/);
    assert.equal((await call('GET', '/api/me', { token: u.token })).status, 401);
    assert.equal((await call('POST', '/api/auth/refresh', { cookie: u.cookie })).status, 401);
    assert.equal((await call('GET', '/api/me', { token: second.body.token })).status, 200);
  });

  test('logout-all återkallar alla sessioner direkt', async () => {
    const u = await user();
    const s2 = await call('POST', '/api/auth/login', { body: { username: u.username, password: 'Flygplats-2026!' } });
    const s3 = await call('POST', '/api/auth/login', { body: { username: u.username, password: 'Flygplats-2026!' } });
    const sessions = await call('GET', '/api/me/sessions', { token: u.token });
    assert.equal(sessions.body.length, 3);
    assert.equal(sessions.body.filter((s) => s.current).length, 1);
    assert.equal((await call('POST', '/api/auth/logout-all')).status, 401);
    assert.equal((await call('POST', '/api/auth/logout-all', { token: u.token })).status, 204);
    for (const t of [u.token, s2.body.token, s3.body.token]) assert.equal((await call('GET', '/api/me', { token: t })).status, 401);
    assert.equal((await call('POST', '/api/auth/refresh', { cookie: refreshCookie(s2) })).status, 401);
  });

  test('återkalla en enskild session; annans session ger 404', async () => {
    const u = await user();
    const s2 = await call('POST', '/api/auth/login', { body: { username: u.username, password: 'Flygplats-2026!' } });
    const list = await call('GET', '/api/me/sessions', { token: u.token });
    const other = list.body.find((s) => !s.current);
    const stranger = await user();
    assert.equal((await call('DELETE', `/api/me/sessions/${other.id}`, { token: stranger.token })).status, 404);
    assert.equal((await call('DELETE', `/api/me/sessions/${other.id}`, { token: u.token })).status, 204);
    assert.equal((await call('GET', '/api/me', { token: s2.body.token })).status, 401);
    assert.equal((await call('GET', '/api/me', { token: u.token })).status, 200);
    assert.ok(!JSON.stringify(list.body).includes('refresh'), 'sessionslistan får inte läcka refresh-hashar');
  });
});

describe('lösenordsbyte och lösenordspolicy', () => {
  test('fel nuvarande lösenord ger 403 och loggar inte ut', async () => {
    const u = await user();
    const r = await call('POST', '/api/me/password', { token: u.token, body: { currentPassword: 'fel-fel-fel', newPassword: 'Nytt-Losen-123' } });
    assert.equal(r.status, 403);
    assert.equal((await call('GET', '/api/me', { token: u.token })).status, 200);
  });

  test('byte ger ny token, återkallar andra sessioner, gamla lösenordet slutar fungera', async () => {
    const u = await user();
    const other = await call('POST', '/api/auth/login', { body: { username: u.username, password: 'Flygplats-2026!' } });
    const r = await call('POST', '/api/me/password', { token: u.token, body: { currentPassword: 'Flygplats-2026!', newPassword: 'Nytt-Losen-123' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.token);
    assert.equal((await call('GET', '/api/me', { token: r.body.token })).status, 200);
    assert.equal((await call('GET', '/api/me', { token: other.body.token })).status, 401);
    assert.equal((await call('POST', '/api/auth/refresh', { cookie: refreshCookie(other) })).status, 401);
    assert.equal((await call('POST', '/api/auth/login', { body: { username: u.username, password: 'Flygplats-2026!' } })).status, 401);
    assert.equal((await call('POST', '/api/auth/login', { body: { username: u.username, password: 'Nytt-Losen-123' } })).status, 200);
  });

  test('policy: för kort, för långt, samma som användarnamn, vanligt lösenord', async () => {
    const u = await user();
    for (const pw of ['kort', 'x'.repeat(201), u.username, 'password', 'password123', '12345678', 'qwertyuiop']) {
      const r = await call('POST', '/api/me/password', { token: u.token, body: { currentPassword: 'Flygplats-2026!', newPassword: pw } });
      assert.equal(r.status, 400, `"${pw.slice(0, 20)}" gav ${r.status}`);
    }
    const reg = await call('POST', '/api/auth/register', { body: { username: 'policy_test1', password: 'policy_test1' } });
    assert.equal(reg.status, 400);
    assert.equal((await call('POST', '/api/auth/register', { body: { username: 'policy_test2', password: 'password' } })).status, 400);
  });
});

describe('synlighet och fördröjd publicering', () => {
  let owner, follower, stranger, pub, fr, priv, delayed;
  before(async () => {
    owner = await user('vis');
    follower = await user('fol');
    stranger = await user('str');
    assert.equal((await follow(follower, owner)).status, 200);
    pub = await checkin(owner, { iata: 'ARN', comment: 'visprobe publik', visibility: 'public' });
    fr = await checkin(owner, { iata: 'CPH', comment: 'visprobe vanner', visibility: 'friends' });
    priv = await checkin(owner, { iata: 'OSL', comment: 'visprobe privat', visibility: 'private' });
    await settings(owner, { publishDelayHours: 24 });
    delayed = await checkin(owner, { iata: 'HEL', comment: 'visprobe fordrojd', visibility: 'public' });
    await settings(owner, { publishDelayHours: 0 });
  });

  const view = async (who, path) => (await call('GET', path, { token: who?.token })).body;

  test('fördröjd check-in får publishAt i framtiden', () => {
    assert.ok(Date.parse(delayed.publishAt) > Date.now() + 23 * 3600 * 1000, delayed.publishAt);
    assert.ok(Date.parse(pub.publishAt) <= Date.now() + 1000);
  });

  test('check-in-detalj: rätt tittare ser rätt check-ins (404 annars)', async () => {
    const cases = [
      [owner, [pub, fr, priv, delayed], []],
      [follower, [pub, fr], [priv, delayed]],
      [stranger, [pub], [fr, priv, delayed]],
      [null, [pub], [fr, priv, delayed]],
    ];
    for (const [who, visible, hidden] of cases) {
      for (const c of visible) assert.equal((await call('GET', `/api/checkins/${c.id}`, { token: who?.token })).status, 200, `${who?.username ?? 'anonym'} ska se ${c.visibility}`);
      for (const c of hidden) assert.equal((await call('GET', `/api/checkins/${c.id}`, { token: who?.token })).status, 404, `${who?.username ?? 'anonym'} ska inte se ${c.comment}`);
    }
  });

  test('flöden, användarens och flygplatsens listor filtreras', async () => {
    const all = [pub.id, fr.id, priv.id, delayed.id];
    const pick = (list) => ids(list).filter((id) => all.includes(id)).sort();
    assert.deepEqual(pick(await view(owner, '/api/feed?scope=mine&limit=100')), [...all].sort());
    assert.deepEqual(pick(await view(follower, '/api/feed?scope=friends&limit=100')), [pub.id, fr.id].sort());
    assert.deepEqual(pick(await view(stranger, '/api/feed?scope=global&limit=100')), [pub.id]);
    assert.deepEqual(pick(await view(null, `/api/users/${owner.username}/checkins?limit=100`)), [pub.id]);
    assert.deepEqual(pick(await view(follower, `/api/users/${owner.username}/checkins?limit=100`)), [pub.id, fr.id].sort());
    assert.deepEqual(pick(await view(stranger, '/api/airports/OSL/checkins?limit=100')), []);
    assert.deepEqual(pick(await view(stranger, '/api/airports/HEL/checkins?limit=100')), []);
  });

  test('sök visar bara synliga kommentarer', async () => {
    const hits = async (who) => (await view(who, '/api/search?q=visprobe&limit=50')).map((h) => h.id).sort();
    assert.deepEqual(await hits(stranger), [pub.id]);
    assert.deepEqual(await hits(follower), [pub.id, fr.id].sort());
    assert.deepEqual(await hits(owner), [pub.id, fr.id, priv.id, delayed.id].sort());
  });

  test('karta och flygplatslista räknas på det tittaren får se', async () => {
    const visited = async (who) => {
      const m = await view(who, `/api/users/${owner.username}/map?scope=all`);
      return m.countries.filter((c) => c.visited).map((c) => c.code).sort();
    };
    assert.deepEqual(await visited(owner), ['DK', 'FI', 'NO', 'SE']);
    assert.deepEqual(await visited(follower), ['DK', 'SE']);
    assert.deepEqual(await visited(stranger), ['SE']);
    const airports = (await view(stranger, `/api/users/${owner.username}/airports`)).map((r) => r.airport.iata);
    assert.deepEqual(airports, ['ARN']);
    // Räknare räknas på allt.
    assert.equal((await view(stranger, `/api/users/${owner.username}`)).stats.uniqueAirports, 4);
  });

  test('kommentarer och gilla på dold check-in ger 404', async () => {
    for (const c of [fr, priv, delayed]) {
      assert.equal((await call('GET', `/api/checkins/${c.id}/comments`, { token: stranger.token })).status, 404);
      assert.equal((await call('POST', `/api/checkins/${c.id}/comments`, { token: stranger.token, body: { body: 'hej' } })).status, 404);
      assert.equal((await call('POST', `/api/checkins/${c.id}/like`, { token: stranger.token })).status, 404);
    }
    assert.equal((await call('POST', `/api/checkins/${fr.id}/comments`, { token: follower.token, body: { body: 'hej vän' } })).status, 201);
  });

  test('ogiltig synlighet och fördröjning avvisas', async () => {
    assert.equal((await call('POST', '/api/checkins', { token: owner.token, body: { iata: 'GOT', visitedOn: yesterday(), kind: 'departure', visibility: 'secret' } })).status, 400);
    for (const p of [{ publishDelayHours: 5 }, { defaultVisibility: 'everyone' }, { isPrivate: 'ja' }, { push: { like: 'ja' } }]) {
      assert.equal((await settings(owner, p)).status, 400, JSON.stringify(p));
    }
  });

  test('ändrad synlighet via PATCH gäller direkt', async () => {
    const c = await checkin(owner, { iata: 'BMA', visibility: 'public' });
    assert.equal((await call('GET', `/api/checkins/${c.id}`, { token: stranger.token })).status, 200);
    assert.equal((await call('PATCH', `/api/checkins/${c.id}`, { token: owner.token, body: { visibility: 'private' } })).status, 200);
    assert.equal((await call('GET', `/api/checkins/${c.id}`, { token: stranger.token })).status, 404);
  });

  test('standardsynlighet från inställningarna används', async () => {
    const u = await user('def');
    await settings(u, { defaultVisibility: 'friends' });
    const c = await checkin(u);
    assert.equal(c.visibility, 'friends');
    assert.equal((await call('GET', `/api/checkins/${c.id}`, { token: stranger.token })).status, 404);
  });

  test('dold hemmaflygplats syns inte för andra', async () => {
    const u = await user('home');
    await call('PATCH', '/api/me', { token: u.token, body: { homeIata: 'GOT' } });
    await settings(u, { hideHomeAirport: true });
    assert.equal((await view(stranger, `/api/users/${u.username}`)).homeIata, null);
    assert.equal((await view(u, `/api/users/${u.username}`)).homeIata, 'GOT');
  });
});

describe('privat profil och följförfrågningar', () => {
  test('privat profil: 403 private_profile på listor, stats null, förfrågan och godkännande', async () => {
    const p = await user('priv');
    await checkin(p, { comment: 'privat profil' });
    assert.equal((await settings(p, { isPrivate: true })).status, 200);
    const s = await user('ask');

    const prof = await call('GET', `/api/users/${p.username}`, { token: s.token });
    assert.equal(prof.status, 200);
    assert.equal(prof.body.isPrivate, true);
    assert.equal(prof.body.canView, false);
    assert.equal(prof.body.stats, null);
    for (const sub of ['checkins', 'airports', 'map', 'map/SE', 'wishlist', 'badges', 'followers', 'following', 'card', 'card.svg']) {
      const r = await call('GET', `/api/users/${p.username}/${sub}`, { token: s.token });
      assert.equal(r.status, 403, sub);
      if (sub !== 'card.svg') assert.equal(r.body.code, 'private_profile', sub);
    }
    // Ägaren ser allt.
    assert.equal((await call('GET', `/api/users/${p.username}/checkins`, { token: p.token })).status, 200);

    const req = await follow(s, p);
    assert.equal(req.status, 200);
    assert.deepEqual([req.body.following, req.body.requested], [false, true]);
    assert.equal((await call('GET', `/api/users/${p.username}`, { token: s.token })).body.followRequested, true);
    const list = await call('GET', '/api/me/follow-requests', { token: p.token });
    assert.deepEqual(list.body.map((u) => u.username), [s.username]);
    assert.equal((await call('POST', `/api/me/follow-requests/${s.username}`, { token: p.token })).status, 204);
    const after = await call('GET', `/api/users/${p.username}`, { token: s.token });
    assert.equal(after.body.canView, true);
    assert.equal(after.body.followedByMe, true);
    assert.equal((await call('GET', `/api/users/${p.username}/checkins`, { token: s.token })).status, 200);
    const notif = await call('GET', '/api/notifications', { token: s.token });
    assert.ok(notif.body.items.some((n) => n.type === 'follow_accepted'));
    const pn = await call('GET', '/api/notifications', { token: p.token });
    assert.ok(pn.body.items.some((n) => n.type === 'follow_request'));
  });

  test('avböj förfrågan, återkalla egen förfrågan, godkänn okänd ger 404', async () => {
    const p = await user('priv');
    await settings(p, { isPrivate: true });
    const a = await user('ask');
    const b = await user('ask');
    await follow(a, p);
    await follow(b, p);
    assert.equal((await call('DELETE', `/api/me/follow-requests/${a.username}`, { token: p.token })).status, 204);
    const unf = await call('DELETE', `/api/users/${p.username}/follow`, { token: b.token });
    assert.deepEqual([unf.body.following, unf.body.requested], [false, false]);
    assert.deepEqual((await call('GET', '/api/me/follow-requests', { token: p.token })).body, []);
    assert.equal((await call('POST', `/api/me/follow-requests/${a.username}`, { token: p.token })).status, 404);
  });

  test('blir profilen publik godkänns väntande förfrågningar', async () => {
    const p = await user('priv');
    await settings(p, { isPrivate: true });
    const a = await user('ask');
    await follow(a, p);
    await settings(p, { isPrivate: false });
    assert.equal((await call('GET', `/api/users/${p.username}`, { token: a.token })).body.followedByMe, true);
  });

  test('privat profil syns i globala topplistan bara för sig själv och följare', async () => {
    const p = await user('rank');
    await checkin(p, { iata: 'SIN' });
    await settings(p, { isPrivate: true });
    const s = await user('rank');
    const names = async (who) => (await call('GET', '/api/rankings/users?metric=airports&period=all&limit=100', { token: who?.token })).body.items.map((r) => r.user.username);
    assert.ok((await names(p)).includes(p.username));
    assert.ok(!(await names(s)).includes(p.username));
    assert.ok(!(await names(null)).includes(p.username));
    assert.equal((await call('GET', '/api/rankings/users?metric=airports&period=all', { token: p.token })).body.me?.value, 1);
  });
});

describe('blockering', () => {
  test('blockering åt båda håll: följningar tas bort, check-ins/kommentarer/notiser döljs, följ ger 403', async () => {
    const a = await user('blk');
    const b = await user('blk');
    await follow(a, b);
    await follow(b, a);
    const ca = await checkin(a, { comment: 'blockprobe a' });
    const cb = await checkin(b, { comment: 'blockprobe b' });
    await call('POST', `/api/checkins/${ca.id}/comments`, { token: b.token, body: { body: 'kommentar från b' } });

    assert.equal((await call('POST', `/api/users/${b.username}/block`, { token: a.token })).status, 204);
    assert.deepEqual((await call('GET', '/api/me/blocks', { token: a.token })).body.map((u) => u.username), [b.username]);

    for (const [viewer, hidden] of [[a, cb], [b, ca]]) {
      assert.equal((await call('GET', `/api/checkins/${hidden.id}`, { token: viewer.token })).status, 404);
      const feed = await call('GET', '/api/feed?scope=global&limit=100', { token: viewer.token });
      assert.ok(!ids(feed.body).includes(hidden.id));
      const search = await call('GET', '/api/search?q=blockprobe', { token: viewer.token });
      assert.ok(!ids(search.body).includes(hidden.id));
      assert.equal((await call('POST', `/api/checkins/${hidden.id}/like`, { token: viewer.token })).status, 404);
    }
    const comments = await call('GET', `/api/checkins/${ca.id}/comments`, { token: a.token });
    assert.ok(!comments.body.some((c) => c.user.username === b.username), 'b:s kommentar ska vara dold för a');
    const profA = await call('GET', `/api/users/${a.username}`, { token: a.token });
    assert.equal(profA.body.followers, 0);
    assert.equal(profA.body.following, 0);
    assert.equal((await follow(b, a)).status, 403);
    assert.equal((await follow(a, b)).status, 403);
    const na = await call('GET', '/api/notifications', { token: a.token });
    assert.ok(!na.body.items.some((n) => n.actor?.username === b.username), 'notiser från b ska tas bort');

    // Efter avblockering syns allt igen men följningarna återställs inte.
    assert.equal((await call('DELETE', `/api/users/${b.username}/block`, { token: a.token })).status, 204);
    assert.equal((await call('GET', `/api/checkins/${cb.id}`, { token: a.token })).status, 200);
    assert.equal((await call('GET', `/api/users/${a.username}`, { token: a.token })).body.followers, 0);
  });

  test('blockera sig själv eller okänd användare', async () => {
    const a = await user('blk');
    assert.equal((await call('POST', `/api/users/${a.username}/block`, { token: a.token })).status, 400);
    assert.equal((await call('POST', '/api/users/finnsinte_xyz/block', { token: a.token })).status, 404);
    assert.equal((await call('POST', `/api/users/${a.username}/block`)).status, 401);
  });
});

describe('rapporter och moderering', () => {
  test('rapportera kommentar, check-in och användare; dubblett ger 200', async () => {
    const reporter = await user('rep');
    const bad = await user('bad');
    const c = await checkin(bad, { comment: 'spam spam' });
    const com = await call('POST', `/api/checkins/${c.id}/comments`, { token: bad.token, body: { body: 'köp billigt' } });
    const r1 = await call('POST', '/api/reports', { token: reporter.token, body: { type: 'comment', target: com.body.id, reason: 'spam' } });
    assert.equal(r1.status, 201);
    assert.equal(r1.body.status, 'open');
    const dup = await call('POST', '/api/reports', { token: reporter.token, body: { type: 'comment', target: com.body.id, reason: 'spam' } });
    assert.equal(dup.status, 200);
    assert.equal(dup.body.id, r1.body.id);
    assert.equal((await call('POST', '/api/reports', { token: reporter.token, body: { type: 'checkin', target: c.id, reason: 'inappropriate', note: 'x'.repeat(100) } })).status, 201);
    assert.equal((await call('POST', '/api/reports', { token: reporter.token, body: { type: 'user', target: bad.username, reason: 'harassment' } })).status, 201);
  });

  test('rapportvalidering', async () => {
    const r = await user('rep');
    const bodies = [
      { type: 'post', target: 1, reason: 'spam' },
      { type: 'comment', target: 1, reason: 'boring' },
      { type: 'comment', target: 99999999, reason: 'spam' },
      { type: 'user', target: 'finnsinte_xyz', reason: 'spam' },
      { type: 'user', target: r.username, reason: 'spam' },
      { type: 'comment', reason: 'spam' },
    ];
    for (const body of bodies) {
      const res = await call('POST', '/api/reports', { token: r.token, body });
      assert.ok([400, 404].includes(res.status), `${JSON.stringify(body)} gav ${res.status}`);
    }
    assert.equal((await call('POST', '/api/reports', { body: bodies[0] })).status, 401);
  });

  test('moderatorkö kräver moderator; remove_content raderar och stänger alla rapporter för målet', async () => {
    const mod = await call('POST', '/api/auth/register', { body: { username: 'v3mod', password: 'Moderator-2026!' } });
    assert.equal(mod.status, 201);
    assert.equal(mod.body.user.isModerator, true);
    const modTok = mod.body.token;
    const normal = await user('norm');
    assert.equal((await call('GET', '/api/me', { token: normal.token })).body.isModerator, false);
    assert.equal((await call('GET', '/api/moderation/reports', { token: normal.token })).status, 403);
    assert.equal((await call('GET', '/api/moderation/reports')).status, 401);

    const bad = await user('bad');
    const c = await checkin(bad);
    const com = await call('POST', `/api/checkins/${c.id}/comments`, { token: bad.token, body: { body: 'oönskat innehåll' } });
    const rep1 = await user('rep');
    const rep2 = await user('rep');
    const a = await call('POST', '/api/reports', { token: rep1.token, body: { type: 'comment', target: com.body.id, reason: 'harassment' } });
    await call('POST', '/api/reports', { token: rep2.token, body: { type: 'comment', target: com.body.id, reason: 'spam' } });
    assert.equal((await call('POST', `/api/moderation/reports/${a.body.id}`, { token: normal.token, body: { action: 'dismiss' } })).status, 403);

    const queue = await call('GET', '/api/moderation/reports?status=open', { token: modTok });
    assert.equal(queue.status, 200);
    const mine = queue.body.find((r) => r.id === a.body.id);
    assert.ok(mine);
    assert.equal(mine.reportCount, 2);
    assert.equal((await call('POST', `/api/moderation/reports/${a.body.id}`, { token: modTok, body: { action: 'nuke' } })).status, 400);
    assert.equal((await call('GET', '/api/moderation/reports?status=bogus', { token: modTok })).status, 400);

    const done = await call('POST', `/api/moderation/reports/${a.body.id}`, { token: modTok, body: { action: 'remove_content' } });
    assert.equal(done.status, 200);
    const comments = await call('GET', `/api/checkins/${c.id}/comments`);
    assert.ok(!comments.body.some((x) => x.id === com.body.id), 'kommentaren ska vara raderad');
    const open = await call('GET', '/api/moderation/reports?status=open&limit=100', { token: modTok });
    assert.ok(!open.body.some((r) => r.type === 'comment' && String(r.target) === String(com.body.id)), 'alla rapporter för målet ska stängas');

    // dismiss lämnar innehållet orört.
    const c2 = await checkin(bad, { comment: 'okej ändå' });
    const r3 = await call('POST', '/api/reports', { token: rep1.token, body: { type: 'checkin', target: c2.id, reason: 'other' } });
    assert.equal((await call('POST', `/api/moderation/reports/${r3.body.id}`, { token: modTok, body: { action: 'dismiss' } })).status, 200);
    assert.equal((await call('GET', `/api/checkins/${c2.id}`)).status, 200);
  });
});

describe('Web Push (utan riktiga utskick)', () => {
  const sub = (n) => ({ endpoint: `https://push.example.test/sub/${n}`, keys: { p256dh: 'BOr8q2vNZ9zG2hY0Q7kq3Yw', auth: 'c2VjcmV0LWF1dGg' } });

  test('public-key är cachebar', async () => {
    const r = await call('GET', '/api/push/public-key');
    assert.equal(r.status, 200);
    assert.equal(typeof r.body.enabled, 'boolean');
    assert.match(r.headers.get('cache-control') || '', /public/);
  });

  test('prenumerationer: validering, max 10, avregistrering', async () => {
    const u = await user('push');
    assert.equal((await call('POST', '/api/push/subscriptions', { body: sub(1) })).status, 401);
    for (const bad of [
      { endpoint: 'http://push.example.test/x', keys: sub(1).keys },
      { endpoint: 'javascript:alert(1)', keys: sub(1).keys },
      { endpoint: sub(1).endpoint },
      { endpoint: sub(1).endpoint, keys: { p256dh: 'x' } },
      { endpoint: `https://${'a'.repeat(3000)}.test/`, keys: sub(1).keys },
    ]) {
      assert.equal((await call('POST', '/api/push/subscriptions', { token: u.token, body: bad })).status, 400, JSON.stringify(bad).slice(0, 80));
    }
    for (let i = 0; i < 10; i++) assert.equal((await call('POST', '/api/push/subscriptions', { token: u.token, body: sub(`${u.username}-${i}`) })).status, 201);
    // Den 11:e ersätter den äldsta (max 10 sparas).
    assert.equal((await call('POST', '/api/push/subscriptions', { token: u.token, body: sub(`${u.username}-10`) })).status, 201);
    const stored = () => app.locals.db.prepare('SELECT endpoint FROM push_subscriptions WHERE user_id = ? ORDER BY id').all(u.user.id ?? jwt.decode(u.token).sub).map((r) => r.endpoint);
    let eps = stored();
    assert.equal(eps.length, 10);
    assert.ok(!eps.includes(sub(`${u.username}-0`).endpoint), 'äldsta ska ha ersatts');
    assert.equal((await call('DELETE', '/api/push/subscriptions', { token: u.token, body: { endpoint: sub(`${u.username}-1`).endpoint } })).status, 204);
    eps = stored();
    assert.equal(eps.length, 9);
    // Annans endpoint kan inte avregistreras.
    const other = await user('push');
    await call('DELETE', '/api/push/subscriptions', { token: other.token, body: { endpoint: sub(`${u.username}-2`).endpoint } });
    assert.equal(stored().length, 9);
  });

  test('notis skickas som push enligt inställningar; 410 tar bort prenumerationen', async () => {
    const u = await user('push');
    const liker = await user('liker');
    const ep = `https://push.example.test/sub/${u.username}`;
    const gone = `https://push.example.test/gone/${u.username}`;
    await call('POST', '/api/push/subscriptions', { token: u.token, body: { ...sub(0), endpoint: ep } });
    await call('POST', '/api/push/subscriptions', { token: u.token, body: { ...sub(0), endpoint: gone } });
    const c = await checkin(u);
    pushed.length = 0;
    await call('POST', `/api/checkins/${c.id}/like`, { token: liker.token });
    await app.locals.push.flush();
    const mine = pushed.filter((p) => p.endpoint === ep);
    assert.equal(mine.length, 1);
    assert.deepEqual(Object.keys(mine[0].payload).sort(), ['body', 'notificationId', 'tag', 'title', 'type', 'url']);
    assert.equal(mine[0].payload.type, 'like');
    assert.equal(mine[0].payload.url, `/c/${c.id}`);
    assert.match(mine[0].payload.body, /gillade/);
    // Prenumerationen som svarade 410 är borttagen: nästa notis går bara till den andra.
    await settings(u, { push: { follow: false } });
    pushed.length = 0;
    await follow(liker, u);
    await app.locals.push.flush();
    assert.equal(pushed.filter((p) => p.endpoint.includes(u.username)).length, 0, 'push för follow är avstängt');
    const other = await user('other');
    pushed.length = 0;
    await call('POST', `/api/checkins/${c.id}/comments`, { token: other.token, body: { body: 'hej' } });
    await app.locals.push.flush();
    assert.deepEqual(pushed.filter((p) => p.endpoint.includes(u.username)).map((p) => p.endpoint), [ep]);
  });
});

describe('grupperade notiser', () => {
  test('flera märkesnivåer i en check-in ger en grupperad notis', async () => {
    const u = await user('grp');
    const c = await checkin(u, { comment: 'första', rating: 4 });
    const n = await call('GET', '/api/notifications', { token: u.token });
    const badgeNotes = n.body.items.filter((x) => x.type === 'badge');
    assert.equal(badgeNotes.length, 1, JSON.stringify(n.body.items.map((x) => x.text)));
    const b = badgeNotes[0];
    assert.ok(Array.isArray(b.badges) && b.badges.length >= 1);
    assert.deepEqual(b.badge, b.badges[0]);
    assert.equal(b.groupKey, `badge:checkin:${c.id}`);
    if (b.badges.length > 1) assert.match(b.text, new RegExp(`Du nådde ${b.badges.length} nya märkesnivåer`));
    else assert.match(b.text, /^Du nådde \S+ i /);
  });

  test('gilla och följ ger högst en notis per person och mål; alla notiser har groupKey och url', async () => {
    const owner = await user('grp');
    const fan = await user('fan');
    const c = await checkin(owner);
    for (let i = 0; i < 3; i++) {
      await call('POST', `/api/checkins/${c.id}/like`, { token: fan.token });
      await call('DELETE', `/api/checkins/${c.id}/like`, { token: fan.token });
      await follow(fan, owner);
      await call('DELETE', `/api/users/${owner.username}/follow`, { token: fan.token });
    }
    const n = (await call('GET', '/api/notifications', { token: owner.token })).body.items;
    assert.equal(n.filter((x) => x.type === 'like').length, 1);
    assert.equal(n.filter((x) => x.type === 'follow').length, 1);
    for (const x of n) {
      assert.ok(x.groupKey, `${x.type} saknar groupKey`);
      assert.ok(typeof x.url === 'string' && x.url.startsWith('/'), `${x.type} saknar url`);
    }
  });

  test('markera enskilda notiser som lästa', async () => {
    const owner = await user('grp');
    const fan = await user('fan');
    const c = await checkin(owner);
    await call('POST', `/api/checkins/${c.id}/like`, { token: fan.token });
    await follow(fan, owner);
    const items = (await call('GET', '/api/notifications?unread=1', { token: owner.token })).body.items;
    const before = items.length;
    const r = await call('POST', '/api/notifications/read', { token: owner.token, body: { ids: [items[0].id] } });
    assert.equal(r.body.unread, before - 1);
    // Andras notis-id påverkar inte.
    assert.equal((await call('POST', '/api/notifications/read', { token: fan.token, body: { ids: items.map((x) => x.id) } })).status, 200);
    assert.equal((await call('GET', '/api/notifications/unread-count', { token: owner.token })).body.unread, before - 1);
    assert.equal((await call('POST', '/api/notifications/read', { token: owner.token, body: { ids: 'alla' } })).status, 400);
  });
});

describe('id:n efter radering (regression BUG-12)', () => {
  test('raderad check-in/kommentar får inte sitt id återanvänt av annan användare', async () => {
    const a = await user('ida');
    const b = await user('idb');
    const rep = await user('idr');
    const ca = await checkin(a, { comment: 'A:s check-in' });
    const com = (await call('POST', `/api/checkins/${ca.id}/comments`, { token: a.token, body: { body: 'A:s kommentar' } })).body;
    const report = (await call('POST', '/api/reports', { token: rep.token, body: { type: 'comment', target: com.id, reason: 'harassment' } })).body;
    await call('DELETE', `/api/comments/${com.id}`, { token: a.token });
    await call('DELETE', `/api/checkins/${ca.id}`, { token: a.token });
    const cb = await checkin(b, { comment: 'B:s check-in' });
    const comb = (await call('POST', `/api/checkins/${cb.id}/comments`, { token: b.token, body: { body: 'B:s kommentar' } })).body;
    assert.notEqual(cb.id, ca.id, 'nytt check-in-id ska inte vara ett raderat id');
    assert.notEqual(comb.id, com.id, 'nytt kommentar-id ska inte vara ett raderat id');
    // Den gamla rapporten ska inte kunna radera B:s kommentar.
    const mod = (await call('POST', '/api/auth/login', { body: { username: 'v3mod', password: 'Moderator-2026!' } })).body.token;
    await call('POST', `/api/moderation/reports/${report.id}`, { token: mod, body: { action: 'remove_content' } });
    assert.equal((await call('GET', `/api/checkins/${cb.id}/comments`)).body.length, 1);
  });
});
