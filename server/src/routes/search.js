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

/** Delar en FTS-snippet i segment [{ text, mark }] så att klienten kan rendera utan innerHTML. */
export function snippetParts(s) {
  const parts = [];
  for (const [i, chunk] of s.split(OPEN).entries()) {
    if (i === 0) {
      if (chunk) parts.push({ text: chunk, mark: false });
      continue;
    }
    const [marked, ...rest] = chunk.split(CLOSE);
    if (marked) parts.push({ text: marked, mark: true });
    const tail = rest.join('');
    if (tail) parts.push({ text: tail, mark: false });
  }
  return parts;
}

function plainText(comment, max = 160) {
  if (!comment) return '';
  return comment.length > max ? comment.slice(0, max).trimEnd() + ELLIPSIS : comment;
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

    // Två delfrågor (check-ins, loungerecensioner) som var och en hämtar offset+limit rader i sorteringsordning
    // och slås ihop i JS. Standard är nyast först (FTS5 kan då gå baklänges i rowid och sluta tidigt);
    // sort=relevance använder bm25. Flygplatsfiltret ligger i FTS-indexet (kolumnen iata).
    const sort = req.query.sort === 'relevance' && q ? 'relevance' : 'recent';
    const take = Math.min(offset, 1000) + limit;
    const match = q ? `comment : (${q})${iata ? ` AND iata : "${iata}"` : ''}` : null;
    const parts = [
      {
        fts: 'checkins_fts',
        select: `'checkin' AS type, c.id, NULL AS lounge_name, ${common('c')}`,
        table: 'checkins c',
        joins: 'JOIN users u ON u.id = c.user_id JOIN airports a ON a.iata = c.iata',
        id: 'c.id',
        where: `(? IS NULL OR c.rating >= ?) ${cFilter}`,
        plainWhere: 'c.comment IS NOT NULL AND c.iata = ?',
        order: 'c.created_at DESC, c.id DESC',
      },
      {
        fts: 'lounge_reviews_fts',
        select: `'lounge_review' AS type, r.id, lo.name AS lounge_name, ${common('r')}`,
        table: 'lounge_reviews r',
        joins: `JOIN lounges lo ON lo.id = r.lounge_id JOIN users u ON u.id = r.user_id
          JOIN airports a ON a.iata = lo.iata LEFT JOIN checkins lc ON lc.id = r.checkin_id`,
        id: 'r.id',
        where: `(? IS NULL OR r.rating >= ?) ${rFilter}`,
        plainWhere: 'r.comment IS NOT NULL AND lo.iata = ?',
        order: 'r.created_at DESC, r.id DESC',
      },
    ];
    const run = (p) => {
      if (match) {
        return db.prepare(`SELECT ${p.select},
            snippet(${p.fts}, 0, '${OPEN}', '${CLOSE}', '${ELLIPSIS}', 16) AS snip, bm25(${p.fts}) AS score
          FROM ${p.fts} JOIN ${p.table} ON ${p.id} = ${p.fts}.rowid ${p.joins}
          WHERE ${p.fts} MATCH ? AND ${p.where}
          ORDER BY ${sort === 'relevance' ? 'score' : `${p.fts}.rowid DESC`} LIMIT ?`)
          .all(match, minRating, minRating, ...fp, take);
      }
      return db.prepare(`SELECT ${p.select}, NULL AS snip, 0 AS score FROM ${p.table} ${p.joins}
        WHERE ${p.plainWhere} AND ${p.where} ORDER BY ${p.order} LIMIT ?`)
        .all(iata, minRating, minRating, ...fp, take);
    };

    let rows;
    try {
      rows = parts.flatMap(run);
      rows.sort(sort === 'relevance'
        ? (x, y) => x.score - y.score || (y.created_at > x.created_at ? 1 : -1)
        : (x, y) => (y.created_at > x.created_at ? 1 : y.created_at < x.created_at ? -1 : y.id - x.id));
      rows = rows.slice(Math.min(offset, 1000), Math.min(offset, 1000) + limit);
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
      snippet: row.snip != null ? renderSnippet(row.snip) : escapeHtml(plainText(row.comment)),
      snippetParts: row.snip != null ? snippetParts(row.snip) : [{ text: plainText(row.comment), mark: false }],
      visitedOn: row.visited_on,
      createdAt: row.created_at,
    })));
  }));

  return r;
}
