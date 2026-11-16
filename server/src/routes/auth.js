// Inloggning, sessioner, eget konto och inställningar.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth, failureGuard } from '../auth.js';
import { h, bad, HttpError, cleanText, normIata, userSummary } from '../util.js';
import { transaction } from '../db/index.js';
import { checkPassword } from '../passwords.js';
import { acceptInvite } from './invites.js';
import { VISIBILITIES, PUBLISH_DELAYS } from '../visibility.js';
import { PUSH_TYPES, pushPrefs } from '../notify.js';
import {
  ACCESS_TTL_S, REFRESH_COOKIE, signAccess, createSession, rotateRefresh, verifyRefresh, revokeSession, revokeAll,
  parseCookies, setRefreshCookie, clearRefreshCookie,
} from '../sessions.js';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
// Används vid misslyckad inloggning mot okänt konto så att svarstiden blir likartad.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

/** Validerar inställningar (delvis) och returnerar kolumner att uppdatera. */
function settingsColumns(b, currentPush) {
  const set = {};
  const bool = (k, col) => {
    if (b[k] === undefined) return;
    if (typeof b[k] !== 'boolean') throw bad(`${k} måste vara true eller false`);
    set[col] = b[k] ? 1 : 0;
  };
  bool('isPrivate', 'is_private');
  bool('hideHomeAirport', 'hide_home');
  bool('notifyHomeVisits', 'notify_home_visits');
  if (b.defaultVisibility !== undefined) {
    if (!VISIBILITIES.includes(b.defaultVisibility)) {
      throw new HttpError(400, `defaultVisibility måste vara en av ${VISIBILITIES.join(', ')}`, { allowed: VISIBILITIES });
    }
    set.default_visibility = b.defaultVisibility;
  }
  if (b.publishDelayHours !== undefined) {
    if (!PUBLISH_DELAYS.includes(b.publishDelayHours)) {
      throw new HttpError(400, `publishDelayHours måste vara en av ${PUBLISH_DELAYS.join(', ')}`, { allowed: PUBLISH_DELAYS });
    }
    set.publish_delay_hours = b.publishDelayHours;
  }
  if (b.push !== undefined) {
    if (!b.push || typeof b.push !== 'object' || Array.isArray(b.push)) throw bad('push måste vara ett objekt');
    const next = pushPrefs(currentPush);
    for (const [k, v] of Object.entries(b.push)) {
      if (!PUSH_TYPES.includes(k)) throw new HttpError(400, `Okänd notistyp ${k}`, { allowed: PUSH_TYPES });
      if (typeof v !== 'boolean') throw bad(`push.${k} måste vara true eller false`);
      next[k] = v;
    }
    set.push_prefs = JSON.stringify(next);
  }
  return set;
}

export default function authRoutes({ db, secret, config }) {
  const r = Router();
  const production = !!config?.production;
  const moderators = new Set(config?.moderators ?? []);
  const airportExists = db.prepare('SELECT 1 FROM airports WHERE iata = ?');
  const byUsername = db.prepare('SELECT * FROM users WHERE username = ?');
  const byId = db.prepare('SELECT * FROM users WHERE id = ?');

  function homeIata(v) {
    if (v === undefined || v === null || v === '') return null;
    const iata = normIata(v);
    if (!/^[A-Z]{3}$/.test(iata) || !airportExists.get(iata)) throw bad('homeIata är ingen känd IATA-kod');
    return iata;
  }

  const settingsOf = (u) => ({
    isPrivate: !!u.is_private,
    defaultVisibility: u.default_visibility,
    publishDelayHours: u.publish_delay_hours,
    hideHomeAirport: !!u.hide_home,
    notifyHomeVisits: !!u.notify_home_visits,
    push: pushPrefs(u.push_prefs),
  });

  const loginGuard = failureGuard(config?.loginFailures ?? { windowMs: 15 * 60_000, perAccountIp: 10, perAccount: 50 });
  const meSummary = (user) => ({ ...userSummary(db, user), isModerator: moderators.has(user.username) });

  /** Ny session: access-token i svaret, refresh-token i HttpOnly-cookie. */
  function startSession(req, res, user, status = 200, extra = {}) {
    const { sid, refresh } = createSession(db, user.id, req.get('user-agent'));
    setRefreshCookie(res, refresh, production);
    const out = { token: signAccess(secret, user, sid), user: meSummary(user), expiresIn: ACCESS_TTL_S };
    // Registrering visar valda integritetsinställningar så att klienten kan bekräfta dem.
    if (status === 201) Object.assign(out, { settings: settingsOf(byId.get(user.id)), ...extra });
    res.status(status).json(out);
  }

  r.post('/auth/register', h(async (req, res) => {
    const b = req.body ?? {};
    const username = typeof b.username === 'string' ? b.username.trim().toLowerCase() : '';
    if (!USERNAME_RE.test(username)) throw bad('username måste vara 3-20 tecken a-z, 0-9 eller _');
    checkPassword(b.password, username);
    const displayName = cleanText(b.displayName, { field: 'displayName', max: 40 }) ?? username;
    const home = homeIata(b.homeIata);
    // Skyddade standardval för nya konton (config.newAccountDefaults), som kan ändras direkt via `privacy`.
    const d = config?.newAccountDefaults ?? { publishDelayHours: 1, hideHomeAirport: true };
    if (b.privacy !== undefined && (typeof b.privacy !== 'object' || Array.isArray(b.privacy) || b.privacy === null || 'push' in b.privacy)) {
      throw bad('privacy måste vara ett objekt med isPrivate, defaultVisibility, publishDelayHours, hideHomeAirport eller notifyHomeVisits');
    }
    const privacy = settingsColumns({ publishDelayHours: d.publishDelayHours, hideHomeAirport: d.hideHomeAirport, ...(b.privacy ?? {}) }, '{}');
    if (byUsername.get(username)) throw new HttpError(409, 'Användarnamnet är upptaget');
    const hash = await bcrypt.hash(b.password, 10);
    let info;
    let invitedBy = null;
    try {
      info = transaction(db, () => {
        const x = db.prepare(`INSERT INTO users (username, password_hash, display_name, home_iata, created_at)
          VALUES (?, ?, ?, ?, ?)`).run(username, hash, displayName, home, new Date().toISOString());
        const id = Number(x.lastInsertRowid);
        const cols = Object.keys(privacy);
        if (cols.length) db.prepare(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => privacy[c]), id);
        if (b.ref !== undefined && b.ref !== null && b.ref !== '') invitedBy = acceptInvite(db, b.ref, id);
        return x;
      });
    } catch (e) {
      if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'Användarnamnet är upptaget');
      throw e;
    }
    startSession(req, res, byId.get(Number(info.lastInsertRowid)), 201, { invitedBy });
  }));

  r.post('/auth/login', h(async (req, res) => {
    const b = req.body ?? {};
    const username = typeof b.username === 'string' ? b.username.trim().toLowerCase() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    if (!username || !password) throw bad('username och password krävs');
    const keys = [`a:${username}|${req.ip}`, `t:${username}`];
    const wait = loginGuard.blocked(keys);
    if (wait) {
      res.set('Retry-After', String(wait));
      throw new HttpError(429, 'För många misslyckade inloggningar, vänta en stund och försök igen');
    }
    const user = byUsername.get(username);
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) {
      loginGuard.fail(keys);
      throw new HttpError(401, 'Fel användarnamn eller lösenord');
    }
    loginGuard.reset(keys[0]);
    startSession(req, res, user);
  }));

  r.post('/auth/refresh', h((req, res) => {
    const token = parseCookies(req.get('cookie'))[REFRESH_COOKIE];
    try {
      const { session, refresh } = rotateRefresh(db, token);
      if (refresh) setRefreshCookie(res, refresh, production);
      const user = byId.get(session.user_id);
      res.json({ token: signAccess(secret, user, session.id), user: meSummary(user), expiresIn: ACCESS_TTL_S });
    } catch (e) {
      clearRefreshCookie(res, production);
      throw e;
    }
  }));

  r.post('/auth/logout', h((req, res) => {
    // Bara den egna sessionen: via giltig access-token, eller via cookie vars hemlighet verifieras.
    const token = parseCookies(req.get('cookie'))[REFRESH_COOKIE];
    const sid = req.user?.sid ?? verifyRefresh(db, token)?.id ?? null;
    if (sid) revokeSession(db, sid);
    clearRefreshCookie(res, production);
    res.status(204).end();
  }));

  r.post('/auth/logout-all', requireAuth, h((req, res) => {
    revokeAll(db, req.user.id);
    clearRefreshCookie(res, production);
    res.status(204).end();
  }));

  r.get('/me', requireAuth, h((req, res) => {
    res.json(meSummary(byId.get(req.user.id)));
  }));

  r.patch('/me', requireAuth, h((req, res) => {
    const b = req.body ?? {};
    const cur = byId.get(req.user.id);
    let displayName = cur.display_name;
    let home = cur.home_iata;
    if (b.displayName !== undefined) {
      displayName = cleanText(b.displayName, { field: 'displayName', max: 40, required: true });
    }
    if (b.homeIata !== undefined) home = homeIata(b.homeIata);
    db.prepare('UPDATE users SET display_name = ?, home_iata = ? WHERE id = ?').run(displayName, home, req.user.id);
    res.json(meSummary(byId.get(req.user.id)));
  }));

  // ---- Sessioner och lösenord ----
  r.get('/me/sessions', requireAuth, h((req, res) => {
    const rows = db.prepare(`SELECT id, client, created_at, last_used_at FROM sessions
      WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_used_at DESC`)
      .all(req.user.id, new Date().toISOString());
    res.json(rows.map((s) => ({
      id: s.id, createdAt: s.created_at, lastUsedAt: s.last_used_at, client: s.client ?? null, current: s.id === req.user.sid,
    })));
  }));

  r.delete('/me/sessions/:id', requireAuth, h((req, res) => {
    const s = db.prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?').get(String(req.params.id), req.user.id);
    if (!s) throw new HttpError(404, 'Sessionen finns inte');
    revokeSession(db, s.id);
    res.status(204).end();
  }));

  r.post('/me/password', requireAuth, h(async (req, res) => {
    const b = req.body ?? {};
    const user = byId.get(req.user.id);
    if (typeof b.currentPassword !== 'string' || !b.currentPassword) throw bad('currentPassword krävs');
    if (!(await bcrypt.compare(b.currentPassword, user.password_hash))) throw new HttpError(403, 'Fel nuvarande lösenord');
    checkPassword(b.newPassword, user.username, 'newPassword');
    const hash = await bcrypt.hash(b.newPassword, 10);
    transaction(db, () => {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
      revokeAll(db, user.id, { except: req.user.sid });
    });
    res.json({ token: signAccess(secret, user, req.user.sid), expiresIn: ACCESS_TTL_S });
  }));

  // ---- Inställningar ----
  r.get('/me/settings', requireAuth, h((req, res) => {
    res.json(settingsOf(byId.get(req.user.id)));
  }));

  r.patch('/me/settings', requireAuth, h((req, res) => {
    const b = req.body ?? {};
    const cur = byId.get(req.user.id);
    const set = settingsColumns(b, cur.push_prefs);
    const cols = Object.keys(set);
    if (cols.length) {
      transaction(db, () => {
        db.prepare(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => set[c]), cur.id);
        // Publik profil: väntande förfrågningar godkänns automatiskt.
        if (set.is_private === 0) db.prepare("UPDATE follows SET status = 'accepted' WHERE followee_id = ? AND status = 'pending'").run(cur.id);
      });
    }
    res.json(settingsOf(byId.get(req.user.id)));
  }));

  return r;
}
