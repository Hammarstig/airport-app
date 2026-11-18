// Import av resehistorik från CSV (Flighty, App in the Air, TripIt, OpenFlights m.fl.). Format: docs/API.md.
import { Router } from 'express';
import express from 'express';
import { randomBytes } from 'node:crypto';
import { requireAuth } from '../auth.js';
import { h, bad, notFound, HttpError, KINDS, TRAVEL_CLASSES, maxAllowedDate } from '../util.js';
import { transaction } from '../db/index.js';
import { awardBadges } from '../badges.js';
import { setImmediate as tick } from 'node:timers/promises';

export const MAX_ROWS = 5000;
/** Tidsbudget i ms för en sats (tolkning eller transaktion) innan händelseloopen lämnas fri (SEC-07). */
export const SLICE_MS = 15;

/**
 * RFC 4180-tolerant CSV-tolkning. Avgränsare gissas från första raden (, ; eller tab).
 * Fält läses med slice i stället för tecken för tecken så att 1 MB tolkas på några ms (SEC-07).
 */
export function parseCsv(text) {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  const n = src.length;
  let i = 0;
  const endRow = () => { rows.push(row); row = []; };
  while (i < n) {
    let field;
    if (src[i] === '"') {
      // Citerat fält: "" är ett citattecken.
      let j = i + 1;
      const parts = [];
      for (;;) {
        const q = src.indexOf('"', j);
        if (q === -1) { parts.push(src.slice(j)); j = n; break; }
        parts.push(src.slice(j, q));
        if (src[q + 1] === '"') { parts.push('"'); j = q + 2; } else { j = q + 1; break; }
      }
      field = parts.join('');
      // Text efter avslutande citattecken fram till avgränsare/radslut tas med (tolerant).
      let k = j;
      while (k < n && src[k] !== delim && src[k] !== '\n' && src[k] !== '\r') k++;
      field += src.slice(j, k);
      i = k;
    } else {
      let k = i;
      while (k < n && src[k] !== delim && src[k] !== '\n' && src[k] !== '\r') k++;
      field = src.slice(i, k);
      i = k;
    }
    row.push(field);
    if (i >= n) { endRow(); break; }
    const ch = src[i];
    if (ch === delim) {
      i++;
      if (i >= n) { row.push(''); endRow(); }
    } else {
      i += ch === '\r' && src[i + 1] === '\n' ? 2 : 1;
      endRow();
    }
  }
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

export default function importRoutes({ db, photos, limiters }) {
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
  async function analyse(text, userId) {
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
    let t0 = performance.now();
    for (let i = 0; i < table.length - 1; i++) {
      if (performance.now() - t0 > SLICE_MS) { await tick(); t0 = performance.now(); }
      analyseRow(table[i + 1], i + 2);
    }
    return { format, rows: table.length - 1, items, skipped, duplicates };

    function analyseRow(row, line) {
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
    }
  }

  const body = [express.text({ type: ['text/csv', 'text/plain'], limit: '1mb' }), express.json({ limit: '1mb' })];

  // Egen gräns för importer (SEC-07); förhandsvisning (dryRun) räknas separat.
  const isDry = (req) => req.query.dryRun === '1' || req.query.dryRun === 'true';
  const limit = (req, res, next) => {
    const l = isDry(req) ? limiters?.importPreview : limiters?.import;
    return l ? l(req, res, next) : next();
  };

  r.post('/me/imports', requireAuth, limit, ...body, h(async (req, res) => {
    const text = typeof req.body === 'string' ? req.body : req.body?.csv;
    if (typeof text !== 'string' || !text.trim()) throw bad('Skicka CSV som text/csv eller JSON { csv }');
    const dryRun = isDry(req);
    const a = await analyse(text, req.user.id);
    const preview = a.items.slice(0, 50).map(({ line, iata, visitedOn, kind, airlineIata, flightNumber }) =>
      ({ line, iata, visitedOn, kind, airlineIata, flightNumber }));
    const result = { id: null, format: a.format, rows: a.rows, imported: 0, duplicates: a.duplicates, skipped: a.skipped, preview };
    if (dryRun || !a.items.length) return res.status(200).json(result);
    const id = randomBytes(8).toString('hex');
    const now = new Date().toISOString();
    const uid = req.user.id;
    const vis = db.prepare('SELECT default_visibility FROM users WHERE id = ?').get(uid).default_visibility;
    db.prepare('INSERT INTO import_batches (id, user_id, format, rows, imported, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, uid, a.format, a.rows, 0, now);
    const ins = db.prepare(`INSERT INTO checkins (user_id, iata, visited_on, kind, rating, comment, created_at, airline_iata,
      travel_class, flight_number, visibility, publish_at, source, import_batch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import', ?)`);
    // Satsvis inskrivning så att servern svarar på andra anrop under en stor import (SEC-07).
    // Misslyckas en sats tas hela importen bort igen.
    try {
      let i = 0;
      while (i < a.items.length) {
        transaction(db, () => {
          const t0 = performance.now();
          do {
            const it = a.items[i++];
            ins.run(uid, it.iata, it.visitedOn, it.kind, it.rating, it.comment, now, it.airlineIata,
              TRAVEL_CLASSES.includes(it.travelClass) ? it.travelClass : null, it.flightNumber, vis, now, id);
          } while (i < a.items.length && performance.now() - t0 < SLICE_MS);
        });
        await tick();
      }
      transaction(db, () => {
        db.prepare('UPDATE import_batches SET imported = ? WHERE id = ?').run(a.items.length, id);
        awardBadges(db, uid, `badge:import:${id}`);
      });
    } catch (err) {
      transaction(db, () => {
        db.prepare('DELETE FROM checkins WHERE import_batch = ? AND user_id = ?').run(id, uid);
        db.prepare('DELETE FROM import_batches WHERE id = ?').run(id);
      });
      throw err;
    }
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
