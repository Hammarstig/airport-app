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
