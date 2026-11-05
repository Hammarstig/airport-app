// Konto: senaste flygplatser (snabb check-in), radera konto, dataexport. Plus attributions.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../auth.js';
import { h, bad, HttpError, paging, AIRPORT_COLS, airportFrom, userSummary } from '../util.js';
import { transaction } from '../db.js';

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
    if (!(await bcrypt.compare(password, u.password_hash))) throw new HttpError(401, 'Fel lösenord');
    const files = db.prepare('SELECT filename FROM photos WHERE user_id = ?').all(req.user.id).map((p) => p.filename);
    transaction(db, () => {
      db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
    });
    photos.removeFiles(files);
    res.status(204).end();
  }));

  r.get('/me/export', requireAuth, h((req, res) => {
    const uid = req.user.id;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
    const out = {
      exportedAt: new Date().toISOString(),
      user: { ...userSummary(db, user), createdAt: user.created_at },
      checkins: db.prepare(`SELECT c.*, (SELECT json_group_array(filename) FROM photos p WHERE p.checkin_id = c.id) AS photos
        FROM checkins c WHERE c.user_id = ? ORDER BY c.visited_on, c.id`).all(uid)
        .map((c) => ({ ...c, photos: JSON.parse(c.photos).map((f) => '/uploads/' + f) })),
      loungeReviews: db.prepare(`SELECT r.*, lo.name AS lounge_name, lo.iata FROM lounge_reviews r
        JOIN lounges lo ON lo.id = r.lounge_id WHERE r.user_id = ? ORDER BY r.id`).all(uid),
      comments: db.prepare('SELECT * FROM comments WHERE user_id = ? ORDER BY id').all(uid),
      wishlist: db.prepare('SELECT iata, added_at FROM wishlist WHERE user_id = ? ORDER BY added_at').all(uid),
      following: db.prepare(`SELECT u.username, f.created_at FROM follows f JOIN users u ON u.id = f.followee_id
        WHERE f.follower_id = ?`).all(uid),
      followers: db.prepare(`SELECT u.username, f.created_at FROM follows f JOIN users u ON u.id = f.follower_id
        WHERE f.followee_id = ?`).all(uid),
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
