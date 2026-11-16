// Tester för API v3: sessioner, lösenord, integritet, följförfrågningar, blockering, rapporter,
// Web Push, overtaken-notiser och strikt validering.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { startServer, daysAgo } from './helpers.js';

const ok = { visitedOn: daysAgo(0), kind: 'departure' };

/** Hämtar refresh-cookien ur ett svar. */
function refreshCookie(res) {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith('gl_refresh='));
  return raw ? raw.split(';')[0] : null;
}

async function loginFull(s, username, password = 'hemligt123') {
  const res = await fetch(`${s.base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
  });
  return { status: res.status, body: await res.json(), cookie: refreshCookie(res), raw: res.headers.getSetCookie() };
}

async function refresh(s, cookie) {
  const res = await fetch(`${s.base}/api/auth/refresh`, { method: 'POST', headers: cookie ? { Cookie: cookie } : {} });
  return { status: res.status, body: await res.json(), cookie: refreshCookie(res) };
}

// ---------------------------------------------------------------------------------------------
describe('sessioner och lösenord', () => {
  let s;
  before(async () => {
    s = await startServer();
    await s.register('sess');
  });
  after(() => s.close());

  test('inloggning sätter HttpOnly-cookie och kort access-token', async () => {
    const l = await loginFull(s, 'sess');
    assert.equal(l.status, 200);
    assert.equal(l.body.expiresIn, 900);
    const c = l.raw.find((x) => x.startsWith('gl_refresh='));
    assert.match(c, /HttpOnly/i);
    assert.match(c, /SameSite=Strict/i);
    assert.match(c, /Path=\/api\/auth/);
    assert.ok(!/Secure/.test(c), 'Secure bara i produktion');
    const payload = jwt.decode(l.body.token);
    assert.equal(payload.exp - payload.iat, 900);
    assert.match(payload.sid, /^[a-f0-9]{32}$/);
  });

  test('refresh roterar och en återanvänd token återkallar sessionen', async () => {
    const l = await loginFull(s, 'sess');
    const r1 = await refresh(s, l.cookie);
    assert.equal(r1.status, 200);
    assert.ok(r1.body.token && r1.cookie && r1.cookie !== l.cookie);
    assert.equal((await s.api('GET', '/api/me', { token: r1.body.token })).status, 200);
    // Samtidig flik med föregående token inom kort tid: ok, ingen ny cookie
    const grace = await refresh(s, l.cookie);
    assert.equal(grace.status, 200);
    assert.equal(grace.cookie, null);
    const r2 = await refresh(s, r1.cookie);
    assert.equal(r2.status, 200);
    // Den första token är nu två rotationer gammal: tecken på stöld, hela sessionen återkallas
    const stolen = await refresh(s, l.cookie);
    assert.equal(stolen.status, 401);
    assert.equal(stolen.body.code, 'session_revoked');
    assert.equal((await refresh(s, r2.cookie)).status, 401);
    const me = await s.api('GET', '/api/me', { token: r2.body.token });
    assert.equal(me.status, 401);
    assert.equal(me.body.code, 'session_revoked');
    assert.equal((await refresh(s, null)).status, 401);
    assert.equal((await refresh(s, 'gl_refresh=skräp')).status, 401);
  });

  test('utgången access-token ger token_expired', async () => {
    const l = await loginFull(s, 'sess');
    const { sid, sub, username } = jwt.decode(l.body.token);
    const expired = jwt.sign({ sub, sid, username, exp: Math.floor(Date.now() / 1000) - 10 }, 'test-secret');
    const r = await s.api('GET', '/api/me', { token: expired });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'token_expired');
    // Gamla tokens utan session (v2) godtas inte
    const legacy = jwt.sign({ sub, username }, 'test-secret', { expiresIn: '30d' });
    assert.equal((await s.api('GET', '/api/me', { token: legacy })).status, 401);
  });

  test('utloggning, sessionslista och logga ut överallt', async () => {
    const a = await loginFull(s, 'sess');
    const b = await loginFull(s, 'sess');
    const list = await s.api('GET', '/api/me/sessions', { token: a.body.token });
    assert.ok(list.body.length >= 2);
    assert.equal(list.body.filter((x) => x.current).length, 1);
    const other = list.body.find((x) => x.id === jwt.decode(b.body.token).sid);
    assert.equal(other.current, false);
    assert.equal((await s.api('DELETE', `/api/me/sessions/${other.id}`, { token: a.body.token })).status, 204);
    assert.equal((await s.api('GET', '/api/me', { token: b.body.token })).status, 401);
    assert.equal((await s.api('DELETE', '/api/me/sessions/finnsinte', { token: a.body.token })).status, 404);

    const res = await fetch(`${s.base}/api/auth/logout`, { method: 'POST', headers: { Cookie: a.cookie } });
    assert.equal(res.status, 204);
    assert.match(res.headers.getSetCookie().join(), /gl_refresh=;/);
    assert.equal((await s.api('GET', '/api/me', { token: a.body.token })).status, 401);

    const c = await loginFull(s, 'sess');
    const d = await loginFull(s, 'sess');
    assert.equal((await s.api('POST', '/api/auth/logout-all', { token: c.body.token })).status, 204);
    assert.equal((await s.api('GET', '/api/me', { token: d.body.token })).status, 401);
    assert.equal((await refresh(s, d.cookie)).status, 401);
  });

  test('lösenordsbyte och lösenordspolicy', async () => {
    for (const password of ['password123', 'qwertyuiop', 'aaaaaaaaaa', 'svagtlosen'.slice(0, 7)]) {
      assert.equal((await s.api('POST', '/api/auth/register', { body: { username: 'policy', password } })).status, 400, password);
    }
    assert.equal((await s.api('POST', '/api/auth/register', { body: { username: 'samesame', password: 'SameSame' } })).status, 400);

    const a = await loginFull(s, 'sess');
    const b = await loginFull(s, 'sess');
    const wrong = await s.api('POST', '/api/me/password', { token: a.body.token, body: { currentPassword: 'fel-losen', newPassword: 'nytt-hemligt-1' } });
    assert.equal(wrong.status, 403);
    assert.equal((await s.api('POST', '/api/me/password', { token: a.body.token, body: { currentPassword: 'hemligt123', newPassword: '12345678' } })).status, 400);
    const okr = await s.api('POST', '/api/me/password', { token: a.body.token, body: { currentPassword: 'hemligt123', newPassword: 'nytt-hemligt-1' } });
    assert.equal(okr.status, 200);
    assert.ok(okr.body.token);
    assert.equal((await s.api('GET', '/api/me', { token: okr.body.token })).status, 200, 'aktuell session lever');
    assert.equal((await s.api('GET', '/api/me', { token: b.body.token })).status, 401, 'andra sessioner återkallade');
    assert.equal((await loginFull(s, 'sess')).status, 401);
    assert.equal((await loginFull(s, 'sess', 'nytt-hemligt-1')).status, 200);
  });
});

// ---------------------------------------------------------------------------------------------
describe('integritet: synlighet, fördröjning, privat profil', () => {
  let s;
  const t = {};
  before(async () => {
    s = await startServer();
    for (const u of ['agare', 'foljare', 'frammande']) t[u] = await s.register(u, { homeIata: 'GOT' });
    await s.api('POST', '/api/users/agare/follow', { token: t.foljare });
  });
  after(() => s.close());

  const sees = async (token, id) => (await s.api('GET', `/api/checkins/${id}`, { token })).status === 200;

  test('inställningar med validering', async () => {
    const r = await s.api('GET', '/api/me/settings', { token: t.agare });
    assert.deepEqual(r.body, {
      isPrivate: false, defaultVisibility: 'public', publishDelayHours: 0, hideHomeAirport: false, notifyHomeVisits: true,
      push: {
        follow: true, follow_request: true, follow_accepted: true, comment: true, like: true, badge: true, home_visit: true, overtaken: true,
        invite_accepted: true, mayor_gained: true, mayor_lost: true, challenge_completed: true,
      },
    });
    const bad = await s.api('PATCH', '/api/me/settings', { token: t.agare, body: { defaultVisibility: 'alla' } });
    assert.equal(bad.status, 400);
    assert.deepEqual(bad.body.allowed, ['public', 'friends', 'private']);
    assert.equal((await s.api('PATCH', '/api/me/settings', { token: t.agare, body: { publishDelayHours: 5 } })).status, 400);
    assert.equal((await s.api('PATCH', '/api/me/settings', { token: t.agare, body: { push: { okand: true } } })).status, 400);
    assert.equal((await s.api('PATCH', '/api/me/settings', { token: t.agare, body: { isPrivate: 'ja' } })).status, 400);
    const p = await s.api('PATCH', '/api/me/settings', { token: t.agare, body: { push: { like: false } } });
    assert.equal(p.body.push.like, false);
    assert.equal(p.body.push.comment, true);
  });

  test('synlighet per check-in', async () => {
    const pub = (await s.api('POST', '/api/checkins', { token: t.agare, body: { ...ok, iata: 'ARN', comment: 'publikord' } })).body;
    const fr = (await s.api('POST', '/api/checkins', { token: t.agare, body: { ...ok, iata: 'CPH', visibility: 'friends', comment: 'vanord' } })).body;
    const pr = (await s.api('POST', '/api/checkins', { token: t.agare, body: { ...ok, iata: 'OSL', visibility: 'private', comment: 'privatord' } })).body;
    assert.equal(fr.visibility, 'friends');
    assert.equal((await s.api('POST', '/api/checkins', { token: t.agare, body: { ...ok, iata: 'OSL', visibility: 'hemlig' } })).status, 400);

    assert.deepEqual([await sees(null, pub.id), await sees(null, fr.id), await sees(null, pr.id)], [true, false, false]);
    assert.deepEqual([await sees(t.frammande, fr.id), await sees(t.foljare, fr.id), await sees(t.foljare, pr.id)], [false, true, false]);
    assert.ok(await sees(t.agare, pr.id));

    const search = async (token, q) => (await s.api('GET', `/api/search?q=${q}`, { token })).body.length;
    assert.deepEqual([await search(null, 'vanord'), await search(t.foljare, 'vanord'), await search(t.foljare, 'privatord'), await search(t.agare, 'privatord')], [0, 1, 0, 1]);
    const feed = (await s.api('GET', '/api/feed', { token: t.frammande })).body.map((c) => c.id);
    assert.ok(feed.includes(pub.id) && !feed.includes(fr.id) && !feed.includes(pr.id));
    const airport = await s.api('GET', '/api/airports/OSL/checkins');
    assert.equal(airport.body.length, 0);
    assert.equal((await s.api('POST', `/api/checkins/${pr.id}/like`, { token: t.foljare })).status, 404);
    assert.equal((await s.api('POST', `/api/checkins/${pr.id}/comments`, { token: t.foljare, body: { body: 'x' } })).status, 404);
    // Profilens flygplatslista räknas på det tittaren får se
    const strangerList = (await s.api('GET', '/api/users/agare/airports', { token: t.frammande })).body.map((x) => x.airport.iata);
    assert.deepEqual(strangerList, ['ARN']);
    const own = (await s.api('GET', '/api/users/agare/airports', { token: t.agare })).body.map((x) => x.airport.iata).sort();
    assert.deepEqual(own, ['ARN', 'CPH', 'OSL']);
    const map = await s.api('GET', '/api/users/agare/map/NO');
    assert.equal(map.body.country.visited, 0);
    // Ändra synlighet i efterhand
    await s.api('PATCH', `/api/checkins/${pr.id}`, { token: t.agare, body: { visibility: 'public' } });
    assert.ok(await sees(null, pr.id));
  });

  test('fördröjd publicering', async () => {
    await s.api('PATCH', '/api/me/settings', { token: t.agare, body: { publishDelayHours: 24 } });
    const c = (await s.api('POST', '/api/checkins', { token: t.agare, body: { ...ok, iata: 'GOT', comment: 'fordrojdord' } })).body;
    assert.ok(Date.parse(c.publishAt) - Date.parse(c.createdAt) >= 24 * 3600_000 - 1000);
    assert.equal(await sees(t.foljare, c.id), false);
    assert.equal(await sees(t.agare, c.id), true);
    assert.equal((await s.api('GET', '/api/search?q=fordrojdord', { token: t.foljare })).body.length, 0);
    assert.ok(!(await s.api('GET', '/api/feed?scope=friends', { token: t.foljare })).body.some((x) => x.id === c.id));
    // Hemmaflygplatsnotis skickas inte för fördröjda check-ins (följaren har GOT som hem, ägaren följer den)
    await s.api('POST', '/api/users/foljare/follow', { token: t.agare });
    const c2 = (await s.api('POST', '/api/checkins', { token: t.agare, body: { ...ok, iata: 'GOT' } })).body;
    const n = await s.api('GET', '/api/notifications', { token: t.foljare });
    assert.ok(!n.body.items.some((x) => x.type === 'home_visit' && x.checkinId === c2.id));
    // När fördröjningen passerat syns den
    s.db.prepare('UPDATE checkins SET publish_at = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), c.id);
    assert.equal(await sees(t.foljare, c.id), true);
    await s.api('PATCH', '/api/me/settings', { token: t.agare, body: { publishDelayHours: 0 } });
  });

  test('home_visit kan stängas av och hemmaflygplats döljas', async () => {
    await s.api('POST', '/api/checkins', { token: t.agare, body: { ...ok, iata: 'GOT' } });
    let n = await s.api('GET', '/api/notifications', { token: t.foljare });
    const before = n.body.items.filter((x) => x.type === 'home_visit').length;
    assert.ok(before >= 1);
    await s.api('PATCH', '/api/me/settings', { token: t.foljare, body: { notifyHomeVisits: false, hideHomeAirport: true } });
    await s.api('POST', '/api/checkins', { token: t.agare, body: { ...ok, iata: 'GOT' } });
    n = await s.api('GET', '/api/notifications', { token: t.foljare });
    assert.equal(n.body.items.filter((x) => x.type === 'home_visit').length, before);
    assert.equal((await s.api('GET', '/api/users/foljare', { token: t.agare })).body.homeIata, null);
    assert.equal((await s.api('GET', '/api/me', { token: t.foljare })).body.homeIata, 'GOT');
    const listed = (await s.api('GET', '/api/users/agare/followers', { token: t.agare })).body.find((u) => u.username === 'foljare');
    assert.equal(listed.homeIata, null);
  });

  test('privat profil med följförfrågningar', async () => {
    await s.api('PATCH', '/api/me/settings', { token: t.agare, body: { isPrivate: true } });
    const pub = (await s.api('POST', '/api/checkins', { token: t.agare, body: { ...ok, iata: 'HEL' } })).body;
    assert.equal(await sees(t.frammande, pub.id), false, 'publik check-in på privat profil syns bara för följare');
    assert.equal(await sees(t.foljare, pub.id), true);

    const prof = await s.api('GET', '/api/users/agare', { token: t.frammande });
    assert.equal(prof.body.isPrivate, true);
    assert.equal(prof.body.canView, false);
    assert.equal(prof.body.stats, null);
    for (const path of ['checkins', 'airports', 'map', 'map/SE', 'wishlist', 'badges', 'followers', 'following', 'card']) {
      const r = await s.api('GET', `/api/users/agare/${path}`, { token: t.frammande });
      assert.equal(r.status, 403, path);
      assert.equal(r.body.code, 'private_profile', path);
    }
    assert.equal((await s.api('GET', '/api/users/agare/checkins', { token: t.foljare })).status, 200);

    const f = await s.api('POST', '/api/users/agare/follow', { token: t.frammande });
    assert.deepEqual(f.body, { following: false, requested: true, followers: 1 });
    assert.equal((await s.api('GET', '/api/users/agare', { token: t.frammande })).body.followRequested, true);
    const reqs = await s.api('GET', '/api/me/follow-requests', { token: t.agare });
    assert.deepEqual(reqs.body.map((x) => x.username), ['frammande']);
    let n = await s.api('GET', '/api/notifications', { token: t.agare });
    assert.equal(n.body.items[0].type, 'follow_request');
    assert.equal(n.body.items[0].text, 'frammande vill följa dig');

    // Global topplista döljer privata profiler för icke-följare
    const lb = async (token) => (await s.api('GET', '/api/rankings/users?metric=airports', { token })).body.items.map((x) => x.user.username);
    assert.ok(!(await lb(t.frammande)).includes('agare'));
    assert.ok((await lb(t.foljare)).includes('agare'));
    assert.ok((await lb(t.agare)).includes('agare'));

    assert.equal((await s.api('POST', '/api/me/follow-requests/frammande', { token: t.agare })).status, 204);
    assert.equal((await s.api('POST', '/api/me/follow-requests/frammande', { token: t.agare })).status, 404);
    n = await s.api('GET', '/api/notifications', { token: t.frammande });
    assert.equal(n.body.items[0].type, 'follow_accepted');
    assert.equal(n.body.items[0].url, '/u/agare');
    assert.equal((await s.api('GET', '/api/users/agare', { token: t.frammande })).body.canView, true);
    assert.equal(await sees(t.frammande, pub.id), true);

    // Avböj
    const extra = await s.register('extra');
    await s.api('POST', '/api/users/agare/follow', { token: extra });
    assert.equal((await s.api('DELETE', '/api/me/follow-requests/extra', { token: t.agare })).status, 204);
    assert.equal((await s.api('GET', '/api/users/agare', { token: extra })).body.followRequested, false);
    // Publik igen: väntande förfrågningar godkänns
    await s.api('POST', '/api/users/agare/follow', { token: extra });
    await s.api('PATCH', '/api/me/settings', { token: t.agare, body: { isPrivate: false } });
    assert.equal((await s.api('GET', '/api/users/agare', { token: extra })).body.followedByMe, true);
  });
});

// ---------------------------------------------------------------------------------------------
describe('blockering, rapporter och moderering', () => {
  let s;
  const t = {};
  let cid;
  before(async () => {
    s = await startServer({ env: { NODE_ENV: 'test', MODERATORS: 'moddo' } });
    for (const u of ['olle', 'troll', 'moddo']) t[u] = await s.register(u);
    await s.api('POST', '/api/users/olle/follow', { token: t.troll });
    await s.api('POST', '/api/users/troll/follow', { token: t.olle });
    cid = (await s.api('POST', '/api/checkins', { token: t.olle, body: { ...ok, iata: 'GOT', comment: 'blockord' } })).body.id;
    await s.api('POST', `/api/checkins/${cid}/comments`, { token: t.troll, body: { body: 'Elak kommentar' } });
  });
  after(() => s.close());

  test('blockera döljer åt båda håll och tar bort följningar', async () => {
    assert.equal((await s.api('POST', '/api/users/olle/block', { token: t.olle })).status, 400);
    assert.equal((await s.api('POST', '/api/users/troll/block', { token: t.olle })).status, 204);
    assert.deepEqual((await s.api('GET', '/api/me/blocks', { token: t.olle })).body.map((x) => x.username), ['troll']);
    assert.equal((await s.api('GET', '/api/users/olle', { token: t.troll })).body.followers, 0);
    assert.equal((await s.api('POST', '/api/users/olle/follow', { token: t.troll })).status, 403);
    assert.equal((await s.api('GET', `/api/checkins/${cid}`, { token: t.troll })).status, 404);
    assert.equal((await s.api('POST', `/api/checkins/${cid}/like`, { token: t.troll })).status, 404);
    assert.equal((await s.api('POST', `/api/checkins/${cid}/comments`, { token: t.troll, body: { body: 'igen' } })).status, 404);
    assert.equal((await s.api('GET', '/api/search?q=blockord', { token: t.troll })).body.length, 0);
    const comments = await s.api('GET', `/api/checkins/${cid}/comments`, { token: t.olle });
    assert.equal(comments.body.length, 0, 'blockerades kommentarer döljs');
    assert.equal((await s.api('GET', `/api/checkins/${cid}/comments`)).body.length, 1, 'andra ser dem');
    const n = await s.api('GET', '/api/notifications', { token: t.olle });
    assert.ok(!n.body.items.some((x) => x.actor?.username === 'troll'), 'notiser från den blockerade tas bort');
    assert.equal((await s.api('DELETE', '/api/users/troll/block', { token: t.olle })).status, 204);
    assert.equal((await s.api('GET', `/api/checkins/${cid}`, { token: t.troll })).status, 200);
  });

  test('rapportera och moderera', async () => {
    const comment = (await s.api('GET', `/api/checkins/${cid}/comments`)).body[0];
    const bad = await s.api('POST', '/api/reports', { token: t.olle, body: { type: 'comment', target: comment.id, reason: 'tråkig' } });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.allowed.includes('harassment'));
    assert.equal((await s.api('POST', '/api/reports', { token: t.olle, body: { type: 'comment', target: 999999, reason: 'spam' } })).status, 404);
    assert.equal((await s.api('POST', '/api/reports', { token: t.olle, body: { type: 'user', target: 'olle', reason: 'spam' } })).status, 400);
    const r1 = await s.api('POST', '/api/reports', { token: t.olle, body: { type: 'comment', target: comment.id, reason: 'harassment', note: 'Hotfullt' } });
    assert.equal(r1.status, 201);
    const again = await s.api('POST', '/api/reports', { token: t.olle, body: { type: 'comment', target: comment.id, reason: 'harassment' } });
    assert.equal(again.status, 200);
    assert.equal(again.body.id, r1.body.id);
    await s.api('POST', '/api/reports', { token: t.moddo, body: { type: 'comment', target: comment.id, reason: 'spam' } });
    const ru = await s.api('POST', '/api/reports', { token: t.olle, body: { type: 'user', target: 'troll', reason: 'spam' } });
    assert.equal(ru.status, 201);

    assert.equal((await s.api('GET', '/api/moderation/reports', { token: t.olle })).status, 403);
    assert.equal((await s.api('GET', '/api/me', { token: t.moddo })).body.isModerator, true);
    const list = await s.api('GET', '/api/moderation/reports', { token: t.moddo });
    const item = list.body.find((x) => x.id === r1.body.id);
    assert.equal(item.reportCount, 2);
    assert.equal(item.target.body, 'Elak kommentar');
    assert.equal(item.reporter, 'olle');
    assert.equal(list.body.find((x) => x.type === 'user').target.username, 'troll');
    assert.equal((await s.api('GET', '/api/moderation/reports?status=fel', { token: t.moddo })).status, 400);
    assert.equal((await s.api('POST', `/api/moderation/reports/${ru.body.id}`, { token: t.moddo, body: { action: 'remove_content' } })).status, 400);

    const done = await s.api('POST', `/api/moderation/reports/${r1.body.id}`, { token: t.moddo, body: { action: 'remove_content' } });
    assert.equal(done.body.status, 'resolved');
    assert.equal(done.body.target.exists, false);
    assert.equal((await s.api('GET', `/api/checkins/${cid}/comments`)).body.length, 0);
    const open = await s.api('GET', '/api/moderation/reports?status=open', { token: t.moddo });
    assert.deepEqual(open.body.map((x) => x.type), ['user'], 'båda rapporterna om kommentaren avslutades');
    const dis = await s.api('POST', `/api/moderation/reports/${ru.body.id}`, { token: t.moddo, body: { action: 'dismiss' } });
    assert.equal(dis.body.status, 'dismissed');
    const log = await s.api('GET', '/api/moderation/log', { token: t.moddo });
    assert.deepEqual(log.body.map((x) => [x.moderator, x.action, x.targetType]), [['moddo', 'dismiss', 'user'], ['moddo', 'remove_content', 'comment']]);
    assert.equal(log.body[1].detail.body, 'Elak kommentar', 'raderat innehåll finns kvar i loggen');
    assert.equal((await s.api('GET', '/api/moderation/log', { token: t.olle })).status, 403);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Web Push och overtaken', () => {
  let s;
  const sent = [];
  const t = {};
  const sub = (n) => ({ endpoint: `https://push.example.test/sub/${n}`, keys: { p256dh: 'BPublicKeyPublicKey' + n, auth: 'authsecret' + n } });
  before(async () => {
    s = await startServer({
      pushSender: async (subscription, payload) => {
        sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) });
        if (subscription.endpoint.endsWith('/gone')) throw Object.assign(new Error('gone'), { statusCode: 410 });
      },
    });
    for (const u of ['pusha', 'pushb']) t[u] = await s.register(u);
  });
  after(() => s.close());

  test('prenumerationer och utskick per notistyp', async () => {
    assert.deepEqual((await s.api('GET', '/api/push/public-key')).body, { enabled: true, publicKey: null });
    assert.equal((await s.api('POST', '/api/push/subscriptions', { token: t.pusha, body: { endpoint: 'http://osäker', keys: sub(1).keys } })).status, 400);
    assert.equal((await s.api('POST', '/api/push/subscriptions', { token: t.pusha, body: { endpoint: sub(1).endpoint } })).status, 400);
    assert.equal((await s.api('POST', '/api/push/subscriptions', { body: sub(1) })).status, 401);
    assert.equal((await s.api('POST', '/api/push/subscriptions', { token: t.pusha, body: sub(1) })).status, 201);
    assert.equal((await s.api('POST', '/api/push/subscriptions', { token: t.pusha, body: { ...sub(1), endpoint: 'https://push.example.test/gone' } })).status, 201);

    await s.api('POST', '/api/users/pusha/follow', { token: t.pushb });
    await s.app.locals.push.flush();
    const follow = sent.filter((x) => x.payload.type === 'follow');
    assert.equal(follow.length, 2);
    assert.deepEqual(Object.keys(follow[0].payload).sort(), ['body', 'notificationId', 'tag', 'title', 'type', 'url']);
    assert.equal(follow[0].payload.body, 'pushb började följa dig');
    assert.equal(follow[0].payload.url, '/u/pushb');
    assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint LIKE '%gone'").get().n, 0, '410 tar bort prenumerationen');

    // Avstängd typ skickas inte
    await s.api('PATCH', '/api/me/settings', { token: t.pusha, body: { push: { like: false } } });
    const c = (await s.api('POST', '/api/checkins', { token: t.pusha, body: { ...ok, iata: 'GOT' } })).body;
    sent.length = 0;
    await s.api('POST', `/api/checkins/${c.id}/like`, { token: t.pushb });
    await s.api('POST', `/api/checkins/${c.id}/comments`, { token: t.pushb, body: { body: 'Hej' } });
    await s.app.locals.push.flush();
    assert.deepEqual(sent.map((x) => x.payload.type), ['comment']);
    assert.equal(sent[0].payload.url, `/c/${c.id}`);

    assert.equal((await s.api('DELETE', '/api/push/subscriptions', { token: t.pusha, body: { endpoint: sub(1).endpoint } })).status, 204);
    sent.length = 0;
    await s.api('POST', `/api/checkins/${c.id}/comments`, { token: t.pushb, body: { body: 'Igen' } });
    await s.app.locals.push.flush();
    assert.equal(sent.length, 0);
  });

  test('overtaken: en notis per vecka när någon du följer går om dig', async () => {
    const leader = await s.register('ledare');
    const chaser = await s.register('jagare');
    await s.api('POST', '/api/users/jagare/follow', { token: leader });
    // ledare har två flygplatser denna vecka
    for (const iata of ['ARN', 'CPH']) await s.api('POST', '/api/checkins', { token: leader, body: { ...ok, iata } });
    const ci = (iata) => s.api('POST', '/api/checkins', { token: chaser, body: { ...ok, iata } });
    await ci('OSL');
    await ci('HEL');
    let n = await s.api('GET', '/api/notifications', { token: leader });
    assert.equal(n.body.items.filter((x) => x.type === 'overtaken').length, 0, 'lika är inte förbi');
    await ci('HEL'); // samma flygplats igen: inget nytt
    await ci('AMS');
    n = await s.api('GET', '/api/notifications', { token: leader });
    const ot = n.body.items.filter((x) => x.type === 'overtaken');
    assert.equal(ot.length, 1);
    assert.equal(ot[0].text, 'jagare gick om dig på veckans topplista');
    assert.equal(ot[0].url, '/leaderboard');
    assert.match(ot[0].groupKey, /^overtaken:\d{4}-\d{2}-\d{2}$/);
    // Ledaren tar ledningen igen och jagaren går om en gång till: fortfarande högst en notis per vecka
    for (const iata of ['FRA', 'MUC']) await s.api('POST', '/api/checkins', { token: leader, body: { ...ok, iata } });
    for (const iata of ['ZRH', 'VIE']) await ci(iata);
    n = await s.api('GET', '/api/notifications', { token: leader });
    assert.equal(n.body.items.filter((x) => x.type === 'overtaken').length, 1);
    // Förra veckans check-ins räknas inte
    const old = await s.register('gammal');
    await s.api('POST', '/api/users/gammal/follow', { token: chaser });
    for (const iata of ['GOT', 'LHR', 'CDG', 'BRU', 'DUB', 'MAD']) {
      await s.api('POST', '/api/checkins', { token: old, body: { visitedOn: daysAgo(8), kind: 'departure', iata } });
    }
    assert.equal((await s.api('GET', '/api/notifications', { token: chaser })).body.items.filter((x) => x.type === 'overtaken').length, 0);
  });
});

// ---------------------------------------------------------------------------------------------
describe('strikt validering av frågeparametrar', () => {
  let s;
  before(async () => { s = await startServer(); });
  after(() => s.close());

  test('okända värden ger 400 med giltiga värden', async () => {
    const cases = [
      ['/api/rankings/users?metric=bogus', 'metric'],
      ['/api/rankings/users?period=decade', 'period'],
      ['/api/rankings/users?scope=galaxy', 'scope'],
      ['/api/rankings/airports?category=views', 'category'],
      ['/api/rankings/airports?type=huge', 'type'],
      ['/api/airports?sort=random', 'sort'],
      ['/api/airports?visited=maybe', 'visited'],
      ['/api/airports?type=tiny', 'type'],
      ['/api/airports/nearby?lat=1&lon=1&scope=x', 'scope'],
      ['/api/countries?sort=size', 'sort'],
      ['/api/lounges?sort=price', 'sort'],
      ['/api/search?q=x&sort=best', 'sort'],
      ['/api/feed?scope=everyone', 'scope'],
    ];
    for (const [path, name] of cases) {
      const r = await s.api('GET', path);
      assert.equal(r.status, 400, path);
      assert.ok(Array.isArray(r.body.allowed) && r.body.allowed.length > 1, path);
      assert.match(r.body.error, new RegExp(`^${name} måste vara en av`), path);
    }
    assert.equal((await s.api('GET', '/api/rankings/users?metric=airports&period=week')).status, 200);
  });
});
