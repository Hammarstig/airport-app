import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { seedDemo } from '../scripts/seed-demo.js';
import { imageInfo } from '../src/routes/photos.js';

process.env.NODE_ENV = 'test';

let server;
let base;
let app;
let uploadDir;

function tomorrow() {
  const d = new Date(Date.now() + 2 * 86400000);
  return d.toISOString().slice(0, 10);
}

async function api(method, path, { token, body, headers = {} } = {}) {
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
}

async function register(username, extra = {}) {
  const r = await api('POST', '/api/auth/register', { body: { username, password: 'hemligt123', ...extra } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.token;
}

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
  Buffer.from('IHDR'),
  Buffer.from([0, 0, 0x02, 0x80, 0, 0, 0x01, 0xe0, 8, 2, 0, 0, 0]), // 640x480
  Buffer.alloc(32),
]);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14),
  Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0x20, 0x04, 0xb0]), // 1200x800
  Buffer.alloc(20),
]);

before(async () => {
  uploadDir = mkdtempSync(join(tmpdir(), 'gatelog-up-'));
  app = createApp({ dbPath: ':memory:', jwtSecret: 'test-secret', uploadDir, authRateLimit: { windowMs: 60000, max: 1000 } });
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  rmSync(uploadDir, { recursive: true, force: true });
});

describe('health och headers', () => {
  test('health räknar flygplatser', async () => {
    const r = await api('GET', '/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.airports, 8799);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('x-powered-by'), null);
  });

  test('okänd API-väg ger 404 JSON', async () => {
    const r = await api('GET', '/api/finns-inte');
    assert.equal(r.status, 404);
    assert.ok(r.body.error);
  });

  test('ogiltig JSON ger 400 och för stor body 413', async () => {
    const r = await api('POST', '/api/auth/login', { body: '{trasig' });
    assert.equal(r.status, 400);
    const big = await api('POST', '/api/auth/login', { body: { username: 'x', password: 'y'.repeat(60 * 1024) } });
    assert.equal(big.status, 413);
  });

  test('gzip och ETag på flygplatsdata', async () => {
    const res = await fetch(base + '/api/airports?country=SE&limit=50', { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(res.headers.get('content-encoding'), 'gzip');
    const etag = res.headers.get('etag');
    assert.ok(etag);
    // fetch() lägger till Cache-Control: no-cache vid villkorliga anrop, så vi använder node:http här.
    const status = await new Promise((resolve, reject) => {
      http.get(base + '/api/airports?country=SE&limit=50', { headers: { 'If-None-Match': etag } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      }).on('error', reject);
    });
    assert.equal(status, 304);
  });
});

describe('auth', () => {
  test('registrera, logga in, me, patch me', async () => {
    const reg = await api('POST', '/api/auth/register', {
      body: { username: 'Kalle_1', password: 'hemligt123', displayName: 'Kalle', homeIata: 'got' },
    });
    assert.equal(reg.status, 201);
    assert.deepEqual(reg.body.user, { username: 'kalle_1', displayName: 'Kalle', homeIata: 'GOT' });
    assert.ok(reg.body.token);

    const dup = await api('POST', '/api/auth/register', { body: { username: 'kalle_1', password: 'hemligt123' } });
    assert.equal(dup.status, 409);

    const bad = await api('POST', '/api/auth/login', { body: { username: 'kalle_1', password: 'fel-losen' } });
    assert.equal(bad.status, 401);
    const login = await api('POST', '/api/auth/login', { body: { username: 'kalle_1', password: 'hemligt123' } });
    assert.equal(login.status, 200);

    const me = await api('GET', '/api/me', { token: login.body.token });
    assert.equal(me.body.username, 'kalle_1');
    assert.equal((await api('GET', '/api/me')).status, 401);
    assert.equal((await api('GET', '/api/me', { token: 'skräp' })).status, 401);

    const p = await api('PATCH', '/api/me', { token: login.body.token, body: { displayName: 'Karl', homeIata: 'ARN' } });
    assert.deepEqual(p.body, { username: 'kalle_1', displayName: 'Karl', homeIata: 'ARN' });
    const p2 = await api('PATCH', '/api/me', { token: login.body.token, body: { homeIata: 'XXX' } });
    assert.equal(p2.status, 400);
  });

  test('validering av username och password', async () => {
    for (const body of [
      { username: 'ab', password: 'hemligt123' },
      { username: 'har mellanslag', password: 'hemligt123' },
      { username: 'okej_namn', password: 'kort' },
      { username: 'okej_namn2', password: 'hemligt123', homeIata: 'ZZZ' },
    ]) {
      const r = await api('POST', '/api/auth/register', { body });
      assert.equal(r.status, 400, JSON.stringify(body));
    }
  });

  test('rate limit på /api/auth', async () => {
    const limited = createApp({ dbPath: ':memory:', jwtSecret: 's', uploadDir, authRateLimit: { windowMs: 60000, max: 3 } });
    const srv = await new Promise((resolve) => { const s = limited.listen(0, '127.0.0.1', () => resolve(s)); });
    const url = `http://127.0.0.1:${srv.address().port}/api/auth/login`;
    const statuses = [];
    for (let i = 0; i < 5; i++) {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"username":"a","password":"b"}' });
      statuses.push(r.status);
    }
    srv.close();
    assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
  });
});

describe('check-ins', () => {
  let tok;
  let other;
  before(async () => {
    tok = await register('pelle', { homeIata: 'GOT' });
    other = await register('lisa');
  });

  test('validering', async () => {
    const ok = { iata: 'GOT', visitedOn: '2026-10-01', kind: 'departure' };
    const cases = [
      [{ ...ok, iata: 'XXX' }, 'okänd IATA'],
      [{ ...ok, iata: 'ESGG' }, 'ICAO istället för IATA'],
      [{ ...ok, visitedOn: tomorrow() }, 'framtida datum'],
      [{ ...ok, visitedOn: '2026-02-30' }, 'ogiltigt datum'],
      [{ ...ok, kind: 'flyby' }, 'okänd kind'],
      [{ ...ok, rating: 0 }, 'rating 0'],
      [{ ...ok, rating: 4.3 }, 'rating ej halvsteg'],
      [{ ...ok, rating: 5.5 }, 'rating över 5'],
      [{ ...ok, ratings: { food: 4.5 } }, 'delbetyg ej heltal'],
      [{ ...ok, ratings: { wifi: 6 } }, 'delbetyg över 5'],
      [{ ...ok, comment: 'x'.repeat(1001) }, 'för lång kommentar'],
      [{ ...ok, airlineIata: 'Q9Q' }, 'okänt flygbolag'],
      [{ ...ok, travelClass: 'cargo' }, 'okänd klass'],
      [{ ...ok, flightNumber: 'SK-1421-XYZ' }, 'ogiltigt flightnummer'],
      [{ ...ok, loungeRating: 4 }, 'loungebetyg utan lounge'],
      [{ ...ok, loungeId: 999999 }, 'okänd lounge'],
    ];
    for (const [body, why] of cases) {
      const r = await api('POST', '/api/checkins', { token: tok, body });
      assert.equal(r.status, 400, why);
      assert.ok(r.body.error, why);
    }
    assert.equal((await api('POST', '/api/checkins', { body: ok })).status, 401);
  });

  test('skapa, hämta och första märket', async () => {
    const r = await api('POST', '/api/checkins', {
      token: tok,
      body: {
        iata: 'got', visitedOn: '2026-10-01', kind: 'departure', rating: 4.5,
        ratings: { security: 4, food: 3 }, comment: '  Bra kaffe  ', airlineIata: 'sk', travelClass: 'business',
        flightNumber: 'sk 151', newLounge: { name: 'Testlounge', terminal: 'T1' }, loungeRating: 4,
      },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const c = r.body;
    assert.equal(c.airport.iata, 'GOT');
    assert.equal(c.airport.region, 'SE-Q');
    assert.equal(c.airport.regionName, 'Västra Götalands län');
    assert.equal(c.rating, 4.5);
    assert.deepEqual(c.ratings, { security: 4, cleanliness: null, food: 3, wifi: null, transfer: null, lounges: null });
    assert.equal(c.comment, 'Bra kaffe');
    assert.equal(c.likes, 0);
    assert.equal(c.likedByMe, false);
    assert.deepEqual(c.airline, { iata: 'SK', name: 'Scandinavian Airlines System' });
    assert.equal(c.travelClass, 'business');
    assert.equal(c.flightNumber, 'SK151');
    assert.equal(c.lounge.name, 'Testlounge');
    assert.deepEqual(c.photos, []);
    assert.ok(c.newBadges.some((b) => b.id === 'first-checkin'));

    // Loungerecension skapades med check-in-kommentaren
    const lo = await api('GET', `/api/lounges/${c.lounge.id}`);
    assert.equal(lo.body.reviewCount, 1);
    assert.equal(lo.body.reviews[0].comment, 'Bra kaffe');

    // Samma lounge via loungeId fungerar, men inte från fel flygplats
    const again = await api('POST', '/api/checkins', { token: tok, body: { iata: 'GOT', visitedOn: '2026-10-02', kind: 'arrival', loungeId: c.lounge.id } });
    assert.equal(again.status, 201);
    assert.equal(again.body.newBadges.length, 0);
    const wrong = await api('POST', '/api/checkins', { token: tok, body: { iata: 'ARN', visitedOn: '2026-10-02', kind: 'arrival', loungeId: c.lounge.id } });
    assert.equal(wrong.status, 400);

    const g = await api('GET', `/api/checkins/${c.id}`);
    assert.equal(g.body.id, c.id);
    assert.equal((await api('GET', '/api/checkins/999999')).status, 404);
  });

  test('likes och likedByMe', async () => {
    const c = (await api('POST', '/api/checkins', { token: tok, body: { iata: 'CPH', visitedOn: '2026-09-01', kind: 'transfer' } })).body;
    let r = await api('POST', `/api/checkins/${c.id}/like`, { token: other });
    assert.deepEqual(r.body, { likes: 1, likedByMe: true });
    r = await api('POST', `/api/checkins/${c.id}/like`, { token: other });
    assert.deepEqual(r.body, { likes: 1, likedByMe: true }, 'idempotent');
    assert.equal((await api('GET', `/api/checkins/${c.id}`, { token: other })).body.likedByMe, true);
    assert.equal((await api('GET', `/api/checkins/${c.id}`, { token: tok })).body.likedByMe, false);
    assert.equal((await api('GET', `/api/checkins/${c.id}`)).body.likes, 1);
    r = await api('DELETE', `/api/checkins/${c.id}/like`, { token: other });
    assert.deepEqual(r.body, { likes: 0, likedByMe: false });
    assert.equal((await api('POST', '/api/checkins/999999/like', { token: other })).status, 404);
    assert.equal((await api('POST', `/api/checkins/${c.id}/like`)).status, 401);
  });

  test('radering: bara ägaren', async () => {
    const c = (await api('POST', '/api/checkins', { token: tok, body: { iata: 'OSL', visitedOn: '2026-08-01', kind: 'arrival', comment: 'raderbar unikordet' } })).body;
    assert.equal((await api('DELETE', `/api/checkins/${c.id}`, { token: other })).status, 403);
    assert.equal((await api('DELETE', `/api/checkins/${c.id}`)).status, 401);
    assert.equal((await api('DELETE', `/api/checkins/${c.id}`, { token: tok })).status, 204);
    assert.equal((await api('GET', `/api/checkins/${c.id}`)).status, 404);
    // FTS hålls i synk
    const s = await api('GET', '/api/search?q=unikordet');
    assert.equal(s.body.length, 0);
  });

  test('feed med scope och iata', async () => {
    const feed = await api('GET', '/api/feed?limit=50');
    assert.ok(feed.body.length >= 3);
    assert.ok(feed.body[0].createdAt >= feed.body[1].createdAt);
    assert.equal((await api('GET', '/api/feed?scope=mine')).status, 401);
    const mine = await api('GET', '/api/feed?scope=mine', { token: other });
    assert.equal(mine.body.length, 0);
    const got = await api('GET', '/api/feed?iata=GOT');
    assert.ok(got.body.length >= 1 && got.body.every((c) => c.airport.iata === 'GOT'));
  });
});

describe('foton', () => {
  let tok;
  let other;
  let checkinId;
  before(async () => {
    tok = await register('fotograf');
    other = await register('nyfiken');
    checkinId = (await api('POST', '/api/checkins', { token: tok, body: { iata: 'HEL', visitedOn: '2026-07-01', kind: 'transfer' } })).body.id;
  });

  const form = (buf, name = 'bild.jpg', type = 'image/jpeg') => {
    const f = new FormData();
    f.append('photo', new Blob([buf], { type }), name);
    return f;
  };

  test('magic bytes och dimensioner', () => {
    assert.deepEqual(imageInfo(PNG), { ext: 'png', width: 640, height: 480 });
    assert.deepEqual(imageInfo(JPEG), { ext: 'jpg', width: 1200, height: 800 });
    assert.equal(imageInfo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  });

  test('uppladdning, servering, gränser och radering', async () => {
    const up = await api('POST', `/api/checkins/${checkinId}/photos`, { token: tok, body: form(PNG, 'a.png', 'image/png') });
    assert.equal(up.status, 201, JSON.stringify(up.body));
    assert.match(up.body.url, /^\/uploads\/[a-f0-9]{32}\.png$/);
    assert.equal(up.body.width, 640);

    const file = await fetch(base + up.body.url);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(file.headers.get('content-type'), 'image/png');
    assert.equal((await fetch(base + '/uploads/../package.json')).status, 404);

    // Fel typ trots image/jpeg-etikett
    const fake = await api('POST', `/api/checkins/${checkinId}/photos`, { token: tok, body: form(Buffer.from('<html><script>alert(1)</script></html>')) });
    assert.equal(fake.status, 400);
    // Andra användare får inte ladda upp
    assert.equal((await api('POST', `/api/checkins/${checkinId}/photos`, { token: other, body: form(JPEG) })).status, 403);
    // För stor fil
    const huge = await api('POST', `/api/checkins/${checkinId}/photos`, { token: tok, body: form(Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)])) });
    assert.equal(huge.status, 413);

    for (let i = 0; i < 3; i++) {
      assert.equal((await api('POST', `/api/checkins/${checkinId}/photos`, { token: tok, body: form(JPEG) })).status, 201);
    }
    const fifth = await api('POST', `/api/checkins/${checkinId}/photos`, { token: tok, body: form(JPEG) });
    assert.equal(fifth.status, 409);

    const c = await api('GET', `/api/checkins/${checkinId}`);
    assert.equal(c.body.photos.length, 4);
    const airport = await api('GET', '/api/airports/HEL');
    assert.equal(airport.body.photos.length, 4);

    assert.equal((await api('DELETE', `/api/photos/${up.body.id}`, { token: other })).status, 403);
    assert.equal((await api('DELETE', `/api/photos/${up.body.id}`, { token: tok })).status, 204);
    assert.equal((await fetch(base + up.body.url)).status, 404);

    // Radering av check-in tar bort filerna
    assert.equal(readdirSync(uploadDir).length, 3);
    assert.equal((await api('DELETE', `/api/checkins/${checkinId}`, { token: tok })).status, 204);
    assert.equal(readdirSync(uploadDir).length, 0);
    assert.ok(existsSync(uploadDir));
  });
});

describe('med demodata', () => {
  let oliver;
  before(async () => {
    seedDemo(app.locals.db);
    oliver = (await api('POST', '/api/auth/login', { body: { username: 'oliver', password: 'demo1234' } })).body.token;
  });

  test('flygplatssök: IATA, stad, namn, land, diakritik', async () => {
    const got = await api('GET', '/api/airports?q=got');
    assert.equal(got.body[0].iata, 'GOT');
    assert.equal(got.body[0].matchedOn, 'iata');
    assert.equal(got.body[0].countryName, 'Sverige');

    const gbg = await api('GET', '/api/airports?q=goteborg');
    assert.equal(gbg.body[0].iata, 'GOT');
    assert.equal(gbg.body[0].matchedOn, 'city');

    const stock = await api('GET', '/api/airports?q=stock&limit=10');
    const codes = stock.body.map((a) => a.iata);
    for (const c of ['ARN', 'BMA', 'NYO']) assert.ok(codes.includes(c), `${c} saknas i ${codes}`);
    assert.equal(stock.body[0].iata, 'ARN', 'flest check-ins bland stora först');
    assert.equal(stock.body.find((a) => a.iata === 'NYO').matchedOn, 'name');

    const lhr = await api('GET', '/api/airports?q=heathrow');
    assert.equal(lhr.body[0].iata, 'LHR');
    assert.equal(lhr.body[0].matchedOn, 'name');

    for (const q of ['sverige', 'sweden', 'se']) {
      const r = await api('GET', `/api/airports?q=${q}&limit=30`);
      assert.ok(r.body.length >= 10, q);
      assert.ok(r.body.every((a) => a.country === 'SE'), q);
      assert.equal(r.body[0].type, 'large', q);
      assert.equal(r.body[0].matchedOn, 'country', q);
    }

    const icao = await api('GET', '/api/airports?q=essa');
    assert.equal(icao.body[0].iata, 'ARN');
    assert.equal(icao.body[0].matchedOn, 'icao');

    for (const q of ['%', '"', "'; DROP TABLE airports; --", '***']) {
      const r = await api('GET', `/api/airports?q=${encodeURIComponent(q)}`);
      assert.equal(r.status, 200, q);
    }
  });

  test('flygplatssök med filter och sortering', async () => {
    const rated = await api('GET', '/api/airports?sort=rating&minRating=4.5&limit=10');
    assert.ok(rated.body.length > 0);
    assert.ok(rated.body.every((a) => a.avgRating >= 4.5));
    const byCheckins = await api('GET', '/api/airports?limit=3');
    assert.ok(byCheckins.body[0].checkins >= byCheckins.body[1].checkins);
    const large = await api('GET', '/api/airports?continent=EU&type=large&limit=100');
    assert.ok(large.body.every((a) => a.continent === 'EU' && a.type === 'large'));
    const mine = await api('GET', '/api/airports?visited=mine&limit=100', { token: oliver });
    assert.ok(mine.body.length >= 10 && mine.body.some((a) => a.iata === 'DOH'));
    const notmine = await api('GET', '/api/airports?visited=notmine&country=SE&limit=100', { token: oliver });
    assert.ok(!notmine.body.some((a) => a.iata === 'GOT'));
  });

  test('flygplatsdetalj med stats, lounger och personliga fält', async () => {
    const r = await api('GET', '/api/airports/got', { token: oliver });
    assert.equal(r.status, 200);
    assert.equal(r.body.iata, 'GOT');
    assert.ok(r.body.stats.checkins >= 6);
    assert.ok(r.body.stats.visitors >= 2);
    assert.equal(typeof r.body.stats.avgRating, 'number');
    assert.ok('security' in r.body.stats.subAverages);
    assert.ok(r.body.stats.topAirlines.length > 0 && r.body.stats.topAirlines.length <= 5);
    assert.ok(r.body.stats.topAirlines[0].airline.iata);
    assert.deepEqual(Object.keys(r.body.stats.classMix), ['economy', 'premium_economy', 'business', 'first']);
    assert.ok(r.body.lounges.some((l) => l.name === 'SAS Lounge'));
    assert.equal(r.body.myVisits, 5);
    assert.equal(r.body.onMyWishlist, false);
    assert.equal((await api('GET', '/api/airports/XXX')).status, 404);
    const cks = await api('GET', '/api/airports/GOT/checkins?limit=2');
    assert.equal(cks.body.length, 2);
    assert.ok(cks.body[0].visitedOn >= cks.body[1].visitedOn);
  });

  test('flygbolag', async () => {
    const sas = await api('GET', '/api/airlines?q=sk');
    assert.equal(sas.body[0].iata, 'SK');
    const name = await api('GET', '/api/airlines?q=lufth');
    assert.equal(name.body[0].iata, 'LH');
    assert.deepEqual(Object.keys(name.body[0]), ['iata', 'icao', 'name', 'country']);
  });

  test('användarstatistik och egen lista', async () => {
    const u = await api('GET', '/api/users/oliver');
    assert.equal(u.body.username, 'oliver');
    assert.equal(u.body.stats.totalCheckins, 14);
    assert.equal(u.body.stats.uniqueAirports, 10);
    assert.ok(u.body.stats.countries >= 8);
    assert.ok(u.body.stats.continents >= 2);
    assert.equal(typeof u.body.stats.avgGivenRating, 'number');
    assert.equal((await api('GET', '/api/users/finnsinte')).status, 404);

    const visits = await api('GET', '/api/users/oliver/airports?sort=visits');
    assert.equal(visits.body[0].airport.iata, 'GOT');
    assert.equal(visits.body[0].visits, 5);
    assert.equal(visits.body[0].myRating, 4, 'senast satta betyg');
    const rating = await api('GET', '/api/users/oliver/airports?sort=rating');
    assert.equal(rating.body[0].myRating, 5);
    const recent = await api('GET', '/api/users/oliver/airports?sort=recent');
    assert.equal(recent.body[0].airport.iata, 'ARN');

    const cks = await api('GET', '/api/users/oliver/checkins?limit=5&offset=0');
    assert.equal(cks.body.length, 5);
    assert.ok(cks.body.every((c) => c.user.username === 'oliver'));
  });

  test('användarsök', async () => {
    const r = await api('GET', '/api/users?q=oli');
    assert.equal(r.body[0].username, 'oliver');
    assert.equal(r.body[0].uniqueAirports, 10);
    const all = await api('GET', '/api/users');
    assert.ok(all.body.length >= 4);
    const display = await api('GET', '/api/users?q=jensen');
    assert.equal(display.body[0].username, 'mads');
  });

  test('topplistor', async () => {
    const lb = await api('GET', '/api/leaderboard?metric=airports');
    assert.equal(lb.body[0].user.username, 'oliver');
    assert.equal(lb.body[0].rank, 1);
    assert.equal(lb.body[0].value, 10);
    const lbc = await api('GET', '/api/leaderboard?metric=checkins');
    assert.equal(lbc.body[0].value, 14);
    const countries = await api('GET', '/api/leaderboard?metric=countries');
    assert.ok(countries.body.every((x, i, arr) => i === 0 || arr[i - 1].value >= x.value));

    const best = await api('GET', '/api/rankings/airports?minRatings=2');
    assert.ok(best.body.length > 0);
    assert.ok(best.body.every((x) => x.ratingCount >= 2));
    assert.equal(best.body[0].airport.iata, 'SIN');
    const se = await api('GET', '/api/rankings/airports?country=SE');
    assert.ok(se.body.every((x) => x.airport.country === 'SE'));
    const wifi = await api('GET', '/api/rankings/airports?category=wifi&minRatings=2');
    assert.ok(wifi.body.length > 0);
    const transfer = await api('GET', '/api/rankings/airports?category=transfer&minRatings=2');
    assert.ok(transfer.body.every((x, i, a) => i === 0 || a[i - 1].avgRating >= x.avgRating));
    assert.ok(!transfer.body.some((x) => x.airport.iata === 'GOT'), 'GOT har inga transferbetyg med minst 2 st');
  });

  test('länder', async () => {
    const list = await api('GET', '/api/countries?continent=EU');
    const se = list.body.find((c) => c.code === 'SE');
    assert.equal(se.name, 'Sverige');
    assert.equal(se.continent, 'EU');
    assert.ok(se.airports > 20 && se.checkins >= 7);
    assert.ok(list.body.every((c) => c.continent === 'EU'));
    const d = await api('GET', '/api/countries/se');
    assert.equal(d.body.name, 'Sverige');
    assert.equal(d.body.topAirports.length, 10);
    assert.equal(d.body.topAirports[0].airport.country, 'SE');
    assert.ok(d.body.visitors >= 3);
    assert.equal((await api('GET', '/api/countries/QQ')).status, 404);
  });

  test('lounger: sök, detalj, recension och topplista', async () => {
    const list = await api('GET', '/api/lounges?iata=GOT');
    const sas = list.body.find((l) => l.name === 'SAS Lounge');
    assert.ok(sas && sas.airport.iata === 'GOT');
    assert.equal(sas.reviewCount, 2);
    const q = await api('GET', '/api/lounges?q=senator');
    assert.equal(q.body[0].airport.iata, 'FRA');
    const byCountry = await api('GET', '/api/lounges?country=QA');
    assert.ok(byCountry.body.every((l) => l.airport.country === 'QA'));

    const rev = await api('POST', `/api/lounges/${sas.id}/reviews`, { token: oliver, body: { rating: 4.5, comment: 'Ny <b>recension</b>', visitedOn: '2026-10-20' } });
    assert.equal(rev.status, 201);
    assert.equal(rev.body.user.username, 'oliver');
    assert.equal((await api('POST', `/api/lounges/${sas.id}/reviews`, { token: oliver, body: { rating: 0.5, visitedOn: '2026-10-20' } })).status, 400);
    assert.equal((await api('POST', `/api/lounges/${sas.id}/reviews`, { token: oliver, body: { rating: 4, visitedOn: tomorrow() } })).status, 400);
    assert.equal((await api('POST', `/api/lounges/${sas.id}/reviews`, { body: { rating: 4, visitedOn: '2026-10-20' } })).status, 401);

    const created = await api('POST', '/api/airports/GOT/lounges', { token: oliver, body: { name: 'Nya Loungen', terminal: 'Pir B' } });
    assert.equal(created.status, 201);
    assert.equal(created.body.avgRating, null);
    assert.equal((await api('POST', '/api/airports/GOT/lounges', { token: oliver, body: { name: 'nya loungen' } })).status, 409);
    assert.equal((await api('POST', '/api/airports/XXX/lounges', { token: oliver, body: { name: 'X lounge' } })).status, 404);

    const top = await api('GET', '/api/rankings/lounges?minReviews=1');
    assert.equal(top.body[0].rank, 1);
    assert.equal(top.body[0].avgRating, 5);
    assert.ok(top.body[0].lounge.name && top.body[0].airport.iata);
  });

  test('sök i kommentarer och recensioner', async () => {
    const r = await api('GET', '/api/search?q=lounge');
    assert.ok(r.body.length >= 3);
    assert.ok(r.body.some((x) => x.type === 'lounge_review' && x.loungeName));
    for (const hit of r.body) assert.match(hit.snippet, /<mark>lounge/i);

    const sv = await api('GET', '/api/search?q=sakerhetskontroll');
    assert.ok(sv.body.length >= 1, 'diakritik-tolerant');

    const filtered = await api('GET', '/api/search?q=lounge&iata=IST&minRating=4');
    assert.ok(filtered.body.length >= 1);
    assert.ok(filtered.body.every((x) => x.airport.iata === 'IST' && x.rating >= 4));

    const iataOnly = await api('GET', '/api/search?iata=JFK');
    assert.ok(iataOnly.body.length >= 2 && iataOnly.body.every((x) => x.airport.iata === 'JFK'));

    const business = await api('GET', '/api/search?iata=DOH&travelClass=business');
    assert.ok(business.body.length >= 2);
    const qr = await api('GET', '/api/search?q=lounge&airline=QR');
    assert.ok(qr.body.length >= 1);
    assert.ok(qr.body.every((x) => ['DOH', 'SIN'].includes(x.airport.iata)));
    assert.equal((await api('GET', '/api/search?q=x&travelClass=cargo')).status, 400);

    // HTML i kommentarer escapas, bara <mark> släpps igenom
    const html = await api('GET', '/api/search?q=recension');
    const hit = html.body.find((x) => x.comment.includes('<b>'));
    assert.ok(hit);
    assert.ok(hit.snippet.includes('&lt;b&gt;'));
    assert.ok(!hit.snippet.includes('<b>'));

    // Ogiltiga/tomma söksträngar ger 400, aldrig 500
    for (const q of ['', '"', '***', 'AND OR NOT', '(', 'NEAR(', '"a" OR "b']) {
      const x = await api('GET', `/api/search?q=${encodeURIComponent(q)}`);
      assert.ok([200, 400].includes(x.status), `${q} gav ${x.status}`);
    }
    assert.equal((await api('GET', '/api/search')).status, 400);
    assert.equal((await api('GET', '/api/search?q=%22%22')).status, 400);
  });

  test('önskelista', async () => {
    const before = await api('GET', '/api/users/oliver/wishlist');
    assert.equal(before.body.length, 4);
    const add = await api('POST', '/api/wishlist', { token: oliver, body: { iata: 'lax' } });
    assert.equal(add.status, 201);
    assert.equal(add.body.airport.iata, 'LAX');
    assert.equal((await api('POST', '/api/wishlist', { token: oliver, body: { iata: 'LAX' } })).status, 201, 'idempotent');
    assert.equal((await api('POST', '/api/wishlist', { token: oliver, body: { iata: 'XXX' } })).status, 400);
    assert.equal((await api('POST', '/api/wishlist', { body: { iata: 'LAX' } })).status, 401);
    assert.equal((await api('GET', '/api/airports/LAX', { token: oliver })).body.onMyWishlist, true);
    assert.equal((await api('GET', '/api/users/oliver/wishlist')).body.length, 5);
    assert.equal((await api('DELETE', '/api/wishlist/LAX', { token: oliver })).status, 204);
    assert.equal((await api('GET', '/api/users/oliver/wishlist')).body.length, 4);
  });

  test('märken', async () => {
    const r = await api('GET', '/api/users/oliver/badges');
    const by = Object.fromEntries(r.body.map((b) => [b.id, b]));
    assert.equal(r.body.length, 14);
    for (const id of ['first-checkin', 'airports-10', 'countries-5', 'nordic', 'home-turf']) {
      assert.ok(by[id].earnedAt, `${id} borde vara upplåst`);
    }
    assert.equal(by['first-checkin'].earnedAt, '2026-01-12');
    assert.equal(by['airports-25'].earnedAt, null);
    assert.deepEqual(by['airports-25'].progress, { current: 10, target: 25 });
    assert.ok(by.nordic.name && by.nordic.description && by.nordic.icon);

    // newBadges: en till flygplats (MEL) låser inte upp något nytt märke
    const c = await api('POST', '/api/checkins', { token: oliver, body: { iata: 'MEL', visitedOn: '2026-10-25', kind: 'arrival' } });
    assert.deepEqual(c.body.newBadges, []);
  });

  test('kartor och täckningsgrad', async () => {
    const m = await api('GET', '/api/users/oliver/map');
    assert.equal(m.status, 200);
    assert.equal(m.headers.get('cache-control'), 'private, max-age=30');
    assert.equal(m.body.totals.total, 4008);
    assert.ok(m.body.totals.visited >= 11);
    assert.equal(m.body.totals.pct, Math.round((m.body.totals.visited / 4008) * 1000) / 10);
    const eu = m.body.continents.find((c) => c.code === 'EU');
    assert.equal(eu.name, 'Europa');
    const se = m.body.countries.find((c) => c.code === 'SE');
    assert.equal(se.name, 'Sverige');
    assert.equal(se.visited, 2);
    assert.ok(m.body.countries.every((c) => c.total > 0));
    assert.equal(m.body.countries[0].visited >= m.body.countries[1].visited, true);

    const all = await api('GET', '/api/users/oliver/map?scope=all');
    assert.equal(all.body.totals.total, 8799);

    const sm = await api('GET', '/api/users/oliver/map/se');
    assert.equal(sm.body.country.code, 'SE');
    assert.equal(sm.body.country.visited, 2);
    assert.equal(sm.body.country.total, sm.body.regions.reduce((s, g) => s + g.total, 0));
    const vg = sm.body.regions.find((g) => g.code === 'SE-Q');
    assert.equal(vg.name, 'Västra Götalands län');
    assert.equal(vg.visited, 1);
    const got = sm.body.airports.find((a) => a.iata === 'GOT');
    assert.equal(got.visited, true);
    assert.equal(got.visits, 5);
    assert.equal(got.scheduled, true);
    assert.equal((await api('GET', '/api/users/oliver/map/QQ')).status, 404);
    assert.equal((await api('GET', '/api/users/finnsinte/map')).status, 404);

    const t = Date.now();
    await api('GET', '/api/users/oliver/map');
    await api('GET', '/api/users/oliver/map/SE');
    assert.ok(Date.now() - t < 200, 'kartanropen ska vara snabba');
  });
});
