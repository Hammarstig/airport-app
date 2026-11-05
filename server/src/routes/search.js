import { Router } from 'express';
import { h, bad, paging, TRAVEL_CLASSES, normIata, escapeHtml, USER_COLS, AIRPORT_COLS, userFrom, airportFrom } from '../util.js';

// Markörer som FTS5 sätter runt träffar. Kontrolltecken rensas bort ur all inmatad text,
// så de kan aldrig förekomma i en kommentar.
const OPEN = '\u0001';
const CLOSE = '\u0002';
const ELLIPSIS = '…';

/**
 * Gör en säker FTS5-fråga av fri text: endast bokstäver/siffror behålls, varje ord citeras och
 * prefixmatchas ("ord"*), orden kombineras med AND. Returnerar null om inget sökbart finns.
 */
export function toFtsQuery(raw) {
  if (typeof raw !== 'string') return null;
  const tokens = raw
    .normalize('NFC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 10)
    .map((t) => t.slice(0, 50));
  if (!tokens.length) return null;
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' ');
}

/** HTML-escapar och byter FTS-markörerna mot <mark>. */
export function renderSnippet(s) {
  return escapeHtml(s).split(OPEN).join('<mark>').split(CLOSE).join('</mark>');
}

function plainSnippet(comment, max = 160) {
  if (!comment) return '';
  const s = comment.length > max ? comment.slice(0, max).trimEnd() + ELLIPSIS : comment;
  return escapeHtml(s);
}

export default function searchRoutes({ db }) {
  const r = Router();

  r.get('/search', h((req, res) => {
    const q = toFtsQuery(req.query.q);
    const iataRaw = normIata(req.query.iata);
    const iata = iataRaw || null;
    if (iata && !/^[A-Z]{3}$/.test(iata)) throw bad('iata måste vara en IATA-kod med tre bokstäver');
    if (!q && !iata) {
      throw bad(typeof req.query.q === 'string' && req.query.q.trim()
        ? 'Söktexten innehåller inga sökbara ord'
        : 'Ange q (söktext) eller iata');
    }
    let minRating = req.query.minRating !== undefined ? Number(req.query.minRating) : null;
    if (minRating !== null && !Number.isFinite(minRating)) throw bad('minRating måste vara ett tal');
    const { limit, offset } = paging(req.query);
    let airline = null;
    if (typeof req.query.airline === 'string' && req.query.airline.trim()) {
      airline = req.query.airline.trim().toUpperCase();
      if (!/^[A-Z0-9]{2}$/.test(airline)) throw bad('airline måste vara en IATA-kod med två tecken');
    }
    let travelClass = null;
    if (typeof req.query.travelClass === 'string' && req.query.travelClass) {
      if (!TRAVEL_CLASSES.includes(req.query.travelClass)) throw bad(`travelClass måste vara en av ${TRAVEL_CLASSES.join(', ')}`);
      travelClass = req.query.travelClass;
    }
    // Filter för flygbolag/klass: check-ins direkt, loungerecensioner via kopplad check-in.
    const cFilter = 'AND (? IS NULL OR c.airline_iata = ?) AND (? IS NULL OR c.travel_class = ?)';
    const rFilter = 'AND (? IS NULL OR lc.airline_iata = ?) AND (? IS NULL OR lc.travel_class = ?)';
    const fp = [airline, airline, travelClass, travelClass];

    const common = (tbl) => `
      ${USER_COLS('u', 'u_')}, ${AIRPORT_COLS('a', 'a_')}, ${tbl}.rating, ${tbl}.comment, ${tbl}.visited_on, ${tbl}.created_at`;

    let sql;
    let params;
    if (q) {
      sql = `
        SELECT * FROM (
          SELECT 'checkin' AS type, c.id, NULL AS lounge_name, ${common('c')},
                 snippet(checkins_fts, 0, '${OPEN}', '${CLOSE}', '${ELLIPSIS}', 16) AS snip,
                 bm25(checkins_fts) AS score
          FROM checkins_fts
          JOIN checkins c ON c.id = checkins_fts.rowid
          JOIN users u ON u.id = c.user_id
          JOIN airports a ON a.iata = c.iata
          WHERE checkins_fts MATCH ? AND (? IS NULL OR c.iata = ?) AND (? IS NULL OR c.rating >= ?) ${cFilter}
          UNION ALL
          SELECT 'lounge_review' AS type, r.id, lo.name AS lounge_name, ${common('r')},
                 snippet(lounge_reviews_fts, 0, '${OPEN}', '${CLOSE}', '${ELLIPSIS}', 16) AS snip,
                 bm25(lounge_reviews_fts) AS score
          FROM lounge_reviews_fts
          JOIN lounge_reviews r ON r.id = lounge_reviews_fts.rowid
          JOIN lounges lo ON lo.id = r.lounge_id
          JOIN users u ON u.id = r.user_id
          JOIN airports a ON a.iata = lo.iata
          LEFT JOIN checkins lc ON lc.id = r.checkin_id
          WHERE lounge_reviews_fts MATCH ? AND (? IS NULL OR lo.iata = ?) AND (? IS NULL OR r.rating >= ?) ${rFilter}
        ) ORDER BY score, created_at DESC LIMIT ? OFFSET ?`;
      params = [q, iata, iata, minRating, minRating, ...fp, q, iata, iata, minRating, minRating, ...fp, limit, offset];
    } else {
      sql = `
        SELECT * FROM (
          SELECT 'checkin' AS type, c.id, NULL AS lounge_name, ${common('c')}, NULL AS snip
          FROM checkins c JOIN users u ON u.id = c.user_id JOIN airports a ON a.iata = c.iata
          WHERE c.comment IS NOT NULL AND c.iata = ? AND (? IS NULL OR c.rating >= ?) ${cFilter}
          UNION ALL
          SELECT 'lounge_review' AS type, r.id, lo.name AS lounge_name, ${common('r')}, NULL AS snip
          FROM lounge_reviews r JOIN lounges lo ON lo.id = r.lounge_id
          JOIN users u ON u.id = r.user_id JOIN airports a ON a.iata = lo.iata
          LEFT JOIN checkins lc ON lc.id = r.checkin_id
          WHERE r.comment IS NOT NULL AND lo.iata = ? AND (? IS NULL OR r.rating >= ?) ${rFilter}
        ) ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params = [iata, minRating, minRating, ...fp, iata, minRating, minRating, ...fp, limit, offset];
    }

    let rows;
    try {
      rows = db.prepare(sql).all(...params);
    } catch (e) {
      // Ska inte kunna hända efter saneringen, men en trasig fråga ska ge 400 och inte 500.
      if (/fts5|MATCH/i.test(e.message)) throw bad('Ogiltig söksträng');
      throw e;
    }

    res.json(rows.map((row) => ({
      type: row.type,
      id: row.id,
      user: userFrom(row, 'u_'),
      airport: airportFrom(row, 'a_'),
      loungeName: row.lounge_name ?? null,
      rating: row.rating ?? null,
      comment: row.comment ?? null,
      snippet: row.snip != null ? renderSnippet(row.snip) : plainSnippet(row.comment),
      visitedOn: row.visited_on,
      createdAt: row.created_at,
    })));
  }));

  return r;
}
