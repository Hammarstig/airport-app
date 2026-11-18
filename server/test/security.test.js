// Enhetstester för säkerhetsåtgärder (SEC-16, SEC-15).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failureGuard } from '../src/auth.js';
import { parseCookies } from '../src/sessions.js';

test('SEC-16: kontospärr ger fördröjning, hård spärr först vid hög gräns och inte för känd enhet', () => {
  const g = failureGuard({ windowMs: 60_000, perAccountIp: 10, perAccount: 5, accountHardMax: 8, delayStepMs: 100, maxDelayMs: 250 });
  const keys = (ip) => [`a:u|${ip}`, 't:u'];
  for (let i = 0; i < 4; i++) g.fail(keys(`ip${i}`));
  assert.equal(g.delay(keys('x')), 0);
  g.fail(keys('ip9'));
  assert.equal(g.delay(keys('x')), 100);
  assert.equal(g.blocked(keys('x')), 0);
  for (let i = 0; i < 3; i++) g.fail(keys(`ip${i + 20}`));
  assert.equal(g.delay(keys('x')), 250, 'taket för fördröjning');
  assert.ok(g.blocked(keys('x')) > 0, 'hård spärr vid accountHardMax');
  assert.equal(g.blocked(keys('x'), { knownDevice: true }), 0, 'känd enhet släpps förbi');
  for (let i = 0; i < 10; i++) g.fail(['a:v|1']);
  assert.ok(g.blocked(['a:v|1'], { knownDevice: true }) > 0, 'konto+IP-spärren gäller alltid');
});

test('SEC-15: trasig procentkodning i cookie kastar inte', () => {
  assert.deepEqual(parseCookies('gl_refresh=%E0%A4%A; a=b'), { gl_refresh: '%E0%A4%A', a: 'b' });
});

test('SEC-14: säkerhetshändelser loggas utan lösenord och tokens', async () => {
  const { startServer } = await import('./helpers.js');
  const events = [];
  const s = await startServer({ securityLogSink: (e) => events.push(e), env: { NODE_ENV: 'test', LOGIN_FAIL_MAX: '2' } });
  try {
    const tok = await s.register('loggad');
    const login = (password) => s.api('POST', '/api/auth/login', { body: { username: 'loggad', password } });
    assert.equal((await login('fel-losen-1')).status, 401);
    assert.equal((await login('fel-losen-2')).status, 401);
    assert.equal((await login('hemligt123')).status, 429);
    await s.api('POST', '/api/me/password', { token: tok, body: { currentPassword: 'hemligt123', newPassword: 'nyttHemligt456' } });
    await s.api('POST', '/api/auth/logout-all', { token: tok });
    const types = events.map((e) => e.type);
    for (const t of ['register', 'login_fail', 'login_blocked', 'password_change', 'logout_all']) assert.ok(types.includes(t), t);
    const fail = events.find((e) => e.type === 'login_fail');
    assert.equal(fail.log, 'security');
    assert.ok(fail.userId && fail.ip && fail.reqId);
    const text = JSON.stringify(events);
    for (const secret of ['hemligt123', 'fel-losen', 'nyttHemligt456', tok]) assert.ok(!text.includes(secret), secret);
  } finally { s.close(); }
});

test('SEC-27: radering pseudonymiserar rapporter och modereringslogg; gallring rensar gamla sessioner', async () => {
  const { startServer, daysAgo } = await import('./helpers.js');
  const { purgeExpired } = await import('../src/retention.js');
  const s = await startServer();
  try {
    const bort = await s.register('bortfaren');
    const ang = await s.register('anmalare');
    const mod = await s.register('modda');
    s.db.prepare("UPDATE users SET role = 'moderator' WHERE username = 'modda'").run();
    const c = await s.api('POST', '/api/checkins', { token: bort, body: { iata: 'GOT', visitedOn: daysAgo(1), kind: 'departure', comment: 'Personligt innehåll' } });
    await s.api('POST', '/api/reports', { token: ang, body: { type: 'user', target: 'bortfaren', reason: 'other', note: 'Heter egentligen X' } });
    const rc = await s.api('POST', '/api/reports', { token: ang, body: { type: 'checkin', target: c.body.id, reason: 'spam' } });
    await s.api('POST', `/api/moderation/reports/${rc.body.id}`, { token: mod, body: { action: 'remove_content' } });
    assert.match(s.db.prepare('SELECT detail FROM moderation_log').get().detail, /Personligt/);
    assert.equal(s.db.prepare('PRAGMA secure_delete').get().secure_delete, 1);
    assert.equal((await s.api('DELETE', '/api/me', { token: bort, body: { password: 'hemligt123' } })).status, 204);
    assert.equal(s.db.prepare("SELECT note FROM reports WHERE type = 'user'").get().note, null);
    assert.equal(s.db.prepare('SELECT detail FROM moderation_log').get().detail, null);
    s.db.prepare("UPDATE sessions SET revoked_at = '2000-01-01T00:00:00Z' WHERE user_id = (SELECT id FROM users WHERE username = 'anmalare')").run();
    assert.ok(purgeExpired(s.db).sessions >= 1);
  } finally { s.close(); }
});

test('SEC-06/13/18: push-endpoint vitlistas, följer sessionen och kan inte tas över', async () => {
  const { startServer } = await import('./helpers.js');
  const { validEndpoint } = await import('../src/routes/push.js');
  for (const bad of ['https://127.0.0.1/', 'https://[::1]/', 'https://fcm.googleapis.com:8443/x', 'https://evil.example/x',
    'https://notify.windows.com.evil.example/x', 'http://fcm.googleapis.com/x']) assert.equal(validEndpoint(bad), false, bad);
  for (const good of ['https://fcm.googleapis.com/fcm/send/a', 'https://wns2-db5p.notify.windows.com/w/?token=x',
    'https://web.push.apple.com/abc']) assert.equal(validEndpoint(good), true, good);

  const s = await startServer();
  try {
    const keys = { p256dh: 'BPublicKeyPublicKey1', auth: 'authsecret1' };
    const endpoint = 'https://fcm.googleapis.com/fcm/send/enhet-1';
    const login = async (u) => (await s.api('POST', '/api/auth/login', { body: { username: u, password: 'hemligt123' } })).body.token;
    await s.register('pusha1'); await s.register('pushb1');
    const a = await login('pusha1');
    const b = await login('pushb1');
    assert.equal((await s.api('POST', '/api/push/subscriptions', { token: a, body: { endpoint, keys } })).status, 201);
    assert.equal((await s.api('POST', '/api/push/subscriptions', { token: b, body: { endpoint, keys } })).status, 409);
    assert.equal((await s.api('POST', '/api/auth/logout', { token: a })).status, 204);
    const n = () => s.db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?').get(endpoint).n;
    assert.equal(n(), 0, 'utloggning tar bort enhetens prenumeration');
    assert.equal((await s.api('POST', '/api/push/subscriptions', { token: b, body: { endpoint, keys } })).status, 201);
    await s.api('POST', '/api/auth/logout-all', { token: b });
    assert.equal(n(), 0, 'logga ut alla tar bort prenumerationer');
  } finally { s.close(); }
});

test('SEC-09: foto på privat check-in kräver inloggad tittare (mediacookie) och cachas inte publikt', async () => {
  const { startServer, daysAgo } = await import('./helpers.js');
  const s = await startServer();
  try {
    await s.register('fotograf');
    const login = await s.api('POST', '/api/auth/login', { body: { username: 'fotograf', password: 'hemligt123' } });
    const tok = login.body.token;
    const media = login.headers.getSetCookie().find((c) => c.startsWith('gl_media='));
    assert.match(media, /HttpOnly/i);
    assert.match(media, /Path=\/uploads/);
    const cookie = media.split(';')[0];
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c20000000049454e44ae426082', 'hex');
    const c = await s.api('POST', '/api/checkins', { token: tok, body: { iata: 'GOT', visitedOn: daysAgo(1), kind: 'departure', visibility: 'private' } });
    const fd = new FormData();
    fd.append('photo', new Blob([png], { type: 'image/png' }), 'a.png');
    const up = await s.api('POST', `/api/checkins/${c.body.id}/photos`, { token: tok, body: fd });
    assert.equal(up.status, 201, JSON.stringify(up.body));
    assert.equal((await s.api('GET', up.body.url)).status, 404, 'utloggad');
    assert.equal((await s.api('GET', up.body.url, { headers: { Cookie: 'gl_media=x.1.y' } })).status, 404, 'falsk cookie');
    const ok = await s.api('GET', up.body.url, { headers: { Cookie: cookie } });
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('cache-control'), /private/);
    await s.api('POST', '/api/auth/logout', { token: tok });
    assert.equal((await s.api('GET', up.body.url, { headers: { Cookie: cookie } })).status, 404, 'utloggad session');
  } finally { s.close(); }
});
