// Inbjudningslänkar (API v4): /register?ref=<kod> ger ömsesidig följning med den som bjöd in.
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { requireAuth } from '../auth.js';
import { h, bad, notFound, HttpError, USER_COLS, userFrom } from '../util.js';
import { notify } from '../notify.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // utan förväxlingsbara tecken
const CODE_RE = /^[A-HJ-NP-Z2-9]{10}$/;
const MAX_ACTIVE = 10;
const TTL_DAYS = 90;

function newCode() {
  const bytes = randomBytes(10);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

const normCode = (v) => (typeof v === 'string' ? v.trim().toUpperCase() : '');

function validInvite(db, code) {
  if (!CODE_RE.test(code)) return null;
  const inv = db.prepare('SELECT * FROM invites WHERE code = ?').get(code);
  if (!inv || inv.revoked_at || inv.expires_at <= new Date().toISOString() || inv.uses >= inv.max_uses) return null;
  return inv;
}

/**
 * Kopplar ett nytt konto till en inbjudan (anropas i registreringens transaktion). Ogiltig kod
 * ignoreras så att registreringen inte misslyckas. Returnerar den inbjudandes användarnamn eller null.
 */
export function acceptInvite(db, rawCode, newUserId) {
  const inv = validInvite(db, normCode(rawCode));
  if (!inv) return null;
  const now = new Date().toISOString();
  const ins = db.prepare("INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at, status) VALUES (?, ?, ?, 'accepted')");
  ins.run(newUserId, inv.user_id, now);
  ins.run(inv.user_id, newUserId, now);
  db.prepare('UPDATE invites SET uses = uses + 1 WHERE code = ?').run(inv.code);
  db.prepare('UPDATE users SET invited_by = ? WHERE id = ?').run(inv.user_id, newUserId);
  notify(db, { userId: inv.user_id, type: 'invite_accepted', actorId: newUserId });
  return db.prepare('SELECT username FROM users WHERE id = ?').get(inv.user_id).username;
}

export default function inviteRoutes({ db }) {
  const r = Router();
  const inviteFrom = (row) => ({
    code: row.code,
    url: `/register?ref=${row.code}`,
    uses: row.uses,
    maxUses: row.max_uses,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  });

  r.get('/me/invites', requireAuth, h((req, res) => {
    const rows = db.prepare(`SELECT * FROM invites WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
      ORDER BY created_at DESC`).all(req.user.id, new Date().toISOString());
    res.json(rows.map(inviteFrom));
  }));

  r.post('/me/invites', requireAuth, h((req, res) => {
    let maxUses = req.body?.maxUses ?? 25;
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100) throw bad('maxUses måste vara ett heltal 1-100');
    const now = new Date();
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM invites WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?')
      .get(req.user.id, now.toISOString());
    if (n >= MAX_ACTIVE) throw new HttpError(409, `Max ${MAX_ACTIVE} aktiva inbjudningar`);
    const code = newCode();
    db.prepare('INSERT INTO invites (code, user_id, max_uses, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(code, req.user.id, maxUses, now.toISOString(), new Date(now.getTime() + TTL_DAYS * 86400_000).toISOString());
    res.status(201).json(inviteFrom(db.prepare('SELECT * FROM invites WHERE code = ?').get(code)));
  }));

  r.delete('/me/invites/:code', requireAuth, h((req, res) => {
    const info = db.prepare('UPDATE invites SET revoked_at = ? WHERE code = ? AND user_id = ? AND revoked_at IS NULL')
      .run(new Date().toISOString(), normCode(req.params.code), req.user.id);
    if (!info.changes) throw notFound('Inbjudan finns inte');
    res.status(204).end();
  }));

  // Publik förhandsvisning för registreringssidan.
  r.get('/invites/:code', h((req, res) => {
    const inv = validInvite(db, normCode(req.params.code));
    if (!inv) throw notFound('Inbjudan är ogiltig eller har gått ut');
    const u = db.prepare(`SELECT ${USER_COLS('u', '')} FROM users u WHERE u.id = ?`).get(inv.user_id);
    res.json({ code: inv.code, inviter: userFrom(u), expiresAt: inv.expires_at });
  }));

  return r;
}
