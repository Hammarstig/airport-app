// Tester för API v4: säkerhetsfixar, skyddade standardval, inbjudningar och tillväxtfunktioner.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { startServer, daysAgo } from './helpers.js';

const ok = { visitedOn: daysAgo(0), kind: 'departure' };

async function loginRaw(s, username, password = 'hemligt123') {
  const res = await fetch(`${s.base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
  });
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('gl_refresh='))?.split(';')[0] ?? null;
  return { status: res.status, body: await res.json(), cookie, headers: res.headers };
}

// ---------------------------------------------------------------------------------------------
describe('säkerhet: utloggning, sessioner och inloggningsgräns', () => {
  let s;
  before(async () => {
    s = await startServer({ env: { NODE_ENV: 'test', LOGIN_FAIL_MAX: '3', LOGIN_FAIL_ACCOUNT_MAX: '5' } });
    await s.register('offer');
    await s.register('angripare');
  });
  after(() => s.close());

  test('utloggning med påhittad cookie återkallar inte någon annans session (IDOR)', async () => {
    const victim = await loginRaw(s, 'offer');
    const { sid } = jwt.decode(victim.body.token);
    const fake = await fetch(`${s.base}/api/auth/logout`, { method: 'POST', headers: { Cookie: `gl_refresh=${sid}.${'x'.repeat(43)}` } });
    assert.equal(fake.status, 204);
    assert.equal((await s.api('GET', '/api/me', { token: victim.body.token })).status, 200, 'offrets session lever');
    // Inloggad angripare med eget token kan inte heller logga ut offret via cookie
    const att = await loginRaw(s, 'angripare');
    await fetch(`${s.base}/api/auth/logout`, {
      method: 'POST', headers: { Cookie: `gl_refresh=${sid}.${'y'.repeat(43)}`, Authorization: `Bearer ${att.body.token}` },
    });
    assert.equal((await s.api('GET', '/api/me', { token: victim.body.token })).status, 200);
    assert.equal((await s.api('GET', '/api/me', { token: att.body.token })).status, 401, 'angriparens egen session avslutades');
    // Med rätt cookie fungerar utloggning
    const real = await fetch(`${s.base}/api/auth/logout`, { method: 'POST', headers: { Cookie: victim.cookie } });
    assert.equal(real.status, 204);
    assert.equal((await s.api('GET', '/api/me', { token: victim.body.token })).status, 401);
  });

  test('sessioner kan bara återkallas av ägaren (IDOR)', async () => {
    const victim = await loginRaw(s, 'offer');
    const att = await loginRaw(s, 'angripare');
    const { sid } = jwt.decode(victim.body.token);
    assert.equal((await s.api('DELETE', `/api/me/sessions/${sid}`, { token: att.body.token })).status, 404);
    assert.equal((await s.api('GET', '/api/me', { token: victim.body.token })).status, 200);
    const list = await s.api('GET', '/api/me/sessions', { token: att.body.token });
    assert.ok(!list.body.some((x) => x.id === sid));
  });

  test('gräns för misslyckade inloggningar per konto och IP', async () => {
    await s.register('gissad');
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await loginRaw(s, 'gissad', 'fel-losen-1')).status);
    assert.deepEqual(statuses, [401, 401, 401, 429]);
    const blocked = await loginRaw(s, 'gissad');
    assert.equal(blocked.status, 429, 'även rätt lösenord spärras under fönstret');
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.equal((await loginRaw(s, 'offer')).status, 200, 'andra konton påverkas inte');
  });

  test('lyckad inloggning nollställer räknaren för konto+IP', async () => {
    await s.register('glomsk');
    await loginRaw(s, 'glomsk', 'fel-losen-1');
    await loginRaw(s, 'glomsk', 'fel-losen-2');
    assert.equal((await loginRaw(s, 'glomsk')).status, 200);
    await loginRaw(s, 'glomsk', 'fel-losen-3');
    await loginRaw(s, 'glomsk', 'fel-losen-4');
    assert.equal((await loginRaw(s, 'glomsk')).status, 200);
    // Kontots totala gräns (5) räknas fortfarande över fönstret
    assert.equal((await loginRaw(s, 'glomsk', 'fel-losen-5')).status, 401);
    assert.equal((await loginRaw(s, 'glomsk')).status, 429);
  });
});

// ---------------------------------------------------------------------------------------------
describe('skyddade standardval för nya konton', () => {
  let s;
  before(async () => {
    s = await startServer({ env: { NODE_ENV: 'test', NEW_ACCOUNT_PUBLISH_DELAY_HOURS: '1', NEW_ACCOUNT_HIDE_HOME: '1' } });
  });
  after(() => s.close());

  test('registreringssvaret visar fördröjning och dold hemmaflygplats', async () => {
    const r = await s.api('POST', '/api/auth/register', { body: { username: 'nyborjare', password: 'hemligt123', homeIata: 'GOT' } });
    assert.equal(r.status, 201);
    assert.equal(r.body.settings.publishDelayHours, 1);
    assert.equal(r.body.settings.hideHomeAirport, true);
    assert.equal(r.body.settings.isPrivate, false);
    assert.equal(r.body.user.homeIata, 'GOT', 'man ser alltid sin egen hemmaflygplats');
    assert.equal(r.body.invitedBy, null);
    const other = await s.register('granne');
    assert.equal((await s.api('GET', '/api/users/nyborjare', { token: other })).body.homeIata, null);
    const c = await s.api('POST', '/api/checkins', { token: r.body.token, body: { ...ok, iata: 'GOT' } });
    assert.ok(Date.parse(c.body.publishAt) - Date.parse(c.body.createdAt) >= 3600_000 - 1000);
    assert.equal((await s.api('GET', `/api/checkins/${c.body.id}`, { token: other })).status, 404);
  });

  test('val vid registrering via privacy', async () => {
    const r = await s.api('POST', '/api/auth/register', {
      body: { username: 'oppen', password: 'hemligt123', privacy: { publishDelayHours: 0, hideHomeAirport: false, defaultVisibility: 'friends' } },
    });
    assert.equal(r.status, 201);
    assert.deepEqual(
      { d: r.body.settings.publishDelayHours, h: r.body.settings.hideHomeAirport, v: r.body.settings.defaultVisibility },
      { d: 0, h: false, v: 'friends' },
    );
    for (const privacy of ['ja', [1], { publishDelayHours: 3 }, { push: { like: false } }]) {
      const bad = await s.api('POST', '/api/auth/register', { body: { username: 'fel_val', password: 'hemligt123', privacy } });
      assert.equal(bad.status, 400, JSON.stringify(privacy));
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('inbjudningar och vänförslag', () => {
  let s;
  const t = {};
  before(async () => {
    s = await startServer();
    for (const u of ['vard', 'kompis', 'kompiskompis', 'resande']) t[u] = await s.register(u);
  });
  after(() => s.close());

  test('inbjudningslänk ger ömsesidig följning och notis', async () => {
    const inv = await s.api('POST', '/api/me/invites', { token: t.vard, body: { maxUses: 2 } });
    assert.equal(inv.status, 201);
    assert.match(inv.body.code, /^[A-HJ-NP-Z2-9]{10}$/);
    assert.equal(inv.body.url, `/register?ref=${inv.body.code}`);
    assert.equal((await s.api('POST', '/api/me/invites', { token: t.vard, body: { maxUses: 0 } })).status, 400);
    const pre = await s.api('GET', `/api/invites/${inv.body.code.toLowerCase()}`);
    assert.equal(pre.body.inviter.username, 'vard');
    assert.equal((await s.api('GET', '/api/invites/FINNSINTE2')).status, 404);

    const reg = await s.api('POST', '/api/auth/register', { body: { username: 'inbjuden', password: 'hemligt123', ref: inv.body.code } });
    assert.equal(reg.status, 201);
    assert.equal(reg.body.invitedBy, 'vard');
    const prof = await s.api('GET', '/api/users/vard', { token: reg.body.token });
    assert.equal(prof.body.followedByMe, true);
    assert.equal(prof.body.followsMe, true);
    const n = await s.api('GET', '/api/notifications', { token: t.vard });
    assert.equal(n.body.items[0].type, 'invite_accepted');
    assert.equal(n.body.items[0].text, 'inbjuden gick med via din inbjudan');

    // Ogiltig kod ignoreras, förbrukad kod fungerar inte
    const bad = await s.api('POST', '/api/auth/register', { body: { username: 'utanref', password: 'hemligt123', ref: 'FEL' } });
    assert.equal(bad.status, 201);
    assert.equal(bad.body.invitedBy, null);
    await s.api('POST', '/api/auth/register', { body: { username: 'andra_inb', password: 'hemligt123', ref: inv.body.code } });
    const third = await s.api('POST', '/api/auth/register', { body: { username: 'tredje_inb', password: 'hemligt123', ref: inv.body.code } });
    assert.equal(third.body.invitedBy, null, 'maxUses nått');
    assert.equal((await s.api('GET', '/api/me/invites', { token: t.vard })).body[0].uses, 2);
    assert.equal((await s.api('DELETE', `/api/me/invites/${inv.body.code}`, { token: t.kompis })).status, 404, 'bara ägaren');
    assert.equal((await s.api('DELETE', `/api/me/invites/${inv.body.code}`, { token: t.vard })).status, 204);
  });

  test('vänförslag: vänners vänner och gemensamma flygplatser', async () => {
    await s.api('POST', '/api/users/kompis/follow', { token: t.vard });
    await s.api('POST', '/api/users/kompiskompis/follow', { token: t.kompis });
    for (const iata of ['GOT', 'ARN', 'CPH']) {
      await s.api('POST', '/api/checkins', { token: t.vard, body: { ...ok, iata } });
      await s.api('POST', '/api/checkins', { token: t.resande, body: { ...ok, iata } });
    }
    const r = await s.api('GET', '/api/me/suggestions', { token: t.vard });
    assert.equal(r.status, 200);
    const by = Object.fromEntries(r.body.map((x) => [x.username, x]));
    assert.equal(by.kompiskompis.reason, 'friends');
    assert.equal(by.kompiskompis.mutualFriends, 1);
    assert.equal(by.resande.reason, 'airports');
    assert.equal(by.resande.sharedAirports, 3);
    assert.ok(!by.kompis && !by.vard && !by.inbjuden, 'inte redan följda eller sig själv');
    await s.api('POST', '/api/users/resande/block', { token: t.vard });
    assert.ok(!(await s.api('GET', '/api/me/suggestions', { token: t.vard })).body.some((x) => x.username === 'resande'));
  });
});

// ---------------------------------------------------------------------------------------------
describe('stammisar, utmaningar, import, delning och årsöversikt', () => {
  let s;
  let staticDir;
  const t = {};
  before(async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    staticDir = mkdtempSync(join(tmpdir(), 'gatelog-static-'));
    writeFileSync(join(staticDir, 'index.html'), '<!doctype html><html><head><title>Gatelog</title></head><body><div id="root"></div></body></html>');
    s = await startServer({ staticDir, env: { NODE_ENV: 'test', PUBLIC_URL: 'https://gatelog.example' } });
    for (const u of ['stammis', 'utmanare', 'gomd']) t[u] = await s.register(u);
  });
  after(() => s.close());

  test('stammis nummer ett och notiser vid byte', async () => {
    const ci = (u, iata = 'BMA', extra = {}) => s.api('POST', '/api/checkins', { token: t[u], body: { ...ok, iata, ...extra } });
    await ci('stammis');
    assert.equal((await s.api('GET', '/api/airports/BMA')).body.mayor, null, 'kräver minst 2 check-ins');
    await ci('stammis');
    let a = await s.api('GET', '/api/airports/BMA');
    assert.equal(a.body.mayor.user.username, 'stammis');
    assert.equal(a.body.mayor.checkins, 2);
    // Privata check-ins räknas inte
    for (let i = 0; i < 3; i++) await ci('gomd', 'BMA', { visibility: 'private' });
    assert.equal((await s.api('GET', '/api/airports/BMA')).body.mayor.user.username, 'stammis');
    // Lika behåller titeln, fler tar över
    await ci('utmanare');
    await ci('utmanare');
    assert.equal((await s.api('GET', '/api/airports/BMA')).body.mayor.user.username, 'stammis');
    await ci('utmanare');
    a = await s.api('GET', '/api/airports/BMA');
    assert.equal(a.body.mayor.user.username, 'utmanare');
    const reg = await s.api('GET', '/api/airports/BMA/regulars');
    assert.deepEqual(reg.body.regulars.map((x) => [x.rank, x.user.username, x.checkins]), [[1, 'utmanare', 3], [2, 'stammis', 2]]);
    assert.equal(reg.body.days, 60);
    assert.equal((await s.api('GET', '/api/airports/BMA/regulars?days=3')).status, 400);
    const gained = (await s.api('GET', '/api/notifications', { token: t.utmanare })).body.items.find((x) => x.type === 'mayor_gained');
    assert.equal(gained.text, 'Du är ny stammis nummer ett på BMA');
    assert.equal(gained.url, '/airport/BMA');
    const lost = (await s.api('GET', '/api/notifications', { token: t.stammis })).body.items.find((x) => x.type === 'mayor_lost');
    assert.equal(lost.text, 'utmanare tog över stammistiteln på BMA');
    const ms = await s.api('GET', '/api/users/utmanare/mayorships');
    assert.deepEqual(ms.body.map((x) => x.airport.iata), ['BMA']);
  });

  test('månadsutmaningar med notis', async () => {
    const month = daysAgo(0).slice(0, 7);
    let c = await s.api('GET', '/api/users/utmanare/challenges');
    assert.equal(c.body.month, month);
    assert.deepEqual(c.body.challenges.map((x) => x.id), ['new-airports', 'countries', 'reviewer', 'rater']);
    for (const iata of ['CPH', 'OSL']) {
      await s.api('POST', '/api/checkins', { token: t.utmanare, body: { ...ok, iata, comment: 'Bra', rating: 4 } });
    }
    c = await s.api('GET', '/api/users/utmanare/challenges');
    const by = Object.fromEntries(c.body.challenges.map((x) => [x.id, x]));
    assert.equal(by['new-airports'].completed, true, 'BMA, CPH, OSL');
    assert.equal(by.countries.completed, true);
    assert.equal(by['new-airports'].completedAt, null, 'andra ser inte lagrad tidpunkt (SEC-04)');
    const mine = await s.api('GET', '/api/users/utmanare/challenges', { token: t.utmanare });
    assert.ok(mine.body.challenges.find((x) => x.id === 'new-airports').completedAt);
    assert.deepEqual(by.rater.progress, { current: 2, target: 5 });
    const n = (await s.api('GET', '/api/notifications', { token: t.utmanare })).body.items.filter((x) => x.type === 'challenge_completed');
    assert.equal(n.length, 2);
    assert.ok(n.some((x) => x.text === 'Du klarade månadsutmaningen Nya horisonter'));
    assert.equal((await s.api('GET', '/api/users/utmanare/challenges?month=2026-13')).status, 400);
    const old = await s.api('GET', '/api/users/utmanare/challenges?month=2020-01');
    assert.ok(old.body.challenges.every((x) => !x.completed));
  });

  test('import av CSV: förhandsvisning, flygningar, ICAO, dubbletter och ångra', async () => {
    const csv = [
      'Date,From,To,Airline,Flight,Cabin',
      '2025-06-01,GOT,AMS,KL,KL 1158,Economy',
      '2025-06-01,ESGG,EHAM,KL,KL1158,Economy',
      '2025-06-08T07:30:00Z,AMS,"GOT",KL,KL1157,business',
      'inte-ett-datum,GOT,ARN,,,',
      '2025-07-01,GOT,XXX,,,',
      '2099-01-01,GOT,ARN,,,',
    ].join('\n');
    const dry = await fetch(`${s.base}/api/me/imports?dryRun=1`, {
      method: 'POST', headers: { 'Content-Type': 'text/csv', Authorization: `Bearer ${t.gomd}` }, body: csv,
    });
    const d = await dry.json();
    assert.equal(dry.status, 200);
    assert.equal(d.id, null);
    assert.equal(d.format, 'flights');
    assert.equal(d.rows, 6);
    assert.equal(d.preview.length, 4);
    assert.equal(d.duplicates, 2, 'ICAO-raden är samma flygning');
    assert.deepEqual(d.skipped.map((x) => [x.line, x.reason]), [[5, 'Ogiltigt datum'], [6, 'Okänd flygplats XXX'], [7, 'Datum i framtiden']]);
    assert.deepEqual(d.preview[0], { line: 2, iata: 'GOT', visitedOn: '2025-06-01', kind: 'departure', airlineIata: 'KL', flightNumber: 'KL1158' });
    assert.equal((await s.api('GET', '/api/users/gomd/checkins?limit=50', { token: t.gomd })).body.length, 3, 'dryRun sparar inget');

    const real = await s.api('POST', '/api/me/imports', { token: t.gomd, body: { csv } });
    assert.equal(real.status, 201);
    assert.equal(real.body.imported, 4);
    assert.match(real.body.id, /^[a-f0-9]{16}$/);
    const mine = await s.api('GET', '/api/users/gomd/checkins?limit=50', { token: t.gomd });
    const imported = mine.body.filter((x) => x.source === 'import');
    assert.equal(imported.length, 4);
    assert.equal(imported.find((x) => x.visitedOn === '2025-06-08' && x.kind === 'departure').travelClass, 'business');
    assert.ok(!(await s.api('GET', '/api/feed?scope=mine', { token: t.gomd })).body.some((x) => x.source === 'import'), 'inte i flöden');
    // Samma fil igen: allt är dubbletter
    const again = await s.api('POST', '/api/me/imports', { token: t.gomd, body: { csv } });
    assert.equal(again.status, 200);
    assert.equal(again.body.imported, 0);
    assert.equal(again.body.duplicates, 6);
    // En-flygplatsformat med semikolon och typ
    const single = await s.api('POST', '/api/me/imports', { token: t.gomd, body: { csv: 'visitedOn;iata;kind\n2024-12-24;ARN;transfer\n2024-12-25;arn;bogus' } });
    assert.equal(single.body.format, 'airports');
    assert.equal(single.body.imported, 1);
    assert.deepEqual(single.body.skipped, [{ line: 3, reason: 'Okänd typ bogus' }]);
    const badges = await s.api('GET', '/api/users/gomd/badges', { token: t.gomd });
    assert.equal(badges.body.find((b) => b.id === 'jul').tier, 'bronze', 'säsongsmärke från importerad julafton');

    assert.equal((await s.api('POST', '/api/me/imports', { token: t.gomd, body: { csv: 'foo,bar\n1,2' } })).status, 400);
    assert.equal((await s.api('POST', '/api/me/imports', { token: t.gomd, body: {} })).status, 400);
    const list = await s.api('GET', '/api/me/imports', { token: t.gomd });
    assert.equal(list.body.length, 2);
    assert.equal((await s.api('DELETE', `/api/me/imports/${real.body.id}`, { token: t.utmanare })).status, 404);
    assert.equal((await s.api('DELETE', `/api/me/imports/${real.body.id}`, { token: t.gomd })).status, 204);
    const after = await s.api('GET', '/api/users/gomd/checkins?limit=50', { token: t.gomd });
    assert.equal(after.body.filter((x) => x.source === 'import').length, 1);
  });

  test('Open Graph-taggar och delningskort', async () => {
    const html = async (path) => (await fetch(s.base + path)).text();
    const c = (await s.api('POST', '/api/checkins', { token: t.stammis, body: { ...ok, iata: 'GOT', rating: 4.5, comment: 'Kaffe <bra>' } })).body;
    let page = await html(`/c/${c.id}`);
    assert.match(page, /<title>stammis på GOT - Gatelog<\/title>/);
    assert.match(page, new RegExp(`<meta property="og:image" content="https://gatelog.example/api/checkins/${c.id}/card.svg">`));
    assert.match(page, /og:description" content="Avgång Göteborg Landvetter Airport · 4,5\/5 · Kaffe &lt;bra&gt;"/);
    assert.match(page, /twitter:card" content="summary_large_image"/);
    const priv = (await s.api('POST', '/api/checkins', { token: t.stammis, body: { ...ok, iata: 'GOT', visibility: 'private', comment: 'hemligt' } })).body;
    page = await html(`/c/${priv.id}`);
    assert.match(page, /<title>Gatelog<\/title>/);
    assert.ok(!page.includes('hemligt'));
    assert.equal((await fetch(`${s.base}/api/checkins/${priv.id}/card.svg`)).status, 404);

    page = await html('/airport/got');
    assert.match(page, /<title>Göteborg Landvetter Airport \(GOT\) - Gatelog<\/title>/);
    assert.match(page, /og:image" content="https:\/\/gatelog.example\/api\/airports\/GOT\/card.svg"/);
    page = await html('/u/stammis');
    assert.match(page, /og:image" content="https:\/\/gatelog.example\/api\/users\/stammis\/card.svg"/);
    await s.api('PATCH', '/api/me/settings', { token: t.utmanare, body: { isPrivate: true } });
    page = await html('/u/utmanare');
    assert.ok(!page.includes('/api/users/utmanare/card.svg'), 'privat profil ger allmän bild');
    page = await html('/leaderboard');
    assert.match(page, /<title>Gatelog<\/title>/);
    assert.match(page, /og:url" content="https:\/\/gatelog.example\/leaderboard"/);

    const svg = await fetch(`${s.base}/api/airports/GOT/card.svg`);
    assert.match(svg.headers.get('content-type'), /image\/svg\+xml/);
    assert.match(await svg.text(), /Göteborg Landvetter Airport/);
    assert.equal((await fetch(`${s.base}/api/airports/XXX/card.svg`)).status, 404);
  });

  test('årsöversikt', async () => {
    const year = Number(daysAgo(0).slice(0, 4));
    const r = await s.api('GET', `/api/users/stammis/year/${year}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.year, year);
    assert.equal(r.body.months.length, 12);
    assert.equal(r.body.months.reduce((n, m) => n + m.checkins, 0), r.body.checkins);
    assert.ok(r.body.newCountries.some((x) => x.code === 'SE' && x.name === 'Sverige'));
    assert.equal(r.body.firstCheckin.airport.iata, 'BMA');
    assert.equal(r.body.favoriteAirport.airport.iata, 'GOT');
    assert.ok(r.body.badgesEarned.some((b) => b.id === 'checkins' && b.tier === 'bronze'));
    assert.equal(r.body.challengesCompleted, null, 'bara ägaren ser lagrade utmaningar (SEC-04)');
    const own = await s.api('GET', `/api/users/stammis/year/${year}`, { token: t.stammis });
    assert.equal(typeof own.body.challengesCompleted, 'number');
    assert.ok(!JSON.stringify(r.body).includes('hemligt'));
    assert.equal((await s.api('GET', '/api/users/stammis/year/abc')).status, 400);
    assert.equal((await s.api('GET', `/api/users/utmanare/year/${year}`)).status, 403, 'privat profil');
  });
});

describe('id återanvänds inte (BUG-12)', () => {
  test('raderad check-in och kommentar får inte sitt id återanvänt', async () => {
    const s = await startServer();
    try {
      const a = await s.register('idett');
      const b = await s.register('idtva');
      const c1 = (await s.api('POST', '/api/checkins', { token: a, body: { ...ok, iata: 'GOT' } })).body;
      const m1 = (await s.api('POST', `/api/checkins/${c1.id}/comments`, { token: a, body: { body: 'x' } })).body;
      await s.api('DELETE', `/api/comments/${m1.id}`, { token: a });
      await s.api('DELETE', `/api/checkins/${c1.id}`, { token: a });
      const c2 = (await s.api('POST', '/api/checkins', { token: b, body: { ...ok, iata: 'ARN' } })).body;
      const m2 = (await s.api('POST', `/api/checkins/${c2.id}/comments`, { token: b, body: { body: 'y' } })).body;
      assert.ok(c2.id > c1.id);
      assert.ok(m2.id > m1.id);
      assert.equal((await s.api('GET', `/api/checkins/${c1.id}`)).status, 404);
    } finally {
      s.close();
    }
  });
});
