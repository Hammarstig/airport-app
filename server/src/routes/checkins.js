import { Router } from 'express';
import { requireAuth } from '../auth.js';
import {
  h, bad, notFound, HttpError, cleanText, validateHalfStep, validateRatings, validateDate,
  normIata, paging, KINDS, TRAVEL_CLASSES, SUB_RATINGS, CHECKIN_SELECT, checkinsWithPhotos, levelInfo,
} from '../util.js';
import { transaction } from '../db.js';
import { awardBadges, userStreak } from '../badges.js';
import { notify, notifyHomeVisit } from '../notify.js';

/** Validerar resedetaljer som är gemensamma för POST och PATCH. `undefined` = ej skickat. */
function travelDetails(db, b) {
  const out = {};
  if (b.airlineIata !== undefined) {
    if (b.airlineIata === null || b.airlineIata === '') out.airline = null;
    else {
      const v = typeof b.airlineIata === 'string' ? b.airlineIata.trim().toUpperCase() : '';
      if (!/^[A-Z0-9]{2}$/.test(v) || !db.prepare('SELECT 1 FROM airlines WHERE iata = ?').get(v)) {
        throw bad('airlineIata är inget känt flygbolag');
      }
      out.airline = v;
    }
  }
  if (b.travelClass !== undefined) {
    if (b.travelClass === null || b.travelClass === '') out.travelClass = null;
    else if (!TRAVEL_CLASSES.includes(b.travelClass)) throw bad(`travelClass måste vara en av ${TRAVEL_CLASSES.join(', ')}`);
    else out.travelClass = b.travelClass;
  }
  if (b.flightNumber !== undefined) {
    if (b.flightNumber === null || b.flightNumber === '') out.flightNumber = null;
    else {
      const v = typeof b.flightNumber === 'string' ? b.flightNumber.replace(/\s+/g, '').toUpperCase() : '';
      if (!/^[A-Z0-9]{1,8}$/.test(v)) throw bad('flightNumber får vara max 8 tecken A-Z och 0-9');
      out.flightNumber = v;
    }
  }
  return out;
}

export default function checkinRoutes({ db, photos, limiters }) {
  const r = Router();
  const airportRow = db.prepare('SELECT iata, country, continent FROM airports WHERE iata = ?');
  const getCheckin = db.prepare(`${CHECKIN_SELECT} WHERE c.id = ?`);
  const checkinRow = db.prepare('SELECT * FROM checkins WHERE id = ?');
  const likeCount = db.prepare('SELECT COUNT(*) AS n FROM likes WHERE checkin_id = ?');
  const loungeById = db.prepare('SELECT id, iata FROM lounges WHERE id = ?');
  const loungeByName = db.prepare('SELECT id FROM lounges WHERE iata = ? AND lower(name) = lower(?)');
  const xpOf = db.prepare('SELECT xp FROM user_stats WHERE user_id = ?');
  const scheduledTotal = db.prepare('SELECT COUNT(*) AS n FROM airports WHERE scheduled = 1').get().n || 1;

  function idParam(raw) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id < 1) throw notFound('Check-in finns inte');
    return id;
  }

  const one = (viewerId, id) => {
    const row = getCheckin.get(viewerId, id);
    return row ? checkinsWithPhotos(db, [row])[0] : null;
  };

  function loungeFor(iata, loungeId) {
    if (loungeId === null) return null;
    const lo = Number.isInteger(loungeId) ? loungeById.get(loungeId) : null;
    if (!lo) throw bad('loungeId finns inte');
    if (lo.iata !== iata) throw bad('Loungen ligger inte på den flygplatsen');
    return lo.id;
  }

  r.post('/checkins', requireAuth, limiters.checkin, h((req, res) => {
    const b = req.body ?? {};
    const iata = normIata(b.iata);
    const airport = /^[A-Z]{3}$/.test(iata) ? airportRow.get(iata) : null;
    if (!airport) throw bad('iata är ingen känd IATA-kod');
    const visitedOn = validateDate(b.visitedOn);
    if (!KINDS.includes(b.kind)) throw bad(`kind måste vara en av ${KINDS.join(', ')}`);
    const rating = validateHalfStep(b.rating, { field: 'rating', min: 0.5, max: 5 });
    const rt = validateRatings(b.ratings);
    const comment = cleanText(b.comment, { field: 'comment', max: 1000 });
    const td = travelDetails(db, b);

    let loungeId = null;
    let newLounge = null;
    if (b.loungeId !== undefined && b.loungeId !== null) {
      loungeId = loungeFor(iata, b.loungeId);
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

    const uid = req.user.id;
    const xpBefore = xpOf.get(uid)?.xp ?? 0;
    const now = new Date().toISOString();
    const { id, newBadges, milestones } = transaction(db, () => {
      if (newLounge) {
        const existing = loungeByName.get(iata, newLounge.name);
        loungeId = existing ? existing.id : Number(db.prepare(
          'INSERT INTO lounges (iata, name, terminal, created_by, created_at) VALUES (?, ?, ?, ?, ?)',
        ).run(iata, newLounge.name, newLounge.terminal, uid, now).lastInsertRowid);
      }
      const cid = Number(db.prepare(`INSERT INTO checkins
        (user_id, iata, visited_on, kind, rating, r_security, r_cleanliness, r_food, r_wifi, r_transfer, r_lounges,
         comment, created_at, airline_iata, travel_class, lounge_id, flight_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        uid, iata, visitedOn, b.kind, rating,
        rt.security, rt.cleanliness, rt.food, rt.wifi, rt.transfer, rt.lounges,
        comment, now, td.airline ?? null, td.travelClass ?? null, loungeId, td.flightNumber ?? null,
      ).lastInsertRowid);
      if (loungeRating !== null) {
        db.prepare(`INSERT INTO lounge_reviews (lounge_id, user_id, rating, comment, visited_on, created_at, checkin_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)`).run(loungeId, uid, loungeRating, loungeComment ?? comment, visitedOn, now, cid);
      }
      notifyHomeVisit(db, { actorId: uid, checkinId: cid, iata });

      const m = db.prepare(`SELECT
          (SELECT visits FROM user_airports WHERE user_id = ? AND iata = ?) AS visits,
          (SELECT airports FROM user_countries WHERE user_id = ? AND country = ?) AS country_airports,
          (SELECT airports FROM user_continents WHERE user_id = ? AND continent = ?) AS continent_airports,
          (SELECT COUNT(*) FROM user_airports ua JOIN airports a ON a.iata = ua.iata WHERE ua.user_id = ? AND a.scheduled = 1) AS scheduled,
          s.airports, s.countries, s.continents
        FROM user_stats s WHERE s.user_id = ?`)
        .get(uid, iata, uid, airport.country, uid, airport.continent, uid, uid);
      const isNewAirport = m.visits === 1;
      return {
        id: cid,
        newBadges: awardBadges(db, uid),
        milestones: {
          isNewAirport,
          isNewCountry: isNewAirport && m.country_airports === 1,
          isNewContinent: isNewAirport && m.continent_airports === 1,
          uniqueAirports: m.airports,
          countries: m.countries,
          continents: m.continents,
          worldPct: Math.round((m.scheduled / scheduledTotal) * 1000) / 10,
          streak: userStreak(db, uid),
        },
      };
    });
    const xpAfter = xpOf.get(uid)?.xp ?? 0;
    const li = levelInfo(xpAfter);
    res.status(201).json({
      ...one(uid, id),
      newBadges,
      xpGained: xpAfter - xpBefore,
      levelInfo: li,
      levelUp: li.level > levelInfo(xpBefore).level,
      milestones,
    });
  }));

  r.get('/checkins/:id', h((req, res) => {
    const c = one(req.user?.id ?? -1, idParam(req.params.id));
    if (!c) throw notFound('Check-in finns inte');
    res.json(c);
  }));

  // Redigera check-in (ägare). Bara skickade fält ändras; iata kan inte ändras.
  r.patch('/checkins/:id', requireAuth, h((req, res) => {
    const id = idParam(req.params.id);
    const cur = checkinRow.get(id);
    if (!cur) throw notFound('Check-in finns inte');
    if (cur.user_id !== req.user.id) throw new HttpError(403, 'Du kan bara ändra dina egna check-ins');
    const b = req.body ?? {};
    if (b.iata !== undefined && normIata(b.iata) !== cur.iata) throw bad('iata kan inte ändras, radera och checka in igen');
    for (const k of ['newLounge', 'loungeRating', 'loungeComment']) {
      if (b[k] !== undefined) throw bad(`${k} kan inte användas vid redigering`);
    }
    const set = {};
    if (b.visitedOn !== undefined) set.visited_on = validateDate(b.visitedOn);
    if (b.kind !== undefined) {
      if (!KINDS.includes(b.kind)) throw bad(`kind måste vara en av ${KINDS.join(', ')}`);
      set.kind = b.kind;
    }
    if (b.rating !== undefined) set.rating = validateHalfStep(b.rating, { field: 'rating', min: 0.5, max: 5 });
    if (b.ratings !== undefined) {
      const rt = validateRatings(b.ratings);
      for (const k of SUB_RATINGS) set['r_' + k] = rt[k];
    }
    if (b.comment !== undefined) set.comment = cleanText(b.comment, { field: 'comment', max: 1000 });
    const td = travelDetails(db, b);
    if ('airline' in td) set.airline_iata = td.airline;
    if ('travelClass' in td) set.travel_class = td.travelClass;
    if ('flightNumber' in td) set.flight_number = td.flightNumber;
    if (b.loungeId !== undefined) set.lounge_id = loungeFor(cur.iata, b.loungeId);
    const cols = Object.keys(set);
    if (cols.length) {
      transaction(db, () => {
        db.prepare(`UPDATE checkins SET ${cols.map((c) => `${c} = ?`).join(', ')}, edited_at = ? WHERE id = ?`)
          .run(...cols.map((c) => set[c]), new Date().toISOString(), id);
        awardBadges(db, req.user.id);
      });
    }
    res.json(one(req.user.id, id));
  }));

  r.delete('/checkins/:id', requireAuth, h((req, res) => {
    const id = idParam(req.params.id);
    const row = checkinRow.get(id);
    if (!row) throw notFound('Check-in finns inte');
    if (row.user_id !== req.user.id) throw new HttpError(403, 'Du kan bara radera dina egna check-ins');
    const files = db.prepare('SELECT filename FROM photos WHERE checkin_id = ?').all(id).map((p) => p.filename);
    db.prepare('DELETE FROM checkins WHERE id = ?').run(id);
    photos?.removeFiles(files);
    res.status(204).end();
  }));

  r.post('/checkins/:id/like', requireAuth, limiters.like, h((req, res) => {
    const id = idParam(req.params.id);
    const row = checkinRow.get(id);
    if (!row) throw notFound('Check-in finns inte');
    transaction(db, () => {
      const info = db.prepare('INSERT OR IGNORE INTO likes (checkin_id, user_id, created_at) VALUES (?, ?, ?)')
        .run(id, req.user.id, new Date().toISOString());
      if (info.changes && row.user_id !== req.user.id) {
        notify(db, { userId: row.user_id, type: 'like', actorId: req.user.id, checkinId: id });
        awardBadges(db, row.user_id);
      }
    });
    res.json({ likes: likeCount.get(id).n, likedByMe: true });
  }));

  r.delete('/checkins/:id/like', requireAuth, h((req, res) => {
    const id = idParam(req.params.id);
    if (!checkinRow.get(id)) throw notFound('Check-in finns inte');
    db.prepare('DELETE FROM likes WHERE checkin_id = ? AND user_id = ?').run(id, req.user.id);
    res.json({ likes: likeCount.get(id).n, likedByMe: false });
  }));

  r.get('/feed', h((req, res) => {
    const { limit, offset } = paging(req.query);
    const scope = ['mine', 'friends'].includes(req.query.scope) ? req.query.scope : 'global';
    if (scope !== 'global' && !req.user) throw new HttpError(401, `Inloggning krävs för scope=${scope}`);
    const iata = normIata(req.query.iata) || null;
    if (iata && !/^[A-Z]{3}$/.test(iata)) throw bad('iata måste vara en IATA-kod med tre bokstäver');
    const where = ['(? IS NULL OR c.iata = ?)'];
    const params = [iata, iata];
    if (scope === 'mine') {
      where.push('c.user_id = ?');
      params.push(req.user.id);
    } else if (scope === 'friends') {
      where.push('(c.user_id = ? OR c.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?))');
      params.push(req.user.id, req.user.id);
    }
    const rows = db.prepare(`${CHECKIN_SELECT} WHERE ${where.join(' AND ')}
      ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`)
      .all(req.user?.id ?? -1, ...params, limit, offset);
    res.json(checkinsWithPhotos(db, rows));
  }));

  return r;
}
