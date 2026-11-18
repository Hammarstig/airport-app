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
