// Konto: senaste flygplatser (snabb check-in), radera konto, dataexport. Plus attributions.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../auth.js';
import { h, bad, HttpError, paging, AIRPORT_COLS, airportFrom, userSummary, photoUrl } from '../util.js';
import { transaction } from '../db/index.js';
import { secEvent } from '../seclog.js';
import { settingsOf } from './auth.js';
import { getBadges, userLevel } from '../badges.js';

export const ATTRIBUTIONS = [
  {
    name: 'OurAirports',
    url: 'https://ourairports.com/data/',
    license: 'Public Domain',
    licenseUrl: 'https://ourairports.com/about.html#credits',
    usage: 'Flygplatser, koordinater, typ och regioner',
  },
  {
    name: 'OpenFlights',
    url: 'https://openflights.org/data.php',
    license: 'Open Database License (ODbL) 1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    usage: 'Flygbolag (IATA/ICAO-koder och namn)',
  },
  {
    name: 'Natural Earth / world-atlas',
    url: 'https://www.naturalearthdata.com/',
    license: 'Public Domain (world-atlas: ISC)',
    licenseUrl: 'https://github.com/topojson/world-atlas/blob/master/LICENSE.md',
    usage: 'Landsgränser på kartor',
  },
];

export default function accountRoutes({ db, photos }) {
  const r = Router();

  r.get('/attributions', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=86400');
    res.json(ATTRIBUTIONS);
  });

  r.get('/me/recent-airports', requireAuth, h((req, res) => {
    const { limit } = paging(req.query, { defLimit: 6, maxLimit: 20 });
    const home = db.prepare('SELECT home_iata FROM users WHERE id = ?').get(req.user.id).home_iata;
    const rows = db.prepare(`
      SELECT ${AIRPORT_COLS('a', '')}, IFNULL(ua.visits, 0) AS visits, ua.last_visit,
        (SELECT MAX(c.created_at) FROM checkins c WHERE c.user_id = ? AND c.iata = a.iata) AS last_created
      FROM airports a LEFT JOIN user_airports ua ON ua.user_id = ? AND ua.iata = a.iata
      WHERE a.iata = ? OR a.iata IN (SELECT iata FROM user_airports WHERE user_id = ?)
      ORDER BY a.iata = ? DESC, last_created DESC
      LIMIT ?`).all(req.user.id, req.user.id, home, req.user.id, home, limit);
    res.json(rows.map((row) => ({
      airport: airportFrom(row),
      lastVisit: row.last_visit ?? null,
      visits: row.visits,
      isHome: row.iata === home,
    })));
  }));

  r.delete('/me', requireAuth, h(async (req, res) => {
    const password = req.body?.password;
    if (typeof password !== 'string' || !password) throw bad('password krävs för att radera kontot');
    const u = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    // 403 (inte 401): fel lösenord ska inte tolkas som utgången session av klienten.
    if (!(await bcrypt.compare(password, u.password_hash))) throw new HttpError(403, 'Fel lösenord');
    const files = db.prepare('SELECT filename FROM photos WHERE user_id = ?').all(req.user.id).map((p) => p.filename);
    transaction(db, () => {
      // Användarnamnet får inte tas av någon annan direkt (imitation, SEC-03).
      const name = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id).username;
      db.prepare('INSERT OR REPLACE INTO retired_usernames (username, until) VALUES (?, ?)')
        .run(name, new Date(Date.now() + 90 * 86400_000).toISOString());
      // Pseudonymisering (SEC-27): rapporter om användaren eller hens innehåll förlorar fritexten,
      // och innehållskopior i modereringsloggen tas bort.
      const uid = req.user.id;
      db.prepare(`UPDATE reports SET note = NULL WHERE (type = 'user' AND target_id = ?)
        OR (type = 'comment' AND target_id IN (SELECT id FROM comments WHERE user_id = ?))
        OR (type = 'checkin' AND target_id IN (SELECT id FROM checkins WHERE user_id = ?))`).run(uid, uid, uid);
      db.prepare(`UPDATE moderation_log SET detail = NULL WHERE (target_type = 'user' AND target_id = ?)
        OR detail LIKE ? OR detail LIKE ?`).run(uid, `%"author":"${name}"%`, `%"username":"${name}"%`);
      db.prepare('DELETE FROM users WHERE id = ?').run(uid);
    });
    // Raderade sidor skrivs över (secure_delete) och WAL töms så att data inte ligger kvar i filen.
    try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* minnesdatabas */ }
    photos.removeFiles(files);
    secEvent(req, 'account_delete');
    res.status(204).end();
  }));

  r.get('/me/export', requireAuth, h((req, res) => {
    const uid = req.user.id;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
    const out = {
      exportedAt: new Date().toISOString(),
      user: { ...userSummary(db, user, { self: true }), createdAt: user.created_at },
      checkins: db.prepare(`SELECT c.*, (SELECT json_group_array(filename) FROM photos p WHERE p.checkin_id = c.id) AS photos
        FROM checkins c WHERE c.user_id = ? ORDER BY c.visited_on, c.id`).all(uid)
        .map((c) => ({ ...c, photos: JSON.parse(c.photos).map((f) => photoUrl(f)) })),
      loungeReviews: db.prepare(`SELECT r.*, lo.name AS lounge_name, lo.iata FROM lounge_reviews r
        JOIN lounges lo ON lo.id = r.lounge_id WHERE r.user_id = ? ORDER BY r.id`).all(uid),
      comments: db.prepare('SELECT * FROM comments WHERE user_id = ? ORDER BY id').all(uid),
      wishlist: db.prepare('SELECT iata, added_at FROM wishlist WHERE user_id = ? ORDER BY added_at').all(uid),
      following: db.prepare(`SELECT u.username, f.status, f.created_at FROM follows f JOIN users u ON u.id = f.followee_id
        WHERE f.follower_id = ?`).all(uid),
      followers: db.prepare(`SELECT u.username, f.status, f.created_at FROM follows f JOIN users u ON u.id = f.follower_id
        WHERE f.followee_id = ?`).all(uid),
      // Fullständig export (SEC-19): allt som lagras med användarens id, i ägarvyn.
      settings: settingsOf(user),
      stats: db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(uid) ?? null,
      level: userLevel(db, uid),
      badges: getBadges(db, uid).filter((b) => b.tierLevel > 0)
        .map((b) => ({ id: b.id, tier: b.tier, tierLevel: b.tierLevel, earnedAt: b.earnedAt })),
      challenges: db.prepare('SELECT challenge_id, month, completed_at FROM user_challenges WHERE user_id = ? ORDER BY month').all(uid),
      mayorships: db.prepare('SELECT iata, checkins, since FROM airport_mayors WHERE user_id = ?').all(uid),
      likes: db.prepare('SELECT checkin_id, created_at FROM likes WHERE user_id = ? ORDER BY created_at').all(uid),
      notifications: db.prepare(`SELECT n.id, n.type, u.username AS actor, n.checkin_id, n.comment_id, n.iata, n.badge_id,
        n.badge_tier, n.data, n.read, n.created_at FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
        WHERE n.user_id = ? ORDER BY n.id`).all(uid),
      sessions: db.prepare(`SELECT id, client, created_at, last_used_at, expires_at, revoked_at FROM sessions
        WHERE user_id = ? ORDER BY created_at`).all(uid),
      blocks: db.prepare(`SELECT u.username, b.created_at FROM blocks b JOIN users u ON u.id = b.blocked_id
        WHERE b.blocker_id = ?`).all(uid),
      reports: db.prepare(`SELECT id, type, target_id, reason, note, status, created_at, resolved_at FROM reports
        WHERE reporter_id = ? ORDER BY id`).all(uid),
      pushSubscriptions: db.prepare('SELECT endpoint, created_at, failures FROM push_subscriptions WHERE user_id = ?').all(uid),
      invites: db.prepare('SELECT code, uses, max_uses, created_at, expires_at, revoked_at FROM invites WHERE user_id = ?').all(uid),
      imports: db.prepare('SELECT id, format, rows, imported, created_at FROM import_batches WHERE user_id = ?').all(uid),
      photos: db.prepare('SELECT id, checkin_id, filename, created_at FROM photos WHERE user_id = ? ORDER BY id').all(uid)
        .map((p) => ({ ...p, url: photoUrl(p.filename) })),
      moderationActions: user.role === 'moderator'
        ? db.prepare('SELECT report_id, action, target_type, target_id, created_at FROM moderation_log WHERE moderator_id = ?').all(uid)
        : [],
    };
    delete out.user.password_hash;
    res.set({
      'Content-Disposition': `attachment; filename="gatelog-${user.username}.json"`,
      'Cache-Control': 'no-store',
    });
    res.json(out);
  }));

  return r;
}
