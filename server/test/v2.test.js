// Tester för API v2: socialt, notiser, gamification, topplistor, snabb check-in, konto, säkerhet och statistik.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer, daysAgo } from './helpers.js';
import { seedDemo } from '../scripts/seed-demo.js';
import { openDb, rebuildStats, SCHEMA_VERSION } from '../src/db.js';
import { levelInfo } from '../src/util.js';
import { streakFrom, mondayOf } from '../src/badges.js';
import { stripMetadata } from '../src/routes/photos.js';
import { snippetParts } from '../src/routes/search.js';
import { periodRange } from '../src/routes/rankings.js';
import { loadConfig, resolveSecret, ConfigError } from '../src/config.js';
import { createApp } from '../src/app.js';

const ok = { visitedOn: daysAgo(1), kind: 'departure' };

function snapshot(db) {
  const q = (sql) => JSON.stringify(db.prepare(sql).all());
  return [
    q('SELECT * FROM user_stats ORDER BY user_id'),
    q('SELECT * FROM airport_stats WHERE checkins > 0 ORDER BY iata'),
    q('SELECT * FROM user_airports ORDER BY user_id, iata'),
    q('SELECT * FROM user_countries ORDER BY user_id, country'),
    q('SELECT * FROM user_continents ORDER BY user_id, continent'),
    q('SELECT id, review_count, rating_sum FROM lounges ORDER BY id'),
  ];
}

// ---------------------------------------------------------------------------------------------
describe('enhetstester', () => {
  test('nivåer: 25*L*(L-1) XP', () => {
    assert.deepEqual(levelInfo(0), { level: 1, title: 'Passagerare', xp: 0, levelXp: 0, nextLevelXp: 50 });
    assert.equal(levelInfo(49).level, 1);
    assert.equal(levelInfo(50).level, 2);
    assert.equal(levelInfo(150).level, 3);
    assert.equal(levelInfo(1049).level, 6);
    assert.equal(levelInfo(1050).level, 7);
    assert.equal(levelInfo(1050).title, 'Pendlare');
    assert.equal(levelInfo(1400).nextLevelXp, 1400 + 400);
  });

  test('streaks i veckor', () => {
    const today = '2026-11-05'; // torsdag, vecka som börjar 2026-11-02
    assert.equal(mondayOf(today), '2026-11-02');
    assert.equal(mondayOf('2026-11-02'), '2026-11-02');
    assert.equal(mondayOf('2026-11-08'), '2026-11-02');
    assert.deepEqual(streakFrom([], today), { current: 0, longest: 0, thisWeek: false });
    assert.deepEqual(streakFrom(['2026-10-19', '2026-10-26', '2026-11-02'], today), { current: 3, longest: 3, thisWeek: true });
    // Ingen check-in denna vecka ännu: svit till och med förra veckan räknas
    assert.deepEqual(streakFrom(['2026-10-19', '2026-10-26'], today), { current: 2, longest: 2, thisWeek: false });
    // Bruten svit
    assert.deepEqual(streakFrom(['2026-01-05', '2026-01-12', '2026-01-19', '2026-10-19'], today), { current: 0, longest: 3, thisWeek: false });
  });

  test('perioder i Europe/Stockholm', () => {
    assert.deepEqual(periodRange('week', '2026-11-05'),
      { from: '2026-11-02', to: '2026-11-08', prev: { from: '2026-10-26', to: '2026-11-01' } });
    assert.deepEqual(periodRange('month', '2026-03-15'),
      { from: '2026-03-01', to: '2026-03-31', prev: { from: '2026-02-01', to: '2026-02-28' } });
    assert.deepEqual(periodRange('year', '2026-01-01'),
      { from: '2026-01-01', to: '2026-12-31', prev: { from: '2025-01-01', to: '2025-12-31' } });
    assert.deepEqual(periodRange('all'), { from: null, to: null, prev: null });
  });

  test('snippetParts', () => {
    assert.deepEqual(snippetParts('bra \u0001lounge\u0002 och <b>'), [
      { text: 'bra ', mark: false }, { text: 'lounge', mark: true }, { text: ' och <b>', mark: false },
    ]);
  });

  test('metadata tas bort ur JPEG, PNG och WEBP', () => {
    const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x14]), Buffer.from('Exif\0\0GPS-59.33,18.06')]);
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0]), app1,
      Buffer.from([0xff, 0xfe, 0x00, 0x07]), Buffer.from('hemma'),
      Buffer.from([0xff, 0xda, 0x00, 0x04, 0, 0, 1, 2, 3, 0xff, 0xd9]),
    ]);
    const j = stripMetadata(jpeg, 'jpg');
    assert.ok(!j.includes(Buffer.from('Exif')) && !j.includes(Buffer.from('GPS')) && !j.includes(Buffer.from('hemma')));
    assert.ok(j.includes(Buffer.from([0xff, 0xe0])) && j.includes(Buffer.from([0xff, 0xda])));
    assert.deepEqual(j.subarray(-2), Buffer.from([0xff, 0xd9]));

    const chunk = (type, data) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      return Buffer.concat([len, Buffer.from(type), data, Buffer.alloc(4)]);
    };
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', Buffer.alloc(13)), chunk('tEXt', Buffer.from('Location\0Stockholm')),
      chunk('eXIf', Buffer.from('GPSDATA')), chunk('IDAT', Buffer.alloc(5)), chunk('IEND', Buffer.alloc(0)),
    ]);
    const p = stripMetadata(png, 'png');
    assert.ok(!p.includes(Buffer.from('Stockholm')) && !p.includes(Buffer.from('GPSDATA')));
    assert.ok(p.includes(Buffer.from('IDAT')) && p.includes(Buffer.from('IEND')));

    const riff = (type, data) => {
      const h = Buffer.alloc(8); h.write(type, 0, 'latin1'); h.writeUInt32LE(data.length, 4);
      return Buffer.concat([h, data, Buffer.alloc(data.length % 2)]);
    };
    const vp8x = Buffer.alloc(10); vp8x[0] = 0x08 | 0x04;
    const body = Buffer.concat([riff('VP8X', vp8x), riff('VP8L', Buffer.alloc(6)), riff('EXIF', Buffer.from('GPS123')), riff('XMP ', Buffer.from('<x/>'))]);
    const head = Buffer.alloc(12); head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(body.length + 4, 4); head.write('WEBP', 8, 'latin1');
    const w = stripMetadata(Buffer.concat([head, body]), 'webp');
    assert.ok(!w.includes(Buffer.from('GPS123')) && !w.includes(Buffer.from('<x/>')));
    assert.equal(w.readUInt32LE(4), w.length - 8);
    assert.equal(w[20] & 0x0c, 0, 'EXIF/XMP-flaggor rensade i VP8X');
  });

  test('JWT_SECRET krävs i produktion', () => {
    const prod = loadConfig({ NODE_ENV: 'production' });
    assert.throws(() => resolveSecret(prod), ConfigError);
    assert.throws(() => resolveSecret(loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'kort' })), ConfigError);
    assert.equal(resolveSecret(loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) })), 'x'.repeat(32));
    assert.throws(() => createApp({ dbPath: ':memory:', env: { NODE_ENV: 'production' } }), /JWT_SECRET/);
    assert.equal(typeof resolveSecret(loadConfig({ NODE_ENV: 'development' }), undefined, { warn() {} }), 'string');
  });
});

// ---------------------------------------------------------------------------------------------
describe('socialt: följa, flöde, kommentarer, notiser', () => {
  let s;
  let ann;
  let bob;
  let cid;
  before(async () => {
    s = await startServer();
    ann = await s.register('ann', { homeIata: 'GOT' });
    bob = await s.register('bob');
  });
  after(() => s.close());

  test('följa och avfölja', async () => {
    assert.equal((await s.api('POST', '/api/users/ann/follow', { token: ann })).status, 400);
    assert.equal((await s.api('POST', '/api/users/ann/follow')).status, 401);
    assert.equal((await s.api('POST', '/api/users/finnsinte/follow', { token: bob })).status, 404);
    let r = await s.api('POST', '/api/users/ann/follow', { token: bob });
    assert.deepEqual(r.body, { following: true, followers: 1 });
    r = await s.api('POST', '/api/users/ann/follow', { token: bob });
    assert.deepEqual(r.body, { following: true, followers: 1 }, 'idempotent');

    const prof = await s.api('GET', '/api/users/ann', { token: bob });
    assert.equal(prof.body.followers, 1);
    assert.equal(prof.body.following, 0);
    assert.equal(prof.body.followedByMe, true);
    assert.equal(prof.body.followsMe, false);
    assert.equal(prof.body.level, 1);
    assert.equal(prof.body.levelInfo.level, 1);
    assert.deepEqual(prof.body.streak, { current: 0, longest: 0, thisWeek: false });

    const followers = await s.api('GET', '/api/users/ann/followers', { token: ann });
    assert.equal(followers.body[0].username, 'bob');
    assert.equal(followers.body[0].followedByMe, false);
    const following = await s.api('GET', '/api/users/bob/following');
    assert.equal(following.body[0].username, 'ann');
    const search = await s.api('GET', '/api/users?q=ann', { token: bob });
    assert.equal(search.body[0].followedByMe, true);

    // En följ-notis trots två anrop
    const n = await s.api('GET', '/api/notifications', { token: ann });
    assert.equal(n.body.items.filter((x) => x.type === 'follow').length, 1);
    assert.equal(n.body.items[0].text, 'bob började följa dig');
    assert.equal(n.body.items[0].actor.username, 'bob');

    r = await s.api('DELETE', '/api/users/ann/follow', { token: bob });
    assert.deepEqual(r.body, { following: false, followers: 0 });
    await s.api('POST', '/api/users/ann/follow', { token: bob });
  });

  test('vänflöde och hemmaflygplatsnotis', async () => {
    const carl = await s.register('carl');
    const own = await s.api('POST', '/api/checkins', { token: bob, body: { ...ok, iata: 'CPH' } });
    await s.api('POST', '/api/checkins', { token: carl, body: { ...ok, iata: 'OSL' } });
    const a = await s.api('POST', '/api/checkins', { token: ann, body: { ...ok, iata: 'ARN', comment: 'Hej' } });
    cid = a.body.id;
    assert.equal((await s.api('GET', '/api/feed?scope=friends')).status, 401);
    const feed = await s.api('GET', '/api/feed?scope=friends', { token: bob });
    assert.deepEqual(feed.body.map((c) => c.user.username).sort(), ['ann', 'bob']);
    assert.equal(feed.body.find((c) => c.id === own.body.id).commentCount, 0);

    // bob följer ann (hemma GOT) och checkar in på GOT -> ann får home_visit
    await s.api('POST', '/api/checkins', { token: bob, body: { ...ok, iata: 'GOT' } });
    // carl följer inte ann -> ingen notis
    await s.api('POST', '/api/checkins', { token: carl, body: { ...ok, iata: 'GOT' } });
    const n = await s.api('GET', '/api/notifications?unread=1', { token: ann });
    const hv = n.body.items.filter((x) => x.type === 'home_visit');
    assert.equal(hv.length, 1);
    assert.equal(hv[0].text, 'bob checkade in på din hemmaflygplats GOT');
    assert.deepEqual(hv[0].airport, { iata: 'GOT', name: 'Göteborg Landvetter Airport' });

    const detail = await s.api('GET', '/api/airports/GOT', { token: bob });
    assert.deepEqual(detail.body.friendsVisited, []);
    const detail2 = await s.api('GET', '/api/airports/ARN', { token: bob });
    assert.deepEqual(detail2.body.friendsVisited.map((u) => u.username), ['ann']);
  });

  test('kommentarer: skapa, lista, ändra, radera', async () => {
    assert.equal((await s.api('POST', `/api/checkins/${cid}/comments`, { body: { body: 'x' } })).status, 401);
    assert.equal((await s.api('POST', `/api/checkins/${cid}/comments`, { token: bob, body: { body: '   ' } })).status, 400);
    assert.equal((await s.api('POST', `/api/checkins/${cid}/comments`, { token: bob, body: { body: 'x'.repeat(501) } })).status, 400);
    assert.equal((await s.api('POST', '/api/checkins/999999/comments', { token: bob, body: { body: 'x' } })).status, 404);

    const c1 = await s.api('POST', `/api/checkins/${cid}/comments`, { token: bob, body: { body: 'Snyggt <b>ann</b>!' } });
    assert.equal(c1.status, 201);
    assert.equal(c1.body.body, 'Snyggt <b>ann</b>!');
    assert.equal(c1.body.user.username, 'bob');
    assert.equal(c1.body.canDelete, true);
    assert.equal(c1.body.editedAt, null);
    const c2 = await s.api('POST', `/api/checkins/${cid}/comments`, { token: ann, body: { body: 'Tack!' } });

    const list = await s.api('GET', `/api/checkins/${cid}/comments`, { token: ann });
    assert.deepEqual(list.body.map((c) => c.body), ['Snyggt <b>ann</b>!', 'Tack!']);
    assert.ok(list.body.every((c) => c.canDelete), 'ägaren får radera alla kommentarer på sin check-in');
    const anon = await s.api('GET', `/api/checkins/${cid}/comments`);
    assert.ok(anon.body.every((c) => !c.canDelete));
    assert.equal((await s.api('GET', `/api/checkins/${cid}`)).body.commentCount, 2);

    // Notis till ägaren, inte för egen kommentar
    const n = await s.api('GET', '/api/notifications', { token: ann });
    const comments = n.body.items.filter((x) => x.type === 'comment');
    assert.equal(comments.length, 1);
    assert.equal(comments[0].checkinId, cid);
    assert.equal(comments[0].text, 'bob kommenterade din check-in på ARN');

    assert.equal((await s.api('PATCH', `/api/comments/${c1.body.id}`, { token: ann, body: { body: 'hack' } })).status, 403);
    const ed = await s.api('PATCH', `/api/comments/${c1.body.id}`, { token: bob, body: { body: 'Ändrad' } });
    assert.equal(ed.body.body, 'Ändrad');
    assert.ok(ed.body.editedAt);

    const carl = await s.login('carl', 'hemligt123');
    assert.equal((await s.api('DELETE', `/api/comments/${c2.body.id}`, { token: carl })).status, 403);
    assert.equal((await s.api('DELETE', `/api/comments/${c1.body.id}`, { token: ann })).status, 204, 'ägaren raderar');
    assert.equal((await s.api('DELETE', `/api/comments/${c2.body.id}`, { token: ann })).status, 204, 'författaren raderar');
    assert.equal((await s.api('GET', `/api/checkins/${cid}`)).body.commentCount, 0);
    assert.equal((await s.api('DELETE', `/api/comments/${c2.body.id}`, { token: ann })).status, 404);
  });

  test('gilla ger en notis, inte för egna', async () => {
    await s.api('POST', `/api/checkins/${cid}/like`, { token: bob });
    await s.api('DELETE', `/api/checkins/${cid}/like`, { token: bob });
    await s.api('POST', `/api/checkins/${cid}/like`, { token: bob });
    await s.api('POST', `/api/checkins/${cid}/like`, { token: ann });
    const n = await s.api('GET', '/api/notifications', { token: ann });
    const likes = n.body.items.filter((x) => x.type === 'like');
    assert.equal(likes.length, 1);
    assert.equal(likes[0].text, 'bob gillade din check-in på ARN');
  });

  test('olästa notiser och markera som läst', async () => {
    let c = await s.api('GET', '/api/notifications/unread-count', { token: ann });
    assert.ok(c.body.unread >= 4);
    assert.equal((await s.api('GET', '/api/notifications/unread-count')).status, 401);
    const all = await s.api('GET', '/api/notifications', { token: ann });
    assert.equal(all.body.unread, c.body.unread);
    const first = all.body.items[0];
    assert.equal((await s.api('POST', '/api/notifications/read', { token: ann, body: { ids: ['x'] } })).status, 400);
    let r = await s.api('POST', '/api/notifications/read', { token: ann, body: { ids: [first.id] } });
    assert.equal(r.body.unread, c.body.unread - 1);
    // Andras notiser påverkas inte
    r = await s.api('POST', '/api/notifications/read', { token: bob, body: { ids: all.body.items.map((x) => x.id) } });
    assert.equal((await s.api('GET', '/api/notifications/unread-count', { token: ann })).body.unread, c.body.unread - 1);
    r = await s.api('POST', '/api/notifications/read', { token: ann, body: {} });
    assert.equal(r.body.unread, 0);
    const unread = await s.api('GET', '/api/notifications?unread=1', { token: ann });
    assert.equal(unread.body.items.length, 0);
    c = await s.api('GET', '/api/notifications', { token: ann });
    assert.ok(c.body.items.every((x) => x.read));
  });
});

// ---------------------------------------------------------------------------------------------
describe('gamification: XP, nivå, milstolpar, märken', () => {
  let s;
  let tok;
  before(async () => {
    s = await startServer();
    tok = await s.register('resa', { homeIata: 'GOT' });
  });
  after(() => s.close());

  test('check-in ger XP, milstolpar och märke', async () => {
    const r = await s.api('POST', '/api/checkins', { token: tok, body: { ...ok, iata: 'GOT', rating: 4, comment: 'Bra' } });
    // 10 check-in + 25 flygplats + 50 land + 100 kontinent + 5 kommentar + 5 betyg
    assert.equal(r.body.xpGained, 195);
    assert.equal(r.body.levelInfo.xp, 195);
    assert.equal(r.body.levelInfo.level, 3);
    assert.equal(r.body.levelUp, true);
    assert.equal(r.body.user.level, 3);
    assert.deepEqual({ ...r.body.milestones, streak: undefined }, {
      isNewAirport: true, isNewCountry: true, isNewContinent: true, uniqueAirports: 1, countries: 1, continents: 1,
      worldPct: 0, streak: undefined,
    });
    assert.equal(r.body.milestones.streak.thisWeek, daysAgo(1) >= mondayOf(daysAgo(0)));
    assert.deepEqual(r.body.newBadges.map((b) => [b.id, b.tier, b.tierLevel]), [['checkins', 'bronze', 1]]);
    assert.equal(r.body.newBadges[0].rarity, 100);

    const again = await s.api('POST', '/api/checkins', { token: tok, body: { ...ok, iata: 'GOT' } });
    assert.equal(again.body.xpGained, 10);
    assert.equal(again.body.levelUp, false);
    assert.equal(again.body.milestones.isNewAirport, false);
    const arn = await s.api('POST', '/api/checkins', { token: tok, body: { ...ok, iata: 'ARN' } });
    assert.equal(arn.body.xpGained, 35);
    assert.equal(arn.body.milestones.isNewCountry, false);
    assert.equal(arn.body.milestones.worldPct, Math.round((2 / 4008) * 1000) / 10);
  });

  test('märkesnivåer registreras och notifieras', async () => {
    for (const iata of ['CPH', 'OSL', 'HEL']) {
      await s.api('POST', '/api/checkins', { token: tok, body: { ...ok, iata, kind: 'transfer' } });
    }
    const badges = await s.api('GET', '/api/users/resa/badges');
    const by = Object.fromEntries(badges.body.map((b) => [b.id, b]));
    assert.equal(by.nordic.tier, 'gold'); // SE, DK, NO, FI
    assert.deepEqual(by.nordic.tiers.map((t) => !!t.earnedAt), [true, true, true, false]);
    assert.deepEqual(by.nordic.progress, { current: 4, target: 5 });
    assert.equal(by['transfer-king'].tier, 'bronze');
    assert.equal(by.airports.tier, null);
    assert.equal(by.airports.tierLevel, 0);
    assert.equal(by.airports.earnedAt, null);
    const n = await s.api('GET', '/api/notifications', { token: tok });
    const nordic = n.body.items.filter((x) => x.type === 'badge' && x.badge.id === 'nordic');
    assert.ok(nordic.length >= 1);
    assert.match(nordic[0].text, /^Du nådde (silver|guld) i märket Nordisk resenär$/);

    // Nivåer tas inte tillbaka när check-ins raderas
    const mine = await s.api('GET', '/api/users/resa/checkins?limit=50');
    for (const c of mine.body.filter((x) => x.airport.iata === 'HEL')) await s.api('DELETE', `/api/checkins/${c.id}`, { token: tok });
    const after = await s.api('GET', '/api/users/resa/badges');
    assert.equal(after.body.find((b) => b.id === 'nordic').tier, 'gold');
  });
});

// ---------------------------------------------------------------------------------------------
describe('topplistor', () => {
  let s;
  const t = {};
  before(async () => {
    s = await startServer();
    for (const u of ['ett', 'tva', 'tre', 'fyra']) t[u] = await s.register(u);
    const ci = (u, iata, visitedOn) => s.api('POST', '/api/checkins', { token: t[u], body: { iata, visitedOn, kind: 'departure' } });
    const today = daysAgo(0);
    const lastWeek = daysAgo(7);
    // Denna vecka: ett 3 flygplatser, tva 2, tre 2, fyra 1. Förra veckan: fyra 5, ett 1.
    for (const iata of ['GOT', 'ARN', 'CPH']) await ci('ett', iata, today);
    for (const iata of ['GOT', 'OSL']) await ci('tva', iata, today);
    for (const iata of ['LHR', 'CDG']) await ci('tre', iata, today);
    await ci('fyra', 'GOT', today);
    for (const iata of ['FRA', 'MUC', 'AMS', 'BRU', 'ZRH']) await ci('fyra', iata, lastWeek);
    await ci('ett', 'HEL', lastWeek);
    await s.api('POST', '/api/users/tva/follow', { token: t.ett });
  });
  after(() => s.close());

  test('vecka globalt med egen placering, omgivning och förändring', async () => {
    const r = await s.api('GET', '/api/rankings/users?metric=airports&period=week', { token: t.fyra });
    assert.equal(r.status, 200);
    assert.equal(r.body.from, mondayOf(daysAgo(0)));
    assert.deepEqual(r.body.items.map((x) => [x.rank, x.user.username, x.value]), [
      [1, 'ett', 3], [2, 'tva', 2], [2, 'tre', 2], [4, 'fyra', 1],
    ]);
    const ranks = Object.fromEntries(r.body.items.map((x) => [x.user.username, x]));
    assert.equal(ranks.ett.rank, 1);
    assert.equal(ranks.tva.rank, 2);
    assert.equal(ranks.tre.rank, 2, 'lika värde ger samma plats');
    assert.equal(ranks.fyra.rank, 4);
    assert.equal(ranks.fyra.change, 1 - 4, 'fyra var etta förra veckan');
    assert.equal(ranks.ett.change, 2 - 1);
    assert.equal(ranks.tva.change, null, 'fanns inte med förra veckan');
    assert.deepEqual(r.body.me, { rank: 4, value: 1, change: -3 });
    assert.deepEqual(r.body.around.map((x) => x.user.username).slice(-1), ['fyra']);
    assert.equal(r.body.around.length, 3);
  });

  test('vänner, land, hela tiden, xp och äldre leaderboard', async () => {
    const fr = await s.api('GET', '/api/rankings/users?metric=airports&period=week&scope=friends', { token: t.ett });
    assert.deepEqual(fr.body.items.map((x) => [x.rank, x.user.username]), [[1, 'ett'], [2, 'tva']]);
    assert.equal((await s.api('GET', '/api/rankings/users?scope=friends')).status, 401);

    const se = await s.api('GET', '/api/rankings/users?metric=airports&scope=country&country=SE');
    assert.deepEqual(se.body.items.map((x) => [x.user.username, x.value]).sort(), [['ett', 2], ['fyra', 1], ['tva', 1]]);
    assert.equal((await s.api('GET', '/api/rankings/users?scope=country')).status, 400);

    const all = await s.api('GET', '/api/rankings/users?metric=airports&period=all', { token: t.tre });
    assert.equal(all.body.items[0].user.username, 'fyra');
    assert.equal(all.body.items[0].value, 6);
    assert.equal(all.body.items[0].change, null);
    assert.equal(all.body.me.rank, 3);

    const xp = await s.api('GET', '/api/rankings/users?metric=xp');
    assert.equal(xp.body.items[0].user.username, 'fyra');
    assert.equal((await s.api('GET', '/api/rankings/users?metric=xp&period=week')).status, 400);

    const legacy = await s.api('GET', '/api/leaderboard?metric=airports&period=week');
    assert.ok(Array.isArray(legacy.body));
    assert.deepEqual(Object.keys(legacy.body[0]), ['rank', 'user', 'value']);
    assert.equal(legacy.body[0].user.username, 'ett');

    const anon = await s.api('GET', '/api/rankings/users?period=month');
    assert.equal(anon.body.me, null);
    assert.deepEqual(anon.body.around, []);
  });

  test('Bayesianskt snitt: ett ensamt 5,0 slår inte många 4,5', async () => {
    const many = [];
    for (let i = 0; i < 6; i++) many.push(await s.register(`betyg${i}`));
    for (const tok of many) await s.api('POST', '/api/checkins', { token: tok, body: { iata: 'HEL', visitedOn: daysAgo(2), kind: 'transfer', rating: 4.5 } });
    await s.api('POST', '/api/checkins', { token: many[0], body: { iata: 'KEF', visitedOn: daysAgo(2), kind: 'arrival', rating: 5 } });
    await s.api('POST', '/api/checkins', { token: many[1], body: { iata: 'CDG', visitedOn: daysAgo(2), kind: 'arrival', rating: 1 } });
    const r = await s.api('GET', '/api/rankings/airports');
    assert.equal(r.body[0].airport.iata, 'HEL');
    const kef = r.body.find((x) => x.airport.iata === 'KEF');
    assert.equal(kef.avgRating, 5);
    assert.ok(kef.score < r.body[0].score);
    assert.ok(r.body.every((x, i, a) => i === 0 || a[i - 1].score >= x.score));
    const sorted = await s.api('GET', '/api/airports?sort=rating&limit=3');
    assert.equal(sorted.body[0].iata, 'HEL');
  });
});

// ---------------------------------------------------------------------------------------------
describe('snabb check-in, redigering, lounger, konto', () => {
  let s;
  let tok;
  let other;
  before(async () => {
    s = await startServer();
    tok = await s.register('konto', { homeIata: 'GOT' });
    other = await s.register('annan');
  });
  after(() => s.close());

  test('flygplatser nära mig', async () => {
    const r = await s.api('GET', '/api/airports/nearby?lat=57.7089&lon=11.9746&limit=5');
    assert.equal(r.status, 200);
    assert.equal(r.body[0].iata, 'GOT');
    assert.ok(r.body[0].distanceKm > 15 && r.body[0].distanceKm < 30);
    assert.equal(r.body[0].countryName, 'Sverige');
    assert.ok(r.body.every((a, i, arr) => i === 0 || arr[i - 1].distanceKm <= a.distanceKm));
    const all = await s.api('GET', '/api/airports/nearby?lat=57.7089&lon=11.9746&limit=50&scope=all');
    assert.ok(all.body.length > r.body.length);
    const small = await s.api('GET', '/api/airports/nearby?lat=0&lon=-160&radiusKm=50');
    assert.deepEqual(small.body, []);
    for (const q of ['', '?lat=91&lon=0', '?lat=abc&lon=1', '?lat=10']) {
      assert.equal((await s.api('GET', `/api/airports/nearby${q}`)).status, 400, q);
    }
    // Datumlinjen
    const fiji = await s.api('GET', '/api/airports/nearby?lat=-17.75&lon=179.9&limit=3');
    assert.ok(fiji.body.length > 0);
  });

  test('senaste flygplatser med hemmaflygplatsen först', async () => {
    let r = await s.api('GET', '/api/me/recent-airports', { token: tok });
    assert.deepEqual(r.body.map((x) => [x.airport.iata, x.isHome, x.visits]), [['GOT', true, 0]]);
    for (const iata of ['ARN', 'CPH', 'ARN']) await s.api('POST', '/api/checkins', { token: tok, body: { ...ok, iata } });
    r = await s.api('GET', '/api/me/recent-airports', { token: tok });
    assert.deepEqual(r.body.map((x) => x.airport.iata), ['GOT', 'ARN', 'CPH']);
    assert.equal(r.body[1].visits, 2);
    assert.equal((await s.api('GET', '/api/me/recent-airports')).status, 401);
  });

  test('redigera check-in', async () => {
    const c = (await s.api('POST', '/api/checkins', {
      token: tok, body: { iata: 'OSL', visitedOn: daysAgo(3), kind: 'arrival', rating: 2, comment: 'gammalord', airlineIata: 'DY' },
    })).body;
    assert.equal((await s.api('PATCH', `/api/checkins/${c.id}`, { token: other, body: { rating: 5 } })).status, 403);
    assert.equal((await s.api('PATCH', `/api/checkins/${c.id}`, { token: tok, body: { iata: 'ARN' } })).status, 400);
    assert.equal((await s.api('PATCH', `/api/checkins/${c.id}`, { token: tok, body: { rating: 4.2 } })).status, 400);
    assert.equal((await s.api('PATCH', `/api/checkins/${c.id}`, { token: tok, body: { loungeRating: 4 } })).status, 400);
    const r = await s.api('PATCH', `/api/checkins/${c.id}`, {
      token: tok, body: { rating: 4.5, comment: 'nyttord', ratings: { wifi: 5 }, airlineIata: null, travelClass: 'business', visitedOn: daysAgo(2) },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.rating, 4.5);
    assert.equal(r.body.comment, 'nyttord');
    assert.equal(r.body.ratings.wifi, 5);
    assert.equal(r.body.airline, null);
    assert.equal(r.body.travelClass, 'business');
    assert.equal(r.body.visitedOn, daysAgo(2));
    assert.equal(r.body.kind, 'arrival', 'oförändrat fält');
    assert.ok(r.body.editedAt);
    // Statistik och sökindex följer med
    const a = await s.api('GET', '/api/airports/OSL');
    assert.equal(a.body.stats.avgRating, 4.5);
    assert.equal(a.body.stats.subAverages.wifi, 5);
    assert.equal(a.body.stats.classMix.business, 1);
    assert.equal((await s.api('GET', '/api/search?q=gammalord')).body.length, 0);
    assert.equal((await s.api('GET', '/api/search?q=nyttord')).body.length, 1);
    const cleared = await s.api('PATCH', `/api/checkins/${c.id}`, { token: tok, body: { rating: null, comment: null } });
    assert.equal(cleared.body.rating, null);
    assert.equal((await s.api('GET', '/api/airports/OSL')).body.stats.avgRating, null);
  });

  test('loungerecensioner: ändra, radera, paginera', async () => {
    const lo = (await s.api('POST', '/api/airports/GOT/lounges', { token: tok, body: { name: 'Pagineringslounge' } })).body;
    const ids = [];
    for (let i = 0; i < 3; i++) {
      ids.push((await s.api('POST', `/api/lounges/${lo.id}/reviews`, { token: tok, body: { rating: 3, comment: `r${i}`, visitedOn: daysAgo(1) } })).body.id);
    }
    const page = await s.api('GET', `/api/lounges/${lo.id}?limit=2`);
    assert.equal(page.body.reviews.length, 2);
    assert.equal(page.body.reviewCount, 3);
    assert.equal((await s.api('GET', `/api/lounges/${lo.id}?limit=2&offset=2`)).body.reviews.length, 1);
    assert.equal((await s.api('PATCH', `/api/lounge-reviews/${ids[0]}`, { token: other, body: { rating: 1 } })).status, 403);
    const ed = await s.api('PATCH', `/api/lounge-reviews/${ids[0]}`, { token: tok, body: { rating: 5, comment: 'ändrad' } });
    assert.equal(ed.body.rating, 5);
    assert.equal(ed.body.comment, 'ändrad');
    assert.equal((await s.api('GET', `/api/lounges/${lo.id}`)).body.avgRating, 3.67);
    assert.equal((await s.api('DELETE', `/api/lounge-reviews/${ids[1]}`, { token: other })).status, 403);
    assert.equal((await s.api('DELETE', `/api/lounge-reviews/${ids[1]}`, { token: tok })).status, 204);
    const after = await s.api('GET', `/api/lounges/${lo.id}`);
    assert.equal(after.body.reviewCount, 2);
    assert.equal(after.body.avgRating, 4);
    assert.equal((await s.api('GET', '/api/search?q=r1')).body.length, 0);
  });

  test('statistikkort JSON och SVG', async () => {
    await s.api('PATCH', '/api/me', { token: tok, body: { displayName: '<script>x</script>' } });
    const year = Number(daysAgo(1).slice(0, 4));
    const c = await s.api('GET', `/api/users/konto/card?year=${year}`);
    assert.equal(c.status, 200);
    assert.equal(c.body.year, year);
    assert.ok(c.body.checkins >= 4);
    assert.equal(c.body.uniqueAirports, 3);
    assert.equal(c.body.topAirport.airport.iata, 'ARN');
    assert.equal(c.body.topAirport.visits, 2);
    assert.deepEqual(c.body.topCountries.map((x) => x.name).sort(), ['Danmark', 'Norge', 'Sverige']);
    assert.ok(c.body.levelInfo.level >= 1);
    assert.equal((await s.api('GET', '/api/users/konto/card?year=1800')).status, 400);
    const empty = await s.api('GET', '/api/users/konto/card?year=2001');
    assert.equal(empty.body.checkins, 0);
    assert.equal(empty.body.topAirport, null);
    const svg = await fetch(`${s.base}/api/users/konto/card.svg`);
    assert.match(svg.headers.get('content-type'), /^image\/svg\+xml/);
    const text = await svg.text();
    assert.match(text, /^<\?xml/);
    assert.ok(!text.includes('<script>') && text.includes('&lt;script&gt;'));
  });

  test('export och radera konto', async () => {
    const photo = await s.api('POST', '/api/checkins', { token: tok, body: { ...ok, iata: 'BMA' } });
    const f = new FormData();
    f.append('photo', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0])], { type: 'image/png' }), 'a.png');
    assert.equal((await s.api('POST', `/api/checkins/${photo.body.id}/photos`, { token: tok, body: f })).status, 201);
    await s.api('POST', '/api/users/annan/follow', { token: tok });
    await s.api('POST', `/api/checkins/${photo.body.id}/comments`, { token: other, body: { body: 'hej' } });

    const ex = await s.api('GET', '/api/me/export', { token: tok });
    assert.equal(ex.status, 200);
    assert.match(ex.headers.get('content-disposition'), /attachment; filename="gatelog-konto\.json"/);
    assert.equal(ex.body.user.username, 'konto');
    assert.ok(ex.body.checkins.length >= 5);
    assert.ok(ex.body.checkins.some((c) => c.photos.length === 1));
    assert.deepEqual(ex.body.following.map((x) => x.username), ['annan']);
    assert.ok(!JSON.stringify(ex.body).includes('password'));

    const visitorsBefore = (await s.api('GET', '/api/airports/ARN')).body.stats.visitors;
    assert.equal((await s.api('DELETE', '/api/me', { token: tok, body: {} })).status, 400);
    assert.equal((await s.api('DELETE', '/api/me', { token: tok, body: { password: 'fel-losen' } })).status, 401);
    assert.equal(readdirSync(s.uploadDir).length, 1);
    assert.equal((await s.api('DELETE', '/api/me', { token: tok, body: { password: 'hemligt123' } })).status, 204);
    assert.equal(readdirSync(s.uploadDir).length, 0, 'fotofiler raderade');
    assert.equal((await s.api('GET', '/api/me', { token: tok })).status, 401);
    assert.equal((await s.api('GET', '/api/users/konto')).status, 404);
    assert.equal((await s.api('POST', '/api/auth/login', { body: { username: 'konto', password: 'hemligt123' } })).status, 401);
    assert.equal((await s.api('GET', '/api/airports/ARN')).body.stats.visitors, visitorsBefore - 1);
    assert.equal((await s.api('GET', '/api/users/annan')).body.followers, 0);
    assert.ok((await s.api('GET', '/api/lounges?iata=GOT')).body.some((l) => l.name === 'Pagineringslounge'), 'lounger finns kvar');
  });
});

// ---------------------------------------------------------------------------------------------
describe('säkerhet, rate limit, foton, sök', () => {
  let s;
  before(async () => {
    s = await startServer({ writeRateLimits: { checkin: { windowMs: 60_000, max: 3 }, all: { windowMs: 60_000, max: 12 } } });
  });
  after(() => s.close());

  test('rate limit per användare på skrivande anrop', async () => {
    const a = await s.register('spam1');
    const b = await s.register('spam2');
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await s.api('POST', '/api/checkins', { token: a, body: { ...ok, iata: 'GOT' } })).status);
    assert.deepEqual(statuses, [201, 201, 201, 429, 429]);
    const blocked = await s.api('POST', '/api/checkins', { token: a, body: { ...ok, iata: 'GOT' } });
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.equal((await s.api('POST', '/api/checkins', { token: b, body: { ...ok, iata: 'GOT' } })).status, 201, 'annan användare påverkas inte');
    // Generella gränsen (12) gäller alla skrivande anrop för användaren, även gilla
    const all = [];
    for (let i = 0; i < 8; i++) all.push((await s.api('POST', '/api/checkins/1/like', { token: a })).status);
    assert.ok(all.includes(429));
    assert.equal((await s.api('GET', '/api/feed', { token: a })).status, 200, 'läsning begränsas inte');
  });

  test('headers: CSP för självhostade typsnitt, request-id', async () => {
    const r = await fetch(`${s.base}/api/health`, { headers: { 'X-Request-Id': 'test-123' } });
    const csp = r.headers.get('content-security-policy');
    assert.match(csp, /font-src 'self'/);
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.ok(!/fonts\.googleapis/.test(csp));
    assert.equal(r.headers.get('x-request-id'), 'test-123');
    const r2 = await fetch(`${s.base}/api/health`, { headers: { 'X-Request-Id': 'ogiltig id med mellanslag' } });
    assert.match(r2.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  });

  test('attributions', async () => {
    const r = await s.api('GET', '/api/attributions');
    assert.deepEqual(r.body.map((x) => x.name), ['OurAirports', 'OpenFlights', 'Natural Earth / world-atlas']);
    assert.match(r.body[1].license, /ODbL/);
    assert.ok(readFileSync(new URL('../data/ATTRIBUTION.md', import.meta.url), 'utf8').includes('OpenFlights'));
  });

  test('uppladdat foto sparas utan EXIF/GPS', async () => {
    const tok = await s.register('foto');
    const c = (await s.api('POST', '/api/checkins', { token: tok, body: { ...ok, iata: 'GOT' } })).body;
    const exif = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x18]), Buffer.from('Exif\0\0GPSLatitude=57.6\0\0')]);
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8]), exif,
      Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x20]), Buffer.alloc(10),
      Buffer.from([0xff, 0xda, 0x00, 0x04, 0, 0, 9, 9, 0xff, 0xd9]),
    ]);
    const f = new FormData();
    f.append('photo', new Blob([jpeg], { type: 'image/jpeg' }), 'gps.jpg');
    const up = await s.api('POST', `/api/checkins/${c.id}/photos`, { token: tok, body: f });
    assert.equal(up.status, 201);
    assert.equal(up.body.width, 32);
    const stored = await (await fetch(s.base + up.body.url)).arrayBuffer();
    const buf = Buffer.from(stored);
    assert.ok(!buf.includes(Buffer.from('GPSLatitude')) && !buf.includes(Buffer.from('Exif')));
    assert.equal(buf.length, jpeg.length - exif.length);
  });

  test('sök: segment, relevans, flygplatsfilter i indexet', async () => {
    const tok = await s.register('sokare');
    await s.api('POST', '/api/checkins', { token: tok, body: { ...ok, iata: 'CPH', comment: 'Fantastisk smørrebrød <i>och</i> kaffe' } });
    await s.api('POST', '/api/checkins', { token: tok, body: { ...ok, iata: 'ARN', comment: 'Kaffe kaffe kaffe' } });
    const r = await s.api('GET', '/api/search?q=kaffe');
    assert.equal(r.body.length, 2);
    assert.ok(r.body[0].createdAt >= r.body[1].createdAt, 'nyast först som standard');
    const hit = r.body.find((x) => x.airport.iata === 'CPH');
    assert.deepEqual(hit.snippetParts.filter((p) => p.mark).map((p) => p.text), ['kaffe']);
    assert.equal(hit.snippetParts.map((p) => p.text).join(''), 'Fantastisk smørrebrød <i>och</i> kaffe');
    const rel = await s.api('GET', '/api/search?q=kaffe&sort=relevance');
    assert.equal(rel.body[0].airport.iata, 'ARN', 'fler träffar ger högre relevans');
    const cph = await s.api('GET', '/api/search?q=kaffe&iata=cph');
    assert.deepEqual(cph.body.map((x) => x.airport.iata), ['CPH']);
    const paged = await s.api('GET', '/api/search?q=kaffe&limit=1&offset=1');
    assert.equal(paged.body.length, 1);
    assert.equal(paged.body[0].id, r.body[1].id);
    const plain = await s.api('GET', '/api/search?iata=CPH');
    assert.deepEqual(plain.body[0].snippetParts, [{ text: 'Fantastisk smørrebrød <i>och</i> kaffe', mark: false }]);
  });
});

// ---------------------------------------------------------------------------------------------
describe('förberäknad statistik och migrering', () => {
  test('inkrementell statistik är identisk med omräknad', async () => {
    const s = await startServer();
    try {
      seedDemo(s.db);
      const t1 = await s.login('oliver');
      const t2 = await s.login('anna');
      const c = await s.api('POST', '/api/checkins', { token: t1, body: { ...ok, iata: 'LAX', rating: 3, ratings: { food: 2 }, travelClass: 'first', comment: 'x' } });
      await s.api('PATCH', `/api/checkins/${c.body.id}`, { token: t1, body: { rating: 5, ratings: { wifi: 4 }, travelClass: 'economy' } });
      await s.api('POST', `/api/checkins/${c.body.id}/like`, { token: t2 });
      await s.api('POST', `/api/checkins/${c.body.id}/comments`, { token: t2, body: { body: 'hej' } });
      const own = (await s.api('GET', '/api/users/anna/checkins?limit=3')).body;
      await s.api('DELETE', `/api/checkins/${own[0].id}`, { token: t2 });
      await s.api('DELETE', `/api/checkins/${c.body.id}`, { token: t1 });
      await s.api('DELETE', '/api/me', { token: (await s.login('mads')), body: { password: 'demo1234' } });
      const before = snapshot(s.db);
      rebuildStats(s.db);
      assert.deepEqual(snapshot(s.db), before);
    } finally {
      s.close();
    }
  });

  test('uppgradering från schema v1 bygger statistik och sökindex', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gatelog-mig-'));
    try {
      const file = join(dir, 'old.db');
      let db = openDb(file);
      seedDemo(db);
      // Simulera en databas från v1: ta bort allt som migrering 2-3 skapar.
      db.exec(`
        DROP TABLE user_stats; DROP TABLE airport_stats; DROP TABLE user_airports; DROP TABLE user_countries;
        DROP TABLE user_continents; DROP TABLE notifications; DROP TABLE comments; DROP TABLE follows; DROP TABLE user_badges;
        DROP VIEW lounge_reviews_search;
        PRAGMA user_version = 1;`);
      for (const t of db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'stats_%'").all()) db.exec(`DROP TRIGGER ${t.name}`);
      db.close();
      db = openDb(file);
      assert.equal(db.prepare('PRAGMA user_version').get().user_version, SCHEMA_VERSION);
      const oliver = db.prepare("SELECT s.* FROM user_stats s JOIN users u ON u.id = s.user_id WHERE u.username = 'oliver'").get();
      assert.equal(oliver.airports, 10);
      assert.equal(oliver.checkins, 14);
      assert.equal(db.prepare("SELECT checkins FROM airport_stats WHERE iata = 'GOT'").get().checkins, 6);
      assert.ok(db.prepare("SELECT COUNT(*) AS n FROM checkins_fts WHERE checkins_fts MATCH 'comment : lounge'").get().n > 0);
      assert.ok(db.prepare("SELECT COUNT(*) AS n FROM lounge_reviews_fts WHERE lounge_reviews_fts MATCH 'iata : GOT'").get().n > 0);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
