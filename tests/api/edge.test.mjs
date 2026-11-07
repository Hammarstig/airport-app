// API-kanttester (testagenten). Kör: npm run test:api
// Startar appen via createApp mot en minnesdatabas och en temporär uppladdningskatalog.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../server/src/app.js';
import { seedDemo } from '../../server/scripts/seed-demo.js';

process.env.NODE_ENV = 'test';

let uploadDir;
const servers = [];

async function start(opts = {}) {
  const app = createApp({ dbPath: ':memory:', jwtSecret: 'edge-secret', uploadDir, authRateLimit: { windowMs: 60000, max: 10000 }, ...opts });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  servers.push(server);
  return { app, base: `http://127.0.0.1:${server.address().port}` };
}

function client(base) {
  return async function api(method, path, { token, body, headers = {} } = {}) {
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
  };
}

function daysFromToday(n) {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
}

// Minimal men giltig JPEG-header (SOI + APP0 + SOF0 med 32x24).
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14),
  Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x18, 0x00, 0x20]),
  Buffer.alloc(20),
  Buffer.from([0xff, 0xd9]),
]);

function photoForm(buf, name = 'bild.jpg', type = 'image/jpeg') {
  const fd = new FormData();
  fd.append('photo', new Blob([buf], { type }), name);
  return fd;
}

let api;
let tokA;
let tokB;
let checkinA;

before(async () => {
  uploadDir = mkdtempSync(join(tmpdir(), 'gatelog-edge-'));
  const { app, base } = await start();
  seedDemo(app.locals.db);
  api = client(base);
  const a = await api('POST', '/api/auth/register', { body: { username: 'edge_a', password: 'hemligt123' } });
  const b = await api('POST', '/api/auth/register', { body: { username: 'edge_b', password: 'hemligt123' } });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  tokA = a.body.token;
  tokB = b.body.token;
  const c = await api('POST', '/api/checkins', {
    token: tokA,
    body: { iata: 'GOT', visitedOn: daysFromToday(-1), kind: 'departure', rating: 4, comment: 'Kanttest kommentar' },
  });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  checkinA = c.body;
});

after(() => {
  for (const s of servers) s.close();
  rmSync(uploadDir, { recursive: true, force: true });
});

describe('auktorisering', () => {
  test('annan användare kan inte radera någon annans check-in (403)', async () => {
    const r = await api('DELETE', `/api/checkins/${checkinA.id}`, { token: tokB });
    assert.equal(r.status, 403);
    const still = await api('GET', `/api/checkins/${checkinA.id}`);
    assert.equal(still.status, 200);
  });

  test('radering utan token ger 401', async () => {
    const r = await api('DELETE', `/api/checkins/${checkinA.id}`);
    assert.equal(r.status, 401);
  });

  test('ogiltig/förfalskad token ger 401 på skyddad väg', async () => {
    const r = await api('POST', '/api/checkins', {
      token: tokA.slice(0, -4) + 'abcd',
      body: { iata: 'GOT', visitedOn: daysFromToday(-1), kind: 'departure' },
    });
    assert.equal(r.status, 401);
  });

  test('annan användare kan inte ladda upp foto på någon annans check-in (403)', async () => {
    const r = await api('POST', `/api/checkins/${checkinA.id}/photos`, { token: tokB, body: photoForm(JPEG) });
    assert.equal(r.status, 403);
  });

  test('annan användare kan inte radera någon annans foto (403)', async () => {
    const up = await api('POST', `/api/checkins/${checkinA.id}/photos`, { token: tokA, body: photoForm(JPEG) });
    assert.equal(up.status, 201, JSON.stringify(up.body));
    const del = await api('DELETE', `/api/photos/${up.body.id}`, { token: tokB });
    assert.equal(del.status, 403);
    const own = await api('DELETE', `/api/photos/${up.body.id}`, { token: tokA });
    assert.equal(own.status, 204);
  });

  test('gilla okänd check-in ger 404, inte 500', async () => {
    const r = await api('POST', '/api/checkins/99999999/like', { token: tokB });
    assert.equal(r.status, 404);
    const r2 = await api('DELETE', '/api/checkins/abc', { token: tokB });
    assert.ok([400, 404].includes(r2.status), `status ${r2.status}`);
  });
});

describe('validering av check-in', () => {
  const base = () => ({ iata: 'ARN', visitedOn: daysFromToday(-1), kind: 'arrival' });

  test('datum i framtiden avvisas (400)', async () => {
    const r = await api('POST', '/api/checkins', { token: tokA, body: { ...base(), visitedOn: daysFromToday(2) } });
    assert.equal(r.status, 400);
  });

  test('ogiltigt datum (2026-02-30) avvisas', async () => {
    const r = await api('POST', '/api/checkins', { token: tokA, body: { ...base(), visitedOn: '2026-02-30' } });
    assert.equal(r.status, 400);
  });

  test('rating 0.3 avvisas, liksom 0 och 5.5', async () => {
    for (const rating of [0.3, 0, 5.5, -1, '4']) {
      const r = await api('POST', '/api/checkins', { token: tokA, body: { ...base(), rating } });
      assert.equal(r.status, 400, `rating ${JSON.stringify(rating)} gav ${r.status}`);
    }
  });

  test('delbetyg 4.5 (ej heltal) avvisas', async () => {
    const r = await api('POST', '/api/checkins', { token: tokA, body: { ...base(), ratings: { food: 4.5 } } });
    assert.equal(r.status, 400);
  });

  test('okänd IATA-kod avvisas', async () => {
    const probe = await api('GET', '/api/airports/QQQ');
    assert.equal(probe.status, 404, 'QQQ förväntas inte finnas');
    for (const iata of ['QQQ', 'ESGG', 'G0T', '']) {
      const r = await api('POST', '/api/checkins', { token: tokA, body: { ...base(), iata } });
      assert.equal(r.status, 400, `iata ${iata} gav ${r.status}`);
    }
  });

  test('kommentar på 1001 tecken avvisas, 1000 tecken godkänns', async () => {
    const tooLong = await api('POST', '/api/checkins', { token: tokA, body: { ...base(), comment: 'x'.repeat(1001) } });
    assert.equal(tooLong.status, 400);
    const ok = await api('POST', '/api/checkins', { token: tokA, body: { ...base(), comment: 'y'.repeat(1000) } });
    assert.equal(ok.status, 201);
    await api('DELETE', `/api/checkins/${ok.body.id}`, { token: tokA });
  });

  test('okänt flygbolag, ogiltig reseklass och flightnummer avvisas', async () => {
    const probe = await api('GET', '/api/airlines?q=0Z&limit=5');
    assert.ok(!probe.body.some((a) => a.iata === '0Z'), '0Z förväntas inte finnas');
    for (const extra of [{ airlineIata: '0Z' }, { airlineIata: 'SAS' }, { travelClass: 'luxury' }, { flightNumber: 'SK-12' }, { flightNumber: 'SK123456789' }]) {
      const r = await api('POST', '/api/checkins', { token: tokA, body: { ...base(), ...extra } });
      assert.equal(r.status, 400, `${JSON.stringify(extra)} gav ${r.status}`);
    }
  });

  test('lounge från annan flygplats kan inte kopplas', async () => {
    const lounges = await api('GET', '/api/lounges?iata=CPH');
    assert.ok(lounges.body.length > 0);
    const r = await api('POST', '/api/checkins', { token: tokA, body: { ...base(), loungeId: lounges.body[0].id } });
    assert.equal(r.status, 400);
  });

  test('JSON-body över 50 kB ger 413', async () => {
    const r = await api('POST', '/api/checkins', { token: tokA, body: { ...base(), pad: 'z'.repeat(60 * 1024) } });
    assert.equal(r.status, 413);
  });

  test('trasig JSON ger 400', async () => {
    const r = await api('POST', '/api/checkins', { token: tokA, body: '{"iata": "GOT",' });
    assert.equal(r.status, 400);
  });
});

describe('validering av foton', () => {
  test('textfil med .jpg-ändelse och image/jpeg avvisas (magic bytes)', async () => {
    const r = await api('POST', `/api/checkins/${checkinA.id}/photos`, {
      token: tokA,
      body: photoForm(Buffer.from('detta är ingen bild, bara text som låtsas vara jpeg'), 'fake.jpg', 'image/jpeg'),
    });
    assert.equal(r.status, 400);
  });

  test('SVG/HTML med .jpg-ändelse avvisas', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>');
    const r = await api('POST', `/api/checkins/${checkinA.id}/photos`, { token: tokA, body: photoForm(svg, 'x.jpg') });
    assert.equal(r.status, 400);
  });

  test('foto över 5 MB ger 413', async () => {
    const big = Buffer.concat([JPEG.subarray(0, JPEG.length - 2), Buffer.alloc(5 * 1024 * 1024 + 10), Buffer.from([0xff, 0xd9])]);
    const r = await api('POST', `/api/checkins/${checkinA.id}/photos`, { token: tokA, body: photoForm(big) });
    assert.equal(r.status, 413);
  });

  test('femte fotot ger 409', async () => {
    const c = await api('POST', '/api/checkins', { token: tokA, body: { iata: 'CPH', visitedOn: daysFromToday(-3), kind: 'transfer' } });
    for (let i = 0; i < 4; i++) {
      const r = await api('POST', `/api/checkins/${c.body.id}/photos`, { token: tokA, body: photoForm(JPEG) });
      assert.equal(r.status, 201);
    }
    const fifth = await api('POST', `/api/checkins/${c.body.id}/photos`, { token: tokA, body: photoForm(JPEG) });
    assert.equal(fifth.status, 409);
    await api('DELETE', `/api/checkins/${c.body.id}`, { token: tokA });
  });

  test('uppladdad fil serveras med nosniff och sandbox-CSP, path traversal ger 404', async () => {
    const up = await api('POST', `/api/checkins/${checkinA.id}/photos`, { token: tokA, body: photoForm(JPEG) });
    assert.equal(up.status, 201);
    const res = await api('GET', up.body.url);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('content-security-policy') || '', /sandbox/);
    const trav = await api('GET', '/uploads/..%2f..%2fpackage.json');
    assert.equal(trav.status, 404);
  });
});

describe('FTS-injektion i /api/search', () => {
  for (const q of ['"', '*', 'NEAR(', 'NEAR(lounge kö', 'lounge"', '"lounge', 'lounge OR 1=1', 'a AND', '^lounge', 'col:lounge', '(((', '\u0000']) {
    test(`q=${JSON.stringify(q)} ger aldrig 500`, async () => {
      const r = await api('GET', `/api/search?q=${encodeURIComponent(q)}`);
      assert.ok([200, 400].includes(r.status), `status ${r.status}: ${JSON.stringify(r.body)}`);
      if (r.status === 200) assert.ok(Array.isArray(r.body));
    });
  }

  test('tom sträng utan iata ger 400', async () => {
    const r = await api('GET', '/api/search?q=');
    assert.equal(r.status, 400);
  });

  test('tom sträng med iata ger 200', async () => {
    const r = await api('GET', '/api/search?q=&iata=GOT');
    assert.equal(r.status, 200);
    assert.ok(r.body.length > 0);
  });

  test('mycket lång söksträng ger 200/400, inte 500', async () => {
    const r = await api('GET', `/api/search?q=${'lounge '.repeat(800)}`);
    assert.ok([200, 400, 414].includes(r.status), `status ${r.status}`);
  });

  test('flygplatssök med specialtecken ger [] eller resultat, aldrig 500', async () => {
    for (const q of ['"', '*', 'NEAR(', '%', '_', "'; DROP TABLE airports;--"]) {
      const r = await api('GET', `/api/airports?q=${encodeURIComponent(q)}`);
      assert.equal(r.status, 200, `q=${q} gav ${r.status}`);
      assert.ok(Array.isArray(r.body));
    }
    const h = await api('GET', '/api/health');
    assert.equal(h.body.airports, 8799);
  });

  test('HTML i kommentar escapas i snippet (endast <mark> tillåts)', async () => {
    const c = await api('POST', '/api/checkins', {
      token: tokA,
      body: { iata: 'GOT', visitedOn: daysFromToday(-1), kind: 'departure', comment: '<img src=x onerror=alert(1)> xssprobe <b>fet</b>' },
    });
    assert.equal(c.status, 201);
    const r = await api('GET', '/api/search?q=xssprobe');
    assert.equal(r.status, 200);
    assert.ok(r.body.length >= 1);
    const snip = r.body[0].snippet;
    assert.ok(!/<img|<b>/i.test(snip), snip);
    assert.match(snip, /&lt;img/);
    assert.match(snip, /<mark>xssprobe<\/mark>/);
    const plain = await api('GET', '/api/search?iata=GOT&limit=100');
    const hit = plain.body.find((x) => x.id === c.body.id && x.type === 'checkin');
    assert.ok(hit && !/<img/i.test(hit.snippet), 'snippet utan q ska också vara escapad');
  });
});

describe('rate limit', () => {
  test('auth begränsas och svarar 429 med Retry-After', async () => {
    const { base } = await start({ authRateLimit: { windowMs: 60000, max: 5 } });
    const local = client(base);
    const statuses = [];
    for (let i = 0; i < 7; i++) {
      const r = await local('POST', '/api/auth/login', { body: { username: 'finnsinte', password: 'fel-losenord' } });
      statuses.push(r.status);
      if (r.status === 429) assert.ok(Number(r.headers.get('retry-after')) > 0);
    }
    assert.deepEqual(statuses.slice(0, 5), [401, 401, 401, 401, 401]);
    assert.equal(statuses[5], 429);
    // Övriga API-vägar påverkas inte.
    const h = await local('GET', '/api/health');
    assert.equal(h.status, 200);
  });
});

describe('stora sidor och offset', () => {
  const lists = ['/api/feed', '/api/airports?q=a', '/api/airports', '/api/airports/GOT/checkins', '/api/users/oliver/checkins', '/api/search?q=lounge', '/api/lounges', '/api/countries', '/api/leaderboard', '/api/rankings/airports'];

  for (const path of lists) {
    test(`${path}: limit=100000 kapas, offset långt bort ger [], negativa/ogiltiga värden ger 200`, async () => {
      const sep = path.includes('?') ? '&' : '?';
      const big = await api('GET', `${path}${sep}limit=100000`);
      assert.equal(big.status, 200, JSON.stringify(big.body));
      assert.ok(Array.isArray(big.body));
      if (!path.startsWith('/api/countries')) assert.ok(big.body.length <= 100, `fick ${big.body.length}`);
      const far = await api('GET', `${path}${sep}offset=999999999`);
      assert.equal(far.status, 200);
      if (!path.startsWith('/api/countries') && !path.startsWith('/api/leaderboard') && !path.startsWith('/api/rankings'))
        assert.equal(far.body.length, 0);
      for (const qs of ['limit=-5', 'limit=abc', 'offset=-1', 'offset=1e99', 'limit=0']) {
        const r = await api('GET', `${path}${sep}${qs}`);
        assert.equal(r.status, 200, `${qs} gav ${r.status}`);
      }
    });
  }
});

describe('v2: socialt, notiser, topplistor och konto', () => {
  test('kommentarer: längd, behörighet för redigera/ta bort', async () => {
    const c = await api('POST', '/api/checkins', { token: tokA, body: { iata: 'OSL', visitedOn: daysFromToday(-1), kind: 'departure' } });
    assert.equal(c.status, 201);
    for (const body of ['', '   ', 'x'.repeat(501)]) {
      const r = await api('POST', `/api/checkins/${c.body.id}/comments`, { token: tokB, body: { body } });
      assert.equal(r.status, 400, `body längd ${body.length} gav ${r.status}`);
    }
    const ok = await api('POST', `/api/checkins/${c.body.id}/comments`, { token: tokB, body: { body: '<b>hej</b>' } });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.body, '<b>hej</b>');
    // Ägaren av check-in:en får ta bort men inte redigera andras kommentarer.
    assert.equal((await api('PATCH', `/api/comments/${ok.body.id}`, { token: tokA, body: { body: 'ändrad' } })).status, 403);
    assert.equal((await api('POST', `/api/checkins/${c.body.id}/comments`, { body: { body: 'anonym' } })).status, 401);
    assert.equal((await api('DELETE', `/api/comments/${ok.body.id}`, { token: tokA })).status, 204);
  });

  test('följa sig själv ger 400, följning är idempotent', async () => {
    assert.equal((await api('POST', '/api/users/edge_a/follow', { token: tokA })).status, 400);
    const a = await api('POST', '/api/users/oliver/follow', { token: tokA });
    const b = await api('POST', '/api/users/oliver/follow', { token: tokA });
    assert.equal(a.status, 200);
    assert.equal(b.body.followers, a.body.followers);
    assert.equal((await api('POST', '/api/users/finnsinte_xyz/follow', { token: tokA })).status, 404);
  });

  test('notiser kräver inloggning, scope=friends kräver inloggning', async () => {
    assert.equal((await api('GET', '/api/notifications')).status, 401);
    assert.equal((await api('GET', '/api/notifications/unread-count')).status, 401);
    assert.equal((await api('GET', '/api/feed?scope=friends')).status, 401);
    assert.equal((await api('GET', '/api/rankings/users?scope=friends')).status, 401);
  });

  test('topplistor: ogiltiga kombinationer ger 400', async () => {
    assert.equal((await api('GET', '/api/rankings/users?metric=xp&period=week')).status, 400);
    assert.equal((await api('GET', '/api/rankings/users?metric=reviews&scope=country&country=SE')).status, 400);
    // Okänt mått/period faller tillbaka på standardvärden (samma mönster som category i v1).
    const fb = await api('GET', '/api/rankings/users?metric=bogus&period=bogus');
    assert.equal(fb.status, 200);
    assert.equal(fb.body.metric, 'airports');
    const r = await api('GET', '/api/rankings/users?metric=airports&period=all&limit=100000');
    assert.equal(r.status, 200);
    assert.ok(r.body.items.length <= 100);
    assert.equal(r.body.me, null);
  });

  test('nearby: ogiltig position ger 400', async () => {
    for (const q of ['lat=91&lon=0', 'lat=abc&lon=1', 'lat=0', 'lat=0&lon=181']) {
      assert.equal((await api('GET', `/api/airports/nearby?${q}`)).status, 400, q);
    }
    const ok = await api('GET', '/api/airports/nearby?lat=57.66&lon=12.28&limit=999&radiusKm=99999');
    assert.equal(ok.status, 200);
    assert.ok(ok.body.length <= 50);
  });

  test('PATCH check-in: iata kan inte ändras, andra kan inte ändra', async () => {
    assert.equal((await api('PATCH', `/api/checkins/${checkinA.id}`, { token: tokA, body: { iata: 'ARN' } })).status, 400);
    assert.equal((await api('PATCH', `/api/checkins/${checkinA.id}`, { token: tokB, body: { comment: 'x' } })).status, 403);
    assert.equal((await api('PATCH', `/api/checkins/${checkinA.id}`, { token: tokA, body: { rating: 0.3 } })).status, 400);
    const ok = await api('PATCH', `/api/checkins/${checkinA.id}`, { token: tokA, body: { comment: null } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.comment, null);
    assert.ok(ok.body.editedAt);
  });

  test('export innehåller inga lösenordshashar; DELETE /me kräver lösenord', async () => {
    const r = await fetch(`${servers.length ? `http://127.0.0.1:${servers[0].address().port}` : ''}/api/me/export`, { headers: { Authorization: `Bearer ${tokB}` } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-disposition') || '', /attachment/);
    const text = await r.text();
    assert.ok(!/password|\$2[aby]\$/.test(text));
    assert.equal((await api('DELETE', '/api/me', { token: tokB, body: {} })).status, 400);
    const wrong = await api('DELETE', '/api/me', { token: tokB, body: { password: 'fel-losenord' } });
    // Dokumenterat beteende (401). Se BUG-09: klienten tolkar 401 som utgången session.
    assert.equal(wrong.status, 401);
    assert.equal((await api('GET', '/api/me', { token: tokB })).status, 200);
  });
});
