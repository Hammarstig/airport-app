// S3 Integritet och dataläckage: privat/vänner-check-in, fördröjd publicering, privat profil,
// dold hemmaflygplats och blockering, testat via alla vägar. Se docs/SECURITY-REVIEW.md.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, daysAgo } from './helpers.mjs';

const ids = (list) => list.map((x) => x.user?.username ?? x.username);

describe('S3 skyddade vägar (ska hålla)', () => {
  let s; let owner; let stranger; let follower; let hidden;
  before(async () => {
    s = await startServer();
    // Publik profil men privat check-in, vänner-check-in och fördröjd check-in (förval 1 h i produktion).
    owner = await s.user('own', { homeIata: 'GOT', privacy: { publishDelayHours: 0 } });
    const late = await s.user('late'); // förval 1 h fördröjning
    stranger = await s.user('str');
    follower = await s.user('fol');
    await s.follow(follower, owner);
    await s.follow(follower, late);
    hidden = {
      priv: await s.checkin(owner, { iata: 'BGO', visibility: 'private', comment: 'hemligtord privat' }),
      friends: await s.checkin(owner, { iata: 'TRD', visibility: 'friends', comment: 'hemligtord vanner' }),
      delayed: await s.checkin(late, { iata: 'SVG', visibility: 'public', comment: 'hemligtord fordrojd' }),
    };
  });
  after(() => s.close());

  test('direktläsning, kommentarer, flöde, sök, profil-listor, karta och flygplatssida döljer check-ins', async () => {
    for (const [k, c] of Object.entries(hidden)) {
      assert.equal((await s.api('GET', `/api/checkins/${c.id}`, { token: stranger.token })).status, 404, k);
      assert.equal((await s.api('GET', `/api/checkins/${c.id}/comments`)).status, 404, k);
      assert.equal((await s.api('GET', `/api/checkins/${c.id}/card.svg`)).status, 404, k);
    }
    const feed = await s.api('GET', '/api/feed', { token: stranger.token });
    assert.ok(!feed.body.some((c) => Object.values(hidden).some((h) => h.id === c.id)));
    const search = await s.api('GET', '/api/search?q=hemligtord', { token: stranger.token });
    assert.equal(search.body.length, 0);
    const list = await s.api('GET', `/api/users/${owner.username}/checkins`);
    assert.equal(list.body.length, 0);
    const airports = await s.api('GET', `/api/users/${owner.username}/airports`);
    assert.equal(airports.body.length, 0);
    const map = await s.api('GET', `/api/users/${owner.username}/map/NO`);
    assert.ok(map.body.airports.every((a) => !a.visited));
    const ap = await s.api('GET', '/api/airports/BGO/checkins');
    assert.equal(ap.body.length, 0);
    const og = await s.api('GET', `/c/${hidden.priv.id}`);
    assert.doesNotMatch(String(og.text), /hemligtord/);
  });

  test('vänner-check-in syns för godkänd följare men inte privat eller fördröjd', async () => {
    assert.equal((await s.api('GET', `/api/checkins/${hidden.friends.id}`, { token: follower.token })).status, 200);
    assert.equal((await s.api('GET', `/api/checkins/${hidden.priv.id}`, { token: follower.token })).status, 404);
    assert.equal((await s.api('GET', `/api/checkins/${hidden.delayed.id}`, { token: follower.token })).status, 404);
  });

  test('dold hemmaflygplats syns inte i profil, sök, topplista eller följarlistor (förval i produktion)', async () => {
    const paths = [`/api/users/${owner.username}`, `/api/users?q=${owner.username}`, `/api/users/${follower.username}/following`];
    for (const p of paths) {
      const r = await s.api('GET', p, { token: stranger.token });
      assert.doesNotMatch(r.text, /"homeIata":"GOT"/, p);
    }
  });

  test('privat profil: listor ger 403 och topplistor döljer användaren', async () => {
    const p = await s.user('prv', { privacy: { isPrivate: true, publishDelayHours: 0 } });
    await s.checkin(p, { iata: 'ARN', visitedOn: daysAgo(0) });
    for (const sub of ['checkins', 'airports', 'map', 'badges', 'wishlist', 'followers', 'card', 'card.svg', 'mayorships', 'challenges', `year/${new Date().getFullYear()}`]) {
      assert.equal((await s.api('GET', `/api/users/${p.username}/${sub}`, { token: stranger.token })).status, 403, sub);
    }
    const lb = await s.api('GET', '/api/rankings/users?metric=checkins&period=week', { token: stranger.token });
    assert.ok(!ids(lb.body.items).includes(p.username));
  });

  test('blockering döljer åt båda håll och stoppar notiser', async () => {
    const x = await s.user('blk', { privacy: { publishDelayHours: 0 } });
    const c = await s.checkin(x, { visibility: 'public' });
    await s.api('POST', `/api/users/${stranger.username}/block`, { token: x.token });
    assert.equal((await s.api('GET', `/api/checkins/${c.id}`, { token: stranger.token })).status, 404);
    assert.equal((await s.api('GET', `/api/users/${x.username}/checkins`, { token: stranger.token })).status, 403);
    assert.equal((await s.api('POST', `/api/checkins/${c.id}/like`, { token: stranger.token })).status, 404);
    assert.equal((await s.api('POST', `/api/users/${x.username}/follow`, { token: stranger.token })).status, 403);
  });
});

describe('S3 sidokanaler som läcker dolda resor (öppna fynd)', () => {
  let s; let victim; let attacker;
  before(async () => {
    s = await startServer();
    // Publik profil som checkar in PRIVAT i Danmark idag (fördröjning 1 h är förval i produktion).
    victim = await s.user('vic');
    attacker = await s.user('att', { privacy: { publishDelayHours: 0 } });
  });
  after(() => s.close());

  test('SEC-01: topplista per land och vecka visar inte privata/fördröjda check-ins (realtidsposition)', { todo: 'SEC-01' }, async () => {
    await s.checkin(victim, { iata: 'CPH', visitedOn: daysAgo(0), visibility: 'private' });
    const r = await s.api('GET', '/api/rankings/users?scope=country&country=DK&period=week&metric=checkins');
    assert.equal(r.status, 200);
    assert.ok(!ids(r.body.items).includes(victim.username), `anonym ser ${victim.username} i Danmark denna vecka: ${JSON.stringify(r.body.items)}`);
  });

  test('SEC-02: vänförslag avslöjar inte vilka som besökt en flygplats via dolda check-ins', { todo: 'SEC-02' }, async () => {
    const p = await s.user('prv2', { privacy: { isPrivate: true, defaultVisibility: 'private', publishDelayHours: 168 } });
    await s.checkin(p, { iata: 'KRN', visitedOn: daysAgo(0) });
    await s.checkin(attacker, { iata: 'KRN', visitedOn: daysAgo(3), visibility: 'private' });
    const r = await s.api('GET', '/api/me/suggestions', { token: attacker.token });
    const hit = r.body.find((x) => x.username === p.username);
    assert.ok(!hit || hit.sharedAirports === 0, `privat profil med privat check-in föreslås: ${JSON.stringify(hit)}`);
  });

  test('SEC-04: profilstatistik, XP och nivå räknar inte dolda/fördröjda check-ins för andra', { todo: 'SEC-04' }, async () => {
    const before = (await s.api('GET', `/api/users/${victim.username}`)).body;
    await s.checkin(victim, { iata: 'ARN', visitedOn: daysAgo(0), visibility: 'private' });
    const afterP = (await s.api('GET', `/api/users/${victim.username}`)).body;
    assert.equal(afterP.stats.totalCheckins, before.stats.totalCheckins, 'totalCheckins ökade direkt för anonym');
    assert.equal(afterP.levelInfo.xp, before.levelInfo.xp, 'XP ökade direkt för anonym');
  });

  test('SEC-04: privat profil visar inte XP/nivå och användarsök visar inte antal flygplatser', { todo: 'SEC-04' }, async () => {
    const p = await s.user('prv3', { privacy: { isPrivate: true } });
    await s.checkin(p, { iata: 'OSL' });
    const prof = (await s.api('GET', `/api/users/${p.username}`)).body;
    assert.equal(prof.canView, false);
    assert.equal(prof.levelInfo?.xp ?? 0, 0, `XP synlig för privat profil: ${JSON.stringify(prof.levelInfo)}`);
    const found = (await s.api('GET', `/api/users?q=${p.username}`)).body[0];
    assert.equal(found.uniqueAirports ?? 0, 0, 'uniqueAirports synligt för privat profil');
  });

  test('SEC-05: statistikkort som beror på tittaren cachas inte publikt', { todo: 'SEC-05' }, async () => {
    for (const p of [`/api/users/${victim.username}/card`, `/api/users/${victim.username}/card.svg`]) {
      const r = await s.api('GET', p, { token: attacker.token });
      assert.doesNotMatch(r.headers.get('cache-control') ?? '', /public/, `${p}: ${r.headers.get('cache-control')}`);
    }
  });

  test('SEC-19: export innehåller alla personuppgifter (art. 15/20), inkl. dold hemmaflygplats', { todo: 'SEC-19' }, async () => {
    const u = await s.user('exp', { homeIata: 'GOT' });
    const r = await s.api('GET', '/api/me/export', { token: u.token });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.homeIata, 'GOT', 'egen hemmaflygplats saknas i exporten');
    for (const k of ['settings', 'sessions', 'notifications', 'likes', 'blocks', 'reports', 'pushSubscriptions', 'invites', 'imports', 'badges']) {
      assert.ok(k in r.body, `exporten saknar ${k}`);
    }
  });

  test('push-payload för gilla innehåller bara namn och flygplats, ingen kommentar', async () => {
    const p = await s.user('pay', { privacy: { publishDelayHours: 0 } });
    await s.api('POST', '/api/push/subscriptions', { token: p.token, body: { endpoint: 'https://fcm.googleapis.com/fcm/send/p1', keys: { p256dh: 'BOrpKz0aa1aaaaaaaaaaa', auth: 'aaaaaaaaaaaa' } } });
    const c = await s.checkin(p, { comment: 'hemlig kommentar i check-in' });
    await s.api('POST', `/api/checkins/${c.id}/like`, { token: attacker.token });
    await s.push.flush();
    const sent = s.pushed.filter((x) => x.endpoint.endsWith('/p1') && x.payload.type === 'like');
    assert.equal(sent.length, 1);
    assert.doesNotMatch(JSON.stringify(sent[0].payload), /hemlig kommentar/);
  });
});
