import { Router } from 'express';
import { requireAuth } from '../auth.js';
import {
  h, bad, notFound, HttpError, cleanText, validateHalfStep, validateRatings, validateDate,
  normIata, paging, KINDS, TRAVEL_CLASSES, CHECKIN_SELECT, checkinsWithPhotos,
} from '../util.js';
import { transaction } from '../db.js';
import { computeBadges, earnedIds } from '../badges.js';

export default function checkinRoutes({ db, photos }) {
  const r = Router();
  const airportExists = db.prepare('SELECT 1 FROM airports WHERE iata = ?');
  const airlineExists = db.prepare('SELECT 1 FROM airlines WHERE iata = ?');
  const getCheckin = db.prepare(`${CHECKIN_SELECT} WHERE c.id = ?`);
  const ownerOf = db.prepare('SELECT user_id FROM checkins WHERE id = ?');
  const likeCount = db.prepare('SELECT COUNT(*) AS n FROM likes WHERE checkin_id = ?');
  const loungeById = db.prepare('SELECT id, iata FROM lounges WHERE id = ?');
  const loungeByName = db.prepare('SELECT id FROM lounges WHERE iata = ? AND lower(name) = lower(?)');

  function idParam(raw) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id < 1) throw notFound('Check-in finns inte');
    return id;
  }

  const one = (viewerId, id) => {
    const row = getCheckin.get(viewerId, id);
    return row ? checkinsWithPhotos(db, [row])[0] : null;
  };

  r.post('/checkins', requireAuth, h((req, res) => {
    const b = req.body ?? {};
    const iata = normIata(b.iata);
    if (!/^[A-Z]{3}$/.test(iata) || !airportExists.get(iata)) throw bad('iata är ingen känd IATA-kod');
    const visitedOn = validateDate(b.visitedOn);
    if (!KINDS.includes(b.kind)) throw bad(`kind måste vara en av ${KINDS.join(', ')}`);
    const rating = validateHalfStep(b.rating, { field: 'rating', min: 0.5, max: 5 });
    const rt = validateRatings(b.ratings);
    const comment = cleanText(b.comment, { field: 'comment', max: 1000 });

    // Resedetaljer (v1.2)
    let airline = null;
    if (b.airlineIata !== undefined && b.airlineIata !== null && b.airlineIata !== '') {
      airline = typeof b.airlineIata === 'string' ? b.airlineIata.trim().toUpperCase() : '';
      if (!/^[A-Z0-9]{2}$/.test(airline) || !airlineExists.get(airline)) throw bad('airlineIata är inget känt flygbolag');
    }
    let travelClass = null;
    if (b.travelClass !== undefined && b.travelClass !== null && b.travelClass !== '') {
      if (!TRAVEL_CLASSES.includes(b.travelClass)) throw bad(`travelClass måste vara en av ${TRAVEL_CLASSES.join(', ')}`);
      travelClass = b.travelClass;
    }
    let flightNumber = null;
    if (b.flightNumber !== undefined && b.flightNumber !== null && b.flightNumber !== '') {
      flightNumber = typeof b.flightNumber === 'string' ? b.flightNumber.replace(/\s+/g, '').toUpperCase() : '';
      if (!/^[A-Z0-9]{1,8}$/.test(flightNumber)) throw bad('flightNumber får vara max 8 tecken A-Z och 0-9');
    }
    let loungeId = null;
    let newLounge = null;
    if (b.loungeId !== undefined && b.loungeId !== null) {
      const lo = Number.isInteger(b.loungeId) ? loungeById.get(b.loungeId) : null;
      if (!lo) throw bad('loungeId finns inte');
      if (lo.iata !== iata) throw bad('Loungen ligger inte på den flygplatsen');
      loungeId = lo.id;
    } else if (b.newLounge !== undefined && b.newLounge !== null) {
      if (typeof b.newLounge !== 'object' || Array.isArray(b.newLounge)) throw bad('newLounge måste vara ett objekt');
      newLounge = {
        name: cleanText(b.newLounge.name, { field: 'newLounge.name', max: 80, min: 2, required: true }),
        terminal: cleanText(b.newLounge.terminal, { field: 'newLounge.terminal', max: 40 }),
      };
    }
    const loungeRating = validateHalfStep(b.loungeRating, { field: 'loungeRating', min: 1, max: 5 });
    const loungeComment = cleanText(b.loungeComment, { field: 'loungeComment', max: 1000 });
    if (loungeRating !== null && loungeId === null && !newLounge) throw bad('loungeRating kräver loungeId eller newLounge');

    const before = earnedIds(computeBadges(db, req.user.id));
    const now = new Date().toISOString();
    const id = transaction(db, () => {
      if (newLounge) {
        const existing = loungeByName.get(iata, newLounge.name);
        loungeId = existing ? existing.id : Number(db.prepare(
          'INSERT INTO lounges (iata, name, terminal, created_by, created_at) VALUES (?, ?, ?, ?, ?)',
        ).run(iata, newLounge.name, newLounge.terminal, req.user.id, now).lastInsertRowid);
      }
      const info = db.prepare(`INSERT INTO checkins
        (user_id, iata, visited_on, kind, rating, r_security, r_cleanliness, r_food, r_wifi, r_transfer, r_lounges,
         comment, created_at, airline_iata, travel_class, lounge_id, flight_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        req.user.id, iata, visitedOn, b.kind, rating,
        rt.security, rt.cleanliness, rt.food, rt.wifi, rt.transfer, rt.lounges,
        comment, now, airline, travelClass, loungeId, flightNumber,
      );
      const cid = Number(info.lastInsertRowid);
      if (loungeRating !== null) {
        db.prepare(`INSERT INTO lounge_reviews (lounge_id, user_id, rating, comment, visited_on, created_at, checkin_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)`).run(loungeId, req.user.id, loungeRating, loungeComment ?? comment, visitedOn, now, cid);
      }
      return cid;
    });
    const newBadges = computeBadges(db, req.user.id).filter((x) => x.earnedAt && !before.has(x.id));
    res.status(201).json({ ...one(req.user.id, id), newBadges });
  }));

  r.get('/checkins/:id', h((req, res) => {
    const c = one(req.user?.id ?? -1, idParam(req.params.id));
    if (!c) throw notFound('Check-in finns inte');
    res.json(c);
  }));

  r.delete('/checkins/:id', requireAuth, h((req, res) => {
    const id = idParam(req.params.id);
    const row = ownerOf.get(id);
    if (!row) throw notFound('Check-in finns inte');
    if (row.user_id !== req.user.id) throw new HttpError(403, 'Du kan bara radera dina egna check-ins');
    const files = db.prepare('SELECT filename FROM photos WHERE checkin_id = ?').all(id).map((p) => p.filename);
    db.prepare('DELETE FROM checkins WHERE id = ?').run(id);
    photos?.removeFiles(files);
    res.status(204).end();
  }));

  r.post('/checkins/:id/like', requireAuth, h((req, res) => {
    const id = idParam(req.params.id);
    if (!ownerOf.get(id)) throw notFound('Check-in finns inte');
    db.prepare('INSERT OR IGNORE INTO likes (checkin_id, user_id, created_at) VALUES (?, ?, ?)')
      .run(id, req.user.id, new Date().toISOString());
    res.json({ likes: likeCount.get(id).n, likedByMe: true });
  }));

  r.delete('/checkins/:id/like', requireAuth, h((req, res) => {
    const id = idParam(req.params.id);
    if (!ownerOf.get(id)) throw notFound('Check-in finns inte');
    db.prepare('DELETE FROM likes WHERE checkin_id = ? AND user_id = ?').run(id, req.user.id);
    res.json({ likes: likeCount.get(id).n, likedByMe: false });
  }));

  r.get('/feed', h((req, res) => {
    const { limit, offset } = paging(req.query);
    const scope = req.query.scope === 'mine' ? 'mine' : 'global';
    if (scope === 'mine' && !req.user) throw new HttpError(401, 'Inloggning krävs för scope=mine');
    const iata = normIata(req.query.iata) || null;
    if (iata && !/^[A-Z]{3}$/.test(iata)) throw bad('iata måste vara en IATA-kod med tre bokstäver');
    const mine = scope === 'mine' ? req.user.id : null;
    const rows = db.prepare(`${CHECKIN_SELECT}
      WHERE (? IS NULL OR c.user_id = ?) AND (? IS NULL OR c.iata = ?)
      ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`)
      .all(req.user?.id ?? -1, mine, mine, iata, iata, limit, offset);
    res.json(checkinsWithPhotos(db, rows));
  }));

  return r;
}
