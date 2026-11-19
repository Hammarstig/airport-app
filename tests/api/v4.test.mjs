// API-kanttester för v4 (testagenten): skyddade standardval, inbjudningar, vänförslag, stammisar,
// utmaningar, import och årsöversikt. Kör: npm run test:api
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../server/src/app.js';

let server;
let base;
let uploadDir;

async function call(method, path, { token, body, raw, type } = {}) {
  const h = {};
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (raw !== undefined) {
    h['Content-Type'] = type || 'text/csv';
    payload = raw;
  } else if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + path, { method, headers: h, body: payload });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

let seq = 0;
async function user(extra = {}) {
  seq += 1;
  const username = `v4_${seq}_${Math.random().toString(36).slice(2, 6)}`;
  const r = await call('POST', '/api/auth/register', { body: { username, password: 'Flygplats-2026!', ...extra } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { username, token: r.body.token, reg: r.body };
}

const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

before(async () => {
  uploadDir = mkdtempSync(join(tmpdir(), 'gatelog-v4-'));
  // Produktionslika standardval för nya konton (i NODE_ENV=test är de annars avstängda).
  const app = createApp({
    dbPath: ':memory:',
    jwtSecret: 'v4-edge-secret-som-ar-langre-an-32-tecken',
    uploadDir,
    env: { NODE_ENV: 'test', NEW_ACCOUNT_PUBLISH_DELAY_HOURS: '1', NEW_ACCOUNT_HIDE_HOME: '1' },
  });
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  rmSync(uploadDir, { recursive: true, force: true });
});

describe('skyddade standardval', () => {
  test('nya konton får 1 h fördröjning och dold hemmaflygplats; privacy kan ändra vid registrering', async () => {
    const a = await user();
    assert.equal(a.reg.settings.publishDelayHours, 1);
    assert.equal(a.reg.settings.hideHomeAirport, true);
    const b = await user({ privacy: { publishDelayHours: 0, hideHomeAirport: false, isPrivate: true } });
    assert.deepEqual([b.reg.settings.publishDelayHours, b.reg.settings.hideHomeAirport, b.reg.settings.isPrivate], [0, false, true]);
    for (const privacy of [{ publishDelayHours: 5 }, 'ja', { isPrivate: 'ja' }]) {
      const r = await call('POST', '/api/auth/register', { body: { username: `v4bad_${Math.random().toString(36).slice(2, 7)}`, password: 'Flygplats-2026!', privacy } });
      assert.equal(r.status, 400, JSON.stringify(privacy));
    }
  });

  test('fördröjd check-in syns inte för andra och räknas inte i stammisar', async () => {
    const a = await user();
    const s = await user();
    for (const d of [2, 1]) await call('POST', '/api/checkins', { token: a.token, body: { iata: 'KSD', visitedOn: day(d), kind: 'departure' } });
    const feed = await call('GET', '/api/feed?scope=global&limit=100', { token: s.token });
    assert.ok(!feed.body.some((c) => c.user.username === a.username));
    const reg = await call('GET', '/api/airports/KSD/regulars');
    assert.equal(reg.body.mayor, null);
  });
});

describe('inbjudningar', () => {
  test('skapa, förhandsvisa, registrera med ref (skiftlägesokänslig), maxUses, radera', async () => {
    const host = await user();
    const inv = await call('POST', '/api/me/invites', { token: host.token, body: { maxUses: 1 } });
    assert.equal(inv.status, 201);
    assert.match(inv.body.code, /^[A-Z2-9]{10}$/);
    assert.equal(inv.body.url, `/register?ref=${inv.body.code}`);
    const prev = await call('GET', `/api/invites/${inv.body.code}`);
    assert.equal(prev.body.inviter.username, host.username);
    assert.equal((await call('GET', '/api/invites/AAAAAAAAAA')).status, 404);
    const guest = await user({ ref: inv.body.code.toLowerCase() });
    assert.equal(guest.reg.invitedBy, host.username);
    const p = await call('GET', `/api/users/${guest.username}`, { token: host.token });
    assert.equal(p.body.followedByMe, true);
    assert.equal(p.body.followsMe, true);
    // maxUses 1: nästa registrering ignorerar koden.
    const late = await user({ ref: inv.body.code });
    assert.equal(late.reg.invitedBy, null);
    const bad = await user({ ref: 'x"; DROP TABLE users;--' });
    assert.equal(bad.reg.invitedBy, null);
    assert.equal((await call('DELETE', `/api/me/invites/${inv.body.code}`, { token: guest.token })).status, 404);
    assert.equal((await call('DELETE', `/api/me/invites/${inv.body.code}`, { token: host.token })).status, 204);
  });

  test('max 10 aktiva inbjudningar och maxUses inom 1-100', async () => {
    const host = await user();
    for (const maxUses of [0, 101, 'x']) assert.equal((await call('POST', '/api/me/invites', { token: host.token, body: { maxUses } })).status, 400);
    for (let i = 0; i < 10; i++) assert.equal((await call('POST', '/api/me/invites', { token: host.token, body: {} })).status, 201);
    assert.equal((await call('POST', '/api/me/invites', { token: host.token, body: {} })).status, 409);
    assert.equal((await call('POST', '/api/me/invites', { body: {} })).status, 401);
  });
});

describe('vänförslag', () => {
  test('vän till vän föreslås med antal gemensamma; redan följda, blockerade och jag själv föreslås inte', async () => {
    const me = await user();
    const f = await user();
    const fof = await user();
    const blocked = await user();
    await call('POST', `/api/users/${f.username}/follow`, { token: me.token });
    await call('POST', `/api/users/${fof.username}/follow`, { token: f.token });
    await call('POST', `/api/users/${blocked.username}/follow`, { token: f.token });
    await call('POST', `/api/users/${blocked.username}/block`, { token: me.token });
    const s = await call('GET', '/api/me/suggestions?limit=50', { token: me.token });
    assert.equal(s.status, 200);
    const names = s.body.map((x) => x.username);
    const hit = s.body.find((x) => x.username === fof.username);
    assert.ok(hit, 'vän till vän saknas');
    assert.equal(hit.reason, 'friends');
    assert.equal(hit.mutualFriends, 1);
    for (const n of [me.username, f.username, blocked.username]) assert.ok(!names.includes(n), n);
    assert.equal((await call('GET', '/api/me/suggestions')).status, 401);
    assert.ok((await call('GET', '/api/me/suggestions?limit=1000', { token: me.token })).body.length <= 50);
  });
});

describe('stammisar och utmaningar', () => {
  test('borgmästare kräver 2 check-ins; lika behåller titeln; privata räknas inte; days valideras', async () => {
    const opts = { privacy: { publishDelayHours: 0 } };
    const a = await user(opts);
    const b = await user(opts);
    const ci = (u, d, extra = {}) => call('POST', '/api/checkins', { token: u.token, body: { iata: 'MMX', visitedOn: day(d), kind: 'departure', ...extra } });
    await ci(a, 5);
    assert.equal((await call('GET', '/api/airports/MMX/regulars')).body.mayor, null);
    await ci(a, 4);
    assert.equal((await call('GET', '/api/airports/MMX/regulars')).body.mayor.user.username, a.username);
    await ci(b, 3);
    await ci(b, 2);
    assert.equal((await call('GET', '/api/airports/MMX/regulars')).body.mayor.user.username, a.username, 'lika: nuvarande behåller');
    await ci(b, 1, { visibility: 'private' });
    assert.equal((await call('GET', '/api/airports/MMX/regulars')).body.mayor.user.username, a.username, 'privat check-in räknas inte');
    await ci(b, 1);
    assert.equal((await call('GET', '/api/airports/MMX/regulars')).body.mayor.user.username, b.username);
    assert.equal((await call('GET', '/api/airports/MMX')).body.mayor.user.username, b.username);
    for (const d of [6, 366, 'x']) assert.equal((await call('GET', `/api/airports/MMX/regulars?days=${d}`)).status, 400, String(d));
  });

  test('utmaningar räknas per månad; ogiltig månad ger 400', async () => {
    const u = await user({ privacy: { publishDelayHours: 0 } });
    const thisMonth = day(0).slice(0, 7);
    for (const iata of ['GOT', 'CPH', 'OSL']) {
      await call('POST', '/api/checkins', { token: u.token, body: { iata, visitedOn: day(0), kind: 'departure', comment: 'x', rating: 4 } });
    }
    const r = await call('GET', `/api/users/${u.username}/challenges`);
    assert.equal(r.body.month, thisMonth);
    const byId = Object.fromEntries(r.body.challenges.map((c) => [c.id, c]));
    assert.equal(byId['new-airports'].completed, true);
    assert.equal(byId.countries.completed, true);
    assert.equal(byId.reviewer.completed, true);
    assert.equal(byId.rater.completed, false);
    assert.equal(byId.rater.progress.current, 3);
    const notes = await call('GET', '/api/notifications', { token: u.token });
    assert.equal(notes.body.items.filter((n) => n.type === 'challenge_completed').length, 3);
    const old = await call('GET', `/api/users/${u.username}/challenges?month=2025-01`);
    assert.ok(old.body.challenges.every((c) => c.progress.current === 0));
    for (const m of ['2025-13', 'januari', '2025-1']) assert.equal((await call('GET', `/api/users/${u.username}/challenges?month=${m}`)).status, 400, m);
  });
});

describe('import', () => {
  test('dryRun sparar inget; import, dubbletter, framtida datum, ICAO och ångra', async () => {
    const u = await user();
    const csv = 'Date;From;To;Airline;Flight\n2025-06-01;GOT;AMS;KL;KL1158\n2025-06-01;GOT;AMS;KL;KL1158\n2025-07-10;ESSA;CPH;SK;SK1401\n2099-01-01;GOT;ARN;;\n';
    const dry = await call('POST', '/api/me/imports?dryRun=1', { token: u.token, raw: csv });
    assert.equal(dry.status, 200);
    assert.equal(dry.body.id, null);
    assert.equal(dry.body.imported, 0);
    assert.equal(dry.body.preview.length, 4);
    assert.ok(dry.body.preview.some((p) => p.iata === 'ARN'), 'ESSA ska översättas till ARN');
    assert.equal((await call('GET', `/api/users/${u.username}/checkins`, { token: u.token })).body.length, 0);
    const real = await call('POST', '/api/me/imports', { token: u.token, body: { csv } });
    assert.equal(real.status, 201);
    assert.equal(real.body.imported, 4);
    assert.equal(real.body.duplicates, 2);
    assert.equal(real.body.skipped.length, 1);
    const again = await call('POST', '/api/me/imports', { token: u.token, raw: csv });
    assert.equal(again.body.imported, 0);
    const list = await call('GET', '/api/me/imports', { token: u.token });
    assert.ok(list.body.some((i) => i.id === real.body.id));
    const other = await user();
    assert.equal((await call('DELETE', `/api/me/imports/${real.body.id}`, { token: other.token })).status, 404);
    assert.equal((await call('DELETE', `/api/me/imports/${real.body.id}`, { token: u.token })).status, 204);
    assert.equal((await call('GET', `/api/users/${u.username}/checkins`, { token: u.token })).body.length, 0);
  });

  test('felaktiga filer ger 400 eller 413, aldrig 500', async () => {
    const u = await user();
    const cases = [
      ['', 'text/csv'],
      ['namn,stad\nAnna,Göteborg\n', 'text/csv'],
      ['date,iata\n"2025-01-01,GOT\n', 'text/csv'],
      ['\u0000\u0001\u0002', 'text/csv'],
      ['date,iata\n2025-01-01,=cmd|calc!A1\n', 'text/csv'],
    ];
    for (const [raw, type] of cases) {
      const r = await call('POST', '/api/me/imports?dryRun=1', { token: u.token, raw, type });
      assert.ok([200, 400].includes(r.status), `${JSON.stringify(raw).slice(0, 30)} gav ${r.status}`);
    }
    const big = `date,iata\n${'2025-01-01,GOT\n'.repeat(80000)}`;
    assert.equal((await call('POST', '/api/me/imports?dryRun=1', { token: u.token, raw: big })).status, 413);
    const many = `date,iata\n${'2025-01-01,GOT\n'.repeat(5001)}`;
    assert.equal((await call('POST', '/api/me/imports?dryRun=1', { token: u.token, raw: many })).status, 400);
    assert.equal((await call('POST', '/api/me/imports', { raw: 'date,iata\n' })).status, 401);
  });
});

describe('årsöversikt', () => {
  test('år räknas på check-ins i året; ogiltigt år 400; privat profil 403', async () => {
    const u = await user({ privacy: { publishDelayHours: 0 } });
    await call('POST', '/api/checkins', { token: u.token, body: { iata: 'GOT', visitedOn: '2026-03-01', kind: 'departure' } });
    await call('POST', '/api/checkins', { token: u.token, body: { iata: 'SIN', visitedOn: '2025-03-01', kind: 'arrival' } });
    const y = await call('GET', `/api/users/${u.username}/year/2026`);
    assert.equal(y.status, 200);
    assert.equal(y.body.uniqueAirports, 1);
    assert.equal(y.body.months.length, 12);
    assert.equal(y.body.months.find((m) => m.month === '2026-03').checkins, 1);
    for (const yr of ['1850', '3000', 'abc']) assert.equal((await call('GET', `/api/users/${u.username}/year/${yr}`)).status, 400, yr);
    await call('PATCH', '/api/me/settings', { token: u.token, body: { isPrivate: true } });
    const other = await user();
    assert.equal((await call('GET', `/api/users/${u.username}/year/2026`, { token: other.token })).status, 403);
  });
});

describe('radering och serverlogg', () => {
  test('kontoradering loggar inget serverfel', { todo: 'BUG-17: refreshPublicStats körs efter DELETE /me och loggar "public_stats FOREIGN KEY constraint failed"' }, async () => {
    const u = await user();
    await call('POST', '/api/checkins', { token: u.token, body: { iata: 'GOT', visitedOn: day(1), kind: 'departure' } });
    const errors = [];
    const orig = console.error;
    console.error = (...a) => errors.push(a.join(' '));
    try {
      const r = await call('DELETE', '/api/me', { token: u.token, body: { password: 'Flygplats-2026!' } });
      assert.equal(r.status, 204);
    } finally {
      console.error = orig;
    }
    assert.deepEqual(errors.filter((e) => /public_stats|FOREIGN KEY/.test(e)), []);
  });
});
