// S4 Indatavalidering och injektion, S5 Filuppladdning och media. Se docs/SECURITY-REVIEW.md.
// Testbilderna i fixtures/ är skapade med Pillow 12.3 (64x48): EXIF med kameramodell "SecretPhone"
// och GPS 57°40'12.5"N 11°58'01"E. mpf.jpg = gps.jpg följd av en andra JPEG med samma EXIF efter
// EOI, så som MPF/Ultra HDR-bilder från mobiler är uppbyggda.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './helpers.mjs';

const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fx = (n) => readFileSync(join(FX, n));
const hasMeta = (buf) => buf.includes(Buffer.from('Exif\0\0')) || buf.includes(Buffer.from('SecretPhone'));

describe('S4 injektion', () => {
  let s; let u;
  before(async () => {
    s = await startServer();
    u = await s.user('inj', { privacy: { publishDelayHours: 0 } });
    await s.checkin(u, { comment: 'bra kaffe och snabb kontroll' });
  });
  after(() => s.close());

  test('SQL- och FTS5-nyttolaster ger aldrig 500', async () => {
    const payloads = ['\' OR 1=1 --', '" OR "1"="1', 'kaffe" NEAR("a" "b")', 'a*:b', '^kaffe', 'comment:kaffe', '(((', '"', '*', 'NOT kaffe',
      'kaffe AND OR NOT', '1; DROP TABLE users; --', '%_\\', 'x'.repeat(5000)];
    for (const q of payloads) {
      for (const p of [`/api/search?q=${encodeURIComponent(q)}`, `/api/airports?q=${encodeURIComponent(q)}`, `/api/users?q=${encodeURIComponent(q)}`,
        `/api/lounges?q=${encodeURIComponent(q)}`, `/api/airlines?q=${encodeURIComponent(q)}`]) {
        const r = await s.api('GET', p);
        assert.ok(r.status < 500, `${p} gav ${r.status}`);
      }
    }
    for (const p of ['/api/search?q=kaffe&iata=GOT%22%20OR%20', '/api/rankings/users?metric=xp;--', '/api/rankings/airports?category=overall%20--',
      '/api/users/x/airports?sort=rating;DROP', '/api/feed?scope=global%27', '/api/search?q=kaffe&minRating=1e309']) {
      const r = await s.api('GET', p);
      assert.ok(r.status < 500, `${p} gav ${r.status}`);
    }
    assert.ok(s.db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0);
  });

  test('XSS i visningsnamn och kommentar escapas i OG-sidor och SVG-kort', async () => {
    const x = await s.user('xss', { privacy: { publishDelayHours: 0 } });
    const evil = '"><script>alert(1)</script><svg onload=alert(2)>';
    await s.api('PATCH', '/api/me', { token: x.token, body: { displayName: evil.slice(0, 40) } });
    const c = await s.checkin(x, { comment: `${evil}</text><script>alert(3)</script>`, visibility: 'public' });
    for (const p of [`/c/${c.id}`, `/u/${x.username}`, `/api/checkins/${c.id}/card.svg`, `/api/users/${x.username}/card.svg`]) {
      const r = await s.api('GET', p);
      assert.equal(r.status, 200, p);
      assert.doesNotMatch(r.text, /<script>alert|<svg onload/i, p);
    }
  });

  test('X-Request-Id med radbrytning eller skräp ersätts (ingen header-injektion)', async () => {
    const r = await s.api('GET', '/api/health', { headers: { 'X-Request-Id': 'abc def<script>' } });
    assert.match(r.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  });

  test('CSV-import: formler lagras som text och exporten är JSON (ingen CSV-injektion i export)', async () => {
    const r = await s.api('POST', '/api/me/imports', { token: u.token, body: 'date,iata,comment\n2019-05-01,CPH,"=HYPERLINK(""http://evil.example"",""x"")"\n', headers: { 'Content-Type': 'text/csv' } });
    assert.equal(r.status, 201);
    const exp = await s.api('GET', '/api/me/export', { token: u.token });
    assert.match(exp.headers.get('content-type'), /application\/json/);
  });

  test('SEC-20: CSV-import rensar kontroll- och riktningstecken som övriga skrivvägar', { todo: 'SEC-20' }, async () => {
    const r = await s.api('POST', '/api/me/imports', { token: u.token, body: 'date,iata,comment\n2019-06-01,OSL,a\u0001fejk\u0002b‮evil\n', headers: { 'Content-Type': 'text/csv' } });
    assert.equal(r.status, 201);
    const c = s.db.prepare("SELECT comment FROM checkins WHERE user_id = ? AND iata = 'OSL'").get(u.id);
    assert.doesNotMatch(c.comment, /[\u0001\u0002‮]/);
  });
});

describe('S5 filuppladdning', () => {
  let s; let u; let c;
  const upload = async (buf, name, type, checkinId = c.id) => {
    const fd = new FormData();
    fd.append('photo', new Blob([buf], { type }), name);
    return s.api('POST', `/api/checkins/${checkinId}/photos`, { token: u.token, body: fd });
  };
  const stored = async (url) => Buffer.from(await (await s.api('GET', url, { raw: true })).arrayBuffer());
  before(async () => {
    s = await startServer();
    u = await s.user('up', { privacy: { publishDelayHours: 0 } });
    c = await s.checkin(u);
  });
  after(() => s.close());

  test('EXIF/GPS tas bort ur JPEG, PNG och WEBP', async () => {
    for (const [f, type] of [['gps.jpg', 'image/jpeg'], ['gps.png', 'image/png'], ['gps.webp', 'image/webp']]) {
      assert.ok(hasMeta(fx(f)), `fixturen ${f} saknar EXIF`);
      const cc = await s.checkin(u);
      const r = await upload(fx(f), f, type, cc.id);
      assert.equal(r.status, 201, f);
      assert.ok(!hasMeta(await stored(r.body.url)), `${f}: EXIF finns kvar`);
    }
  });

  test('SEC-08: EXIF/GPS i inbäddad andrabild (MPF/data efter EOI) tas bort', async () => {
    const cc = await s.checkin(u);
    const r = await upload(fx('mpf.jpg'), 'mpf.jpg', 'image/jpeg', cc.id);
    assert.equal(r.status, 201);
    assert.ok(!hasMeta(await stored(r.body.url)), 'GPS-EXIF i andrabilden finns kvar i lagrad fil');
  });

  test('SVG, HTML och fejkad Content-Type avvisas via magic bytes', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    assert.equal((await upload(svg, 'x.svg', 'image/svg+xml')).status, 400);
    assert.equal((await upload(Buffer.from('<html><script>alert(1)</script></html>'), 'x.jpg', 'image/jpeg')).status, 400);
  });

  test('JPEG/HTML-polyglot serveras som image/jpeg med nosniff och sandbox-CSP', async () => {
    const poly = Buffer.concat([fx('gps.jpg'), Buffer.from('<html><script>alert(document.domain)</script></html>')]);
    const cc = await s.checkin(u);
    const r = await upload(poly, 'p.jpg', 'image/jpeg', cc.id);
    assert.equal(r.status, 201);
    const g = await s.api('GET', r.body.url, { raw: true });
    assert.equal(g.headers.get('content-type'), 'image/jpeg');
    assert.equal(g.headers.get('x-content-type-options'), 'nosniff');
    assert.match(g.headers.get('content-security-policy'), /sandbox/);
  });

  test('för stor fil ger 413 och sökvägstraversering under /uploads ger 404', async () => {
    const big = Buffer.concat([fx('gps.jpg'), Buffer.alloc(5 * 1024 * 1024 + 10)]);
    assert.equal((await upload(big, 'big.jpg', 'image/jpeg')).status, 413);
    // fetch normaliserar %2e%2e till .. (blir då en SPA-väg); avgörande är att varken databasen eller systemfiler lämnas ut.
    for (const p of ['/uploads/..%2f..%2fetc%2fpasswd', '/uploads/%2e%2e/sec.db', '/uploads/..%2fsec.db', '/uploads/.htaccess']) {
      const r = await s.api('GET', p);
      assert.doesNotMatch(r.text, /SQLite format|root:x:0:0/, p);
      if (p.includes('%2f') || p.endsWith('.htaccess')) assert.equal(r.status, 404, p);
    }
  });

  test('SEC-09: foto på privat check-in kan inte hämtas av utloggad och cachas inte publikt', async () => {
    const p = await s.checkin(u, { visibility: 'private' });
    const r = await upload(fx('gps.jpg'), 'a.jpg', 'image/jpeg', p.id);
    const g = await s.api('GET', r.body.url, { raw: true });
    assert.ok(g.status === 404 || g.status === 403 || !/public/.test(g.headers.get('cache-control') ?? ''),
      `status ${g.status}, cache-control ${g.headers.get('cache-control')}`);
    assert.notEqual(g.status, 200);
  });
});
