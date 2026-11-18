// S6 Webbläsarsäkerhet (headers, CSP, CORS, CSRF), S7 Tillgänglighet/DoS och SSRF via push.
// Se docs/SECURITY-REVIEW.md.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer } from './helpers.mjs';

describe('S6 headers, CORS och CSRF', () => {
  let s;
  before(async () => { s = await startServer(); });
  after(() => s.close());

  test('säkerhetsheaders finns på HTML och API', async () => {
    for (const p of ['/', '/api/health', '/u/finnsinte']) {
      const h = (await s.api('GET', p)).headers;
      assert.equal(h.get('x-content-type-options'), 'nosniff', p);
      assert.equal(h.get('x-frame-options'), 'DENY', p);
      assert.match(h.get('content-security-policy'), /frame-ancestors 'none'/, p);
      assert.match(h.get('content-security-policy'), /script-src 'self'(;|$)/, p);
      assert.match(h.get('content-security-policy'), /object-src 'none'/, p);
      assert.equal(h.get('referrer-policy'), 'no-referrer', p);
      assert.ok(h.get('strict-transport-security'), p);
      assert.ok(h.get('permissions-policy'), p);
      assert.equal(h.get('cross-origin-opener-policy'), 'same-origin', p);
      assert.equal(h.get('x-powered-by'), null, p);
    }
  });

  test('ingen CORS för främmande origin i produktion', async () => {
    const r = await s.api('OPTIONS', '/api/me', { headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
    assert.equal(r.headers.get('access-control-allow-origin'), null);
    const g = await s.api('GET', '/api/health', { headers: { Origin: 'https://evil.example' } });
    assert.equal(g.headers.get('access-control-allow-origin'), null);
  });

  test('API kräver Bearer-token; cookien ensam ger ingen åtkomst (CSRF-skydd)', async () => {
    const u = await s.user('csrf');
    assert.equal((await s.api('GET', '/api/me', { cookie: u.cookie })).status, 401);
    assert.equal((await s.api('POST', '/api/checkins', { cookie: u.cookie, body: { iata: 'GOT', visitedOn: '2026-01-01', kind: 'departure' } })).status, 401);
  });

  test('SEC-10: CSP utan unsafe-inline för stilar och HSTS minst ett år', { todo: 'SEC-10' }, async () => {
    const h = (await s.api('GET', '/')).headers;
    assert.doesNotMatch(h.get('content-security-policy'), /unsafe-inline/);
    const maxAge = Number(/max-age=(\d+)/.exec(h.get('strict-transport-security'))[1]);
    assert.ok(maxAge >= 31536000, `HSTS max-age ${maxAge}`);
  });

  test('SEC-21: Open Graph-taggar använder inte Host-headern (kräver PUBLIC_URL i produktion)', { todo: 'SEC-21' }, async () => {
    // fetch tillåter inte egen Host-header, därför node:http.
    const text = await new Promise((resolve, reject) => {
      http.get(`${s.base}/airport/GOT`, { headers: { Host: 'evil.example' } }, (res) => {
        let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve(b));
      }).on('error', reject);
    });
    assert.doesNotMatch(text, /evil\.example/);
  });
});

describe('S7 SSRF via push-endpoint', () => {
  let s;
  before(async () => { s = await startServer(); });
  after(() => s.close());

  test('SEC-06: push-endpoint måste vara en känd push-tjänst (ingen intern/godtycklig URL)', async () => {
    const u = await s.user('ssrf');
    const keys = { p256dh: 'BOrpKz0aa1aaaaaaaaaaaaaaaa', auth: 'aaaaaaaaaaaaaaaa' };
    const bad = ['https://127.0.0.1:6379/', 'https://169.254.169.254/latest/meta-data/', 'https://localhost:8795/api/auth/logout-all',
      'https://10.0.0.5/admin', 'https://[::1]/', 'https://evil.example/collect'];
    const accepted = [];
    for (const endpoint of bad) {
      const r = await s.api('POST', '/api/push/subscriptions', { token: u.token, body: { endpoint, keys } });
      if (r.status < 300) accepted.push(endpoint);
    }
    assert.deepEqual(accepted, [], 'servern kommer att skicka POST till dessa adresser vid varje notis');
  });
});

describe('S7 rate limiting och DoS', () => {
  test('skrivgräns: 61:a check-in inom en timme ger 429 (produktionsgränser)', async () => {
    const s = await startServer({ limits: true });
    try {
      const u = await s.user('rl');
      let last;
      for (let i = 0; i < 61; i++) {
        last = await s.api('POST', '/api/checkins', { token: u.token, body: { iata: 'GOT', visitedOn: '2026-01-01', kind: 'departure' } });
      }
      assert.equal(last.status, 429);
    } finally { s.close(); }
  });

  test('SEC-07: en import på 1 MB blockerar inte servern mer än 250 ms och importer har egen gräns', async () => {
    const s = await startServer({ limits: true });
    try {
      const u = await s.user('dos');
      const codes = s.db.prepare('SELECT iata FROM airports WHERE scheduled = 1 LIMIT 300').all().map((r) => r.iata);
      let csv = 'date,from,to,comment\n';
      for (let i = 0; i < 5000; i++) {
        const d = new Date(Date.UTC(2000, 0, 1) + i * 86400000).toISOString().slice(0, 10);
        csv += `${d},${codes[i % 300]},${codes[(i + 7) % 300]},${'x'.repeat(150)}\n`;
      }
      let maxLag = 0; let last = Date.now();
      const iv = setInterval(() => { const n = Date.now(); maxLag = Math.max(maxLag, n - last - 10); last = n; }, 10);
      const r = await s.api('POST', '/api/me/imports', { token: u.token, body: csv, headers: { 'Content-Type': 'text/csv' } });
      clearInterval(iv);
      assert.equal(r.status, 201);
      assert.ok(maxLag < 250, `händelseloopen blockerades ${maxLag} ms för ${r.body.imported} check-ins`);
      let limited = false;
      for (let i = 0; i < 5 && !limited; i++) {
        const csv2 = csv.replaceAll('20', '19');
        limited = (await s.api('POST', '/api/me/imports', { token: u.token, body: csv2.slice(0, 200000), headers: { 'Content-Type': 'text/csv' } })).status === 429;
      }
      assert.ok(limited, 'ingen egen gräns för importer');
    } finally { s.close(); }
  });

  test('SEC-22: läsande endpoints (sök, topplistor) har rate limit', { todo: 'SEC-22' }, async () => {
    const s = await startServer({ limits: true });
    try {
      let got429 = false;
      for (let i = 0; i < 400 && !got429; i++) got429 = (await s.api('GET', `/api/search?q=kaffe${i}`)).status === 429;
      assert.ok(got429, '400 sökningar på rad utan 429');
    } finally { s.close(); }
  });
});
