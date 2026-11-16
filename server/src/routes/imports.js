// Import av resehistorik från CSV (Flighty, App in the Air, TripIt, OpenFlights m.fl.). Format: docs/API.md.
import { Router } from 'express';
import express from 'express';
import { randomBytes } from 'node:crypto';
import { requireAuth } from '../auth.js';
import { h, bad, notFound, HttpError, KINDS, TRAVEL_CLASSES, maxAllowedDate } from '../util.js';
import { transaction } from '../db/index.js';
import { awardBadges } from '../badges.js';

export const MAX_ROWS = 5000;

/** RFC 4180-tolerant CSV-tolkning. Avgränsare gissas från första raden (, ; eller tab). */
export function parseCsv(text) {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delim) { row.push(field); field = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const COLS = {
  date: ['date', 'visitedon', 'visited on', 'flight date', 'departure date', 'dep date', 'start date', 'date (local)'],
  iata: ['iata', 'airport', 'airport code'],
  from: ['from', 'origin', 'departure airport', 'dep airport', 'from airport', 'from code', 'departure'],
  to: ['to', 'destination', 'arrival airport', 'arr airport', 'to airport', 'to code', 'arrival'],
  kind: ['kind', 'type'],
  airline: ['airline', 'carrier', 'airline code'],
  flight: ['flight', 'flight number', 'flight no', 'flight #'],
  cls: ['class', 'cabin', 'seat class', 'cabin class'],
  rating: ['rating'],
  comment: ['comment', 'notes', 'note'],
};

function headerMap(header) {
  const norm = header.map((x) => x.trim().toLowerCase().replace(/[_]+/g, ' '));
  const map = {};
  for (const [key, names] of Object.entries(COLS)) {
    const i = norm.findIndex((x) => names.includes(x));
    if (i >= 0) map[key] = i;
  }
  return map;
}

function parseDate(v) {
  const m = /^(\d{4})[-/](\d{2})[-/](\d{2})/.exec((v ?? '').trim());
  if (!m) return null;
  const d = `${m[1]}-${m[2]}-${m[3]}`;
  const t = new Date(d + 'T00:00:00Z');
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d ? d : null;
}

const CLASS_MAP = { economy: 'economy', 'premium economy': 'premium_economy', premium_economy: 'premium_economy', business: 'business', first: 'first' };

export default function importRoutes({ db, photos }) {
  const r = Router();
  const byIata = db.prepare('SELECT iata FROM airports WHERE iata = ?');
  const byIcao = db.prepare('SELECT iata FROM airports WHERE icao = ?');
  const airlineExists = db.prepare('SELECT 1 FROM airlines WHERE iata = ?');

  const airport = (raw) => {
    const v = (raw ?? '').trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(v)) return byIata.get(v)?.iata ?? null;
    if (/^[A-Z0-9]{4}$/.test(v)) return byIcao.get(v)?.iata ?? null;
    return null;
  };

  /** Tolkar filen till check-in-rader. Returnerar { format, rows, items, skipped }. */
  function analyse(text, userId) {
    const table = parseCsv(text);
    if (table.length < 2) throw bad('Filen måste ha en rubrikrad och minst en datarad');
    if (table.length - 1 > MAX_ROWS) throw new HttpError(413, `Max ${MAX_ROWS} rader per import`);
    const map = headerMap(table[0]);
    if (map.date === undefined) throw bad('Hittar ingen datumkolumn (date, flight date, departure date ...)');
    const pair = map.from !== undefined && map.to !== undefined;
    if (!pair && map.iata === undefined) throw bad('Hittar varken iata/airport eller from/to-kolumner');
    const format = pair ? 'flights' : 'airports';
    const today = maxAllowedDate();
    const existing = new Set(db.prepare('SELECT iata, visited_on, kind FROM checkins WHERE user_id = ?').all(userId)
      .map((c) => `${c.iata}|${c.visited_on}|${c.kind}`));
    const items = [];
    const skipped = [];
    let duplicates = 0;
    const cell = (row, k) => (map[k] === undefined ? '' : (row[map[k]] ?? '').trim());
    table.slice(1).forEach((row, i) => {
      const line = i + 2;
      const visitedOn = parseDate(cell(row, 'date'));
      if (!visitedOn) return skipped.push({ line, reason: 'Ogiltigt datum' });
      if (visitedOn > today) return skipped.push({ line, reason: 'Datum i framtiden' });
      let airline = cell(row, 'airline').toUpperCase();
      airline = /^[A-Z0-9]{2}$/.test(airline) && airlineExists.get(airline) ? airline : null;
      const flight = cell(row, 'flight').replace(/\s+/g, '').toUpperCase();
      const flightNumber = /^[A-Z0-9]{1,8}$/.test(flight) ? flight : null;
      const travelClass = CLASS_MAP[cell(row, 'cls').toLowerCase()] ?? null;
      const ratingRaw = Number(cell(row, 'rating').replace(',', '.'));
      const rating = cell(row, 'rating') && ratingRaw >= 0.5 && ratingRaw <= 5 && Number.isInteger(ratingRaw * 2) ? ratingRaw : null;
      const comment = cell(row, 'comment').slice(0, 1000) || null;
      const legs = [];
      if (pair) {
        const from = airport(cell(row, 'from'));
        const to = airport(cell(row, 'to'));
        if (!from || !to) return skipped.push({ line, reason: `Okänd flygplats ${!from ? cell(row, 'from') : cell(row, 'to')}` });
        legs.push({ iata: from, kind: 'departure' }, { iata: to, kind: 'arrival' });
      } else {
        const a = airport(cell(row, 'iata'));
        if (!a) return skipped.push({ line, reason: `Okänd flygplats ${cell(row, 'iata')}` });
        const kind = cell(row, 'kind').toLowerCase() || 'departure';
        if (!KINDS.includes(kind)) return skipped.push({ line, reason: `Okänd typ ${kind}` });
        legs.push({ iata: a, kind });
      }
      for (const leg of legs) {
        const key = `${leg.iata}|${visitedOn}|${leg.kind}`;
        if (existing.has(key)) { duplicates++; continue; }
        existing.add(key);
        items.push({ line, ...leg, visitedOn, airlineIata: airline, flightNumber, travelClass,
          rating: pair && leg.kind === 'arrival' ? null : rating, comment: pair && leg.kind === 'arrival' ? null : comment });
      }
    });
    return { format, rows: table.length - 1, items, skipped, duplicates };
  }

  const body = [express.text({ type: ['text/csv', 'text/plain'], limit: '1mb' }), express.json({ limit: '1mb' })];

  r.post('/me/imports', requireAuth, ...body, h((req, res) => {
    const text = typeof req.body === 'string' ? req.body : req.body?.csv;
    if (typeof text !== 'string' || !text.trim()) throw bad('Skicka CSV som text/csv eller JSON { csv }');
    const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
    const a = analyse(text, req.user.id);
    const preview = a.items.slice(0, 50).map(({ line, iata, visitedOn, kind, airlineIata, flightNumber }) =>
      ({ line, iata, visitedOn, kind, airlineIata, flightNumber }));
    const result = { id: null, format: a.format, rows: a.rows, imported: 0, duplicates: a.duplicates, skipped: a.skipped, preview };
    if (dryRun || !a.items.length) return res.status(200).json(result);
    const id = randomBytes(8).toString('hex');
    const now = new Date().toISOString();
    const vis = db.prepare('SELECT default_visibility FROM users WHERE id = ?').get(req.user.id).default_visibility;
    transaction(db, () => {
      const ins = db.prepare(`INSERT INTO checkins (user_id, iata, visited_on, kind, rating, comment, created_at, airline_iata,
        travel_class, flight_number, visibility, publish_at, source, import_batch)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import', ?)`);
      for (const it of a.items) {
        ins.run(req.user.id, it.iata, it.visitedOn, it.kind, it.rating, it.comment, now, it.airlineIata,
          TRAVEL_CLASSES.includes(it.travelClass) ? it.travelClass : null, it.flightNumber, vis, now, id);
      }
      db.prepare('INSERT INTO import_batches (id, user_id, format, rows, imported, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, req.user.id, a.format, a.rows, a.items.length, now);
      awardBadges(db, req.user.id, `badge:import:${id}`);
    });
    res.status(201).json({ ...result, id, imported: a.items.length });
  }));

  r.get('/me/imports', requireAuth, h((req, res) => {
    const rows = db.prepare('SELECT * FROM import_batches WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json(rows.map((b) => ({ id: b.id, format: b.format, rows: b.rows, imported: b.imported, createdAt: b.created_at })));
  }));

  r.delete('/me/imports/:id', requireAuth, h((req, res) => {
    const b = db.prepare('SELECT id FROM import_batches WHERE id = ? AND user_id = ?').get(String(req.params.id), req.user.id);
    if (!b) throw notFound('Importen finns inte');
    const files = db.prepare(`SELECT p.filename FROM photos p JOIN checkins c ON c.id = p.checkin_id
      WHERE c.import_batch = ? AND c.user_id = ?`).all(b.id, req.user.id).map((x) => x.filename);
    transaction(db, () => {
      db.prepare('DELETE FROM checkins WHERE import_batch = ? AND user_id = ?').run(b.id, req.user.id);
      db.prepare('DELETE FROM import_batches WHERE id = ?').run(b.id);
    });
    photos?.removeFiles(files);
    res.status(204).end();
  }));

  return r;
}
