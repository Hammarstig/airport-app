// S2 Auktorisering och åtkomstkontroll (BOLA/IDOR, massilldelning, roller). Se docs/SECURITY-REVIEW.md.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.mjs';

const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=', 'base64');

describe('S2 BOLA/IDOR på objekt med id', () => {
  let s; let a; let b; let ca; let photoId; let commentId; let reviewId; let sessionA;
  before(async () => {
    s = await startServer();
    a = await s.user('owner', { privacy: { publishDelayHours: 0 } });
    b = await s.user('attacker', { privacy: { publishDelayHours: 0 } });
    ca = await s.checkin(a, { comment: 'min resa', visibility: 'public' });
    const fd = new FormData();
    fd.append('photo', new Blob([JPEG], { type: 'image/jpeg' }), 'x.jpg');
    photoId = (await s.api('POST', `/api/checkins/${ca.id}/photos`, { token: a.token, body: fd })).body.id;
    commentId = (await s.api('POST', `/api/checkins/${ca.id}/comments`, { token: a.token, body: { body: 'ägarens kommentar' } })).body.id;
    const lo = await s.api('POST', '/api/airports/GOT/lounges', { token: a.token, body: { name: 'Testlounge' } });
    reviewId = (await s.api('POST', `/api/lounges/${lo.body.id}/reviews`, { token: a.token, body: { rating: 4, visitedOn: '2026-01-01' } })).body.id;
    sessionA = (await s.api('GET', '/api/me/sessions', { token: a.token })).body[0].id;
  });
  after(() => s.close());

  test('annan användare kan inte ändra eller radera check-in, foto, kommentar, recension eller session', async () => {
    const t = b.token;
    const cases = [
      ['PATCH', `/api/checkins/${ca.id}`, { comment: 'kapad' }],
      ['DELETE', `/api/checkins/${ca.id}`],
      ['DELETE', `/api/photos/${photoId}`],
      ['PATCH', `/api/comments/${commentId}`, { body: 'kapad' }],
      ['DELETE', `/api/comments/${commentId}`],
      ['PATCH', `/api/lounge-reviews/${reviewId}`, { rating: 1 }],
      ['DELETE', `/api/lounge-reviews/${reviewId}`],
      ['DELETE', `/api/me/sessions/${sessionA}`],
    ];
    for (const [m, p, body] of cases) {
      const r = await s.api(m, p, { token: t, body });
      assert.ok([403, 404].includes(r.status), `${m} ${p} gav ${r.status}`);
    }
    const fd = new FormData();
    fd.append('photo', new Blob([JPEG], { type: 'image/jpeg' }), 'x.jpg');
    assert.equal((await s.api('POST', `/api/checkins/${ca.id}/photos`, { token: t, body: fd })).status, 403);
    const still = await s.api('GET', `/api/checkins/${ca.id}`, { token: a.token });
    assert.equal(still.body.comment, 'min resa');
    assert.equal(still.body.photos.length, 1);
  });

  test('moderering kräver moderatorroll', async () => {
    assert.equal((await s.api('GET', '/api/moderation/reports', { token: b.token })).status, 403);
    assert.equal((await s.api('GET', '/api/moderation/log', { token: b.token })).status, 403);
    assert.equal((await s.api('POST', '/api/moderation/reports/1', { token: b.token, body: { action: 'remove_content' } })).status, 403);
  });

  test('importer, inbjudningar och notiser är begränsade till ägaren', async () => {
    const imp = await s.api('POST', '/api/me/imports', { token: a.token, body: { csv: 'date,iata\n2020-01-01,CPH\n' } });
    assert.equal(imp.status, 201);
    assert.equal((await s.api('DELETE', `/api/me/imports/${imp.body.id}`, { token: b.token })).status, 404);
    const inv = await s.api('POST', '/api/me/invites', { token: a.token, body: {} });
    assert.equal((await s.api('DELETE', `/api/me/invites/${inv.body.code}`, { token: b.token })).status, 404);
    await s.follow(b, a); // ger a en notis
    const nid = s.db.prepare('SELECT id FROM notifications WHERE user_id = ?').get(a.id).id;
    await s.api('POST', '/api/notifications/read', { token: b.token, body: { ids: [nid] } });
    assert.equal(s.db.prepare('SELECT read FROM notifications WHERE id = ?').get(nid).read, 0);
  });

  test('massilldelning: okända/skyddade fält i PATCH/POST ignoreras', async () => {
    await s.api('PATCH', '/api/me', { token: b.token, body: { username: 'admin', id: a.id, password_hash: 'x', isModerator: true, is_private: 1 } });
    const me = s.db.prepare('SELECT username, is_private, password_hash FROM users WHERE id = ?').get(b.id);
    assert.equal(me.username, b.username);
    assert.notEqual(me.password_hash, 'x');
    const c = await s.api('POST', '/api/checkins', { token: b.token, body: {
      iata: 'ARN', visitedOn: '2026-01-02', kind: 'departure', user_id: a.id, userId: a.id, source: 'import', publish_at: '2000-01-01', publishAt: '2000-01-01', created_at: '2000-01-01',
    } });
    assert.equal(c.status, 201);
    const row = s.db.prepare('SELECT user_id, source, created_at FROM checkins WHERE id = ?').get(c.body.id);
    assert.equal(row.user_id, b.id);
    assert.equal(row.source, 'app');
    assert.notEqual(row.created_at, '2000-01-01');
    await s.api('PATCH', `/api/checkins/${c.body.id}`, { token: b.token, body: { user_id: a.id, iata: 'ARN', source: 'import' } });
    assert.equal(s.db.prepare('SELECT user_id FROM checkins WHERE id = ?').get(c.body.id).user_id, b.id);
  });

  test('prototype pollution via JSON-kropp påverkar inte Object.prototype', async () => {
    const evil = '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted2":true}},"push":{"__proto__":{"x":1}}}';
    await s.api('PATCH', '/api/me/settings', { token: b.token, body: evil, headers: { 'Content-Type': 'application/json' } });
    await s.api('POST', '/api/auth/register', { body: '{"username":"pp_user","password":"Sakert-Flyg-2026!","privacy":{"__proto__":{"polluted3":true}}}', headers: { 'Content-Type': 'application/json' } });
    assert.equal({}.polluted, undefined);
    assert.equal({}.polluted2, undefined);
    assert.equal({}.polluted3, undefined);
  });

  test('SEC-17: avgilla ger inte ut gilla-antal eller existens för en check-in man inte får se', { todo: 'SEC-17' }, async () => {
    const p = await s.checkin(a, { visibility: 'private' });
    const r = await s.api('DELETE', `/api/checkins/${p.id}/like`, { token: b.token });
    assert.equal(r.status, 404, `fick ${r.status} ${JSON.stringify(r.body)}`);
  });

  test('SEC-17: rapport av kommentar på dold check-in avslöjar inte att kommentaren finns', { todo: 'SEC-17' }, async () => {
    const p = await s.checkin(a, { visibility: 'private' });
    const cm = await s.api('POST', `/api/checkins/${p.id}/comments`, { token: a.token, body: { body: 'hemlig kommentar' } });
    const exists = await s.api('POST', '/api/reports', { token: b.token, body: { type: 'comment', target: cm.body.id, reason: 'spam' } });
    const missing = await s.api('POST', '/api/reports', { token: b.token, body: { type: 'comment', target: 99999, reason: 'spam' } });
    assert.equal(exists.status, missing.status, 'olika svar för existerande och saknad kommentar');
  });

  test('SEC-18: en annan användare kan inte ta över en befintlig push-prenumeration', async () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/offrets-enhet-123';
    const keys = { p256dh: 'BOrpKz0aa1aaaaaaaaaaaaaaaaaaaa', auth: 'aaaaaaaaaaaaaaaa' };
    assert.equal((await s.api('POST', '/api/push/subscriptions', { token: a.token, body: { endpoint, keys } })).status, 201);
    await s.api('POST', '/api/push/subscriptions', { token: b.token, body: { endpoint, keys } });
    const owner = s.db.prepare('SELECT user_id FROM push_subscriptions WHERE endpoint = ?').get(endpoint).user_id;
    assert.equal(owner, a.id, 'endpointen bytte ägare till angriparen');
  });
});
