// Foton på check-ins (v1.2). Filer sparas med slumpat namn i uploadDir och serveras under /uploads.
import { Router } from 'express';
import express from 'express';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { requireAuth } from '../auth.js';
import { h, bad, notFound, HttpError, photoFrom } from '../util.js';

export const MAX_PHOTOS_PER_CHECKIN = 4;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const FILENAME_RE = /^[a-f0-9]{32}\.(jpg|png|webp)$/;

/** Identifierar bildtyp via magic bytes och läser ut dimensioner när det går. */
export function imageInfo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  // PNG
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    const ok = buf.length >= 24 && buf.toString('latin1', 12, 16) === 'IHDR';
    return { ext: 'png', width: ok ? buf.readUInt32BE(16) : null, height: ok ? buf.readUInt32BE(20) : null };
  }
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    let width = null;
    let height = null;
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        height = buf.readUInt16BE(i + 5);
        width = buf.readUInt16BE(i + 7);
        break;
      }
      if (marker === 0xda) break;
      i += 2 + len;
    }
    return { ext: 'jpg', width, height };
  }
  // WEBP: "RIFF" .... "WEBP"
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    let width = null;
    let height = null;
    const chunk = buf.length >= 30 ? buf.toString('latin1', 12, 16) : '';
    if (chunk === 'VP8 ' && buf.length >= 30) {
      width = buf.readUInt16LE(26) & 0x3fff;
      height = buf.readUInt16LE(28) & 0x3fff;
    } else if (chunk === 'VP8L' && buf.length >= 25) {
      const bits = buf.readUInt32LE(21);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    } else if (chunk === 'VP8X' && buf.length >= 30) {
      width = buf.readUIntLE(24, 3) + 1;
      height = buf.readUIntLE(27, 3) + 1;
    }
    return { ext: 'webp', width, height };
  }
  return null;
}

export function photoStore(uploadDir) {
  mkdirSync(uploadDir, { recursive: true });
  return {
    uploadDir,
    save(buf, ext) {
      const filename = `${randomBytes(16).toString('hex')}.${ext}`;
      writeFileSync(join(uploadDir, filename), buf, { flag: 'wx', mode: 0o644 });
      return filename;
    },
    removeFiles(names) {
      for (const n of names) {
        if (!FILENAME_RE.test(n)) continue;
        try { unlinkSync(join(uploadDir, n)); } catch { /* redan borta */ }
      }
    },
  };
}

/** Statisk servering av /uploads med strikta headers. Endast slumpade filnamn släpps igenom. */
export function uploadsStatic(uploadDir) {
  const serve = express.static(uploadDir, { index: false, dotfiles: 'deny', fallthrough: false, maxAge: '7d', immutable: true });
  return (req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    if (!FILENAME_RE.test(req.path.replace(/^\//, ''))) return res.status(404).json({ error: 'Filen finns inte' });
    serve(req, res, (err) => {
      if (err && err.status === 404) return res.status(404).json({ error: 'Filen finns inte' });
      next(err);
    });
  };
}

export default function photoRoutes({ db, photos }) {
  const r = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 5, parts: 6 },
  }).single('photo');

  const runUpload = (req, res, next) => upload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'Fotot får vara max 5 MB'));
    if (err instanceof multer.MulterError) return next(bad(`Ogiltig uppladdning (${err.code})`));
    next(err);
  });

  r.post('/checkins/:id/photos', requireAuth, (req, _res, next) => {
    // Kontrollera ägarskap innan filen tas emot.
    const id = Number(req.params.id);
    const c = Number.isInteger(id) && id > 0 ? db.prepare('SELECT user_id FROM checkins WHERE id = ?').get(id) : null;
    if (!c) return next(notFound('Check-in finns inte'));
    if (c.user_id !== req.user.id) return next(new HttpError(403, 'Du kan bara lägga till foton på dina egna check-ins'));
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM photos WHERE checkin_id = ?').get(id);
    if (n >= MAX_PHOTOS_PER_CHECKIN) return next(new HttpError(409, `Max ${MAX_PHOTOS_PER_CHECKIN} foton per check-in`));
    req.checkinId = id;
    next();
  }, runUpload, h((req, res) => {
    if (!req.file) throw bad('Fältet photo med en bildfil krävs');
    const info = imageInfo(req.file.buffer);
    if (!info) throw bad('Endast JPEG, PNG eller WEBP tillåts');
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM photos WHERE checkin_id = ?').get(req.checkinId);
    if (n >= MAX_PHOTOS_PER_CHECKIN) throw new HttpError(409, `Max ${MAX_PHOTOS_PER_CHECKIN} foton per check-in`);
    const filename = photos.save(req.file.buffer, info.ext);
    const ins = db.prepare(`INSERT INTO photos (checkin_id, user_id, filename, width, height, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(req.checkinId, req.user.id, filename, info.width, info.height, new Date().toISOString());
    const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(Number(ins.lastInsertRowid));
    res.status(201).json(photoFrom(row));
  }));

  r.delete('/photos/:id', requireAuth, h((req, res) => {
    const id = Number(req.params.id);
    const p = Number.isInteger(id) && id > 0 ? db.prepare('SELECT * FROM photos WHERE id = ?').get(id) : null;
    if (!p) throw notFound('Fotot finns inte');
    if (p.user_id !== req.user.id) throw new HttpError(403, 'Du kan bara radera dina egna foton');
    db.prepare('DELETE FROM photos WHERE id = ?').run(id);
    photos.removeFiles([p.filename]);
    res.status(204).end();
  }));

  return r;
}
