// Synlighet (API v3): vilka check-ins, recensioner och profiler en tittare får se.
// Funktionerna returnerar { sql, params } som klistras in i WHERE-satser. Tittare -1 = utloggad.
import { HttpError } from './util.js';

export const VISIBILITIES = ['public', 'friends', 'private'];
export const PUBLISH_DELAYS = [0, 1, 24, 168];

const nowIso = () => new Date().toISOString();

/** Ingen blockering åt något håll mellan ägaren (SQL-uttryck) och tittaren. Två parametrar. */
const notBlocked = (owner) => `NOT EXISTS (SELECT 1 FROM blocks b
  WHERE (b.blocker_id = ${owner} AND b.blocked_id = ?) OR (b.blocker_id = ? AND b.blocked_id = ${owner}))`;
/** Tittaren är godkänd följare av ägaren. En parameter. */
const isFollower = (owner) => `EXISTS (SELECT 1 FROM follows f
  WHERE f.follower_id = ? AND f.followee_id = ${owner} AND f.status = 'accepted')`;

/** Check-in `c` (ägare `u`, rad från users) är synlig för tittaren. */
export function checkinVisible(viewerId, { c = 'c', u = 'u', now = nowIso() } = {}) {
  const v = viewerId ?? -1;
  return {
    sql: `(${c}.user_id = ? OR (IFNULL(${c}.publish_at, ${c}.created_at) <= ? AND ${c}.visibility <> 'private'
      AND ${notBlocked(`${c}.user_id`)}
      AND ((${c}.visibility = 'public' AND ${u}.is_private = 0) OR ${isFollower(`${c}.user_id`)})))`,
    params: [v, now, v, v, v],
  };
}

/** Loungerecension `r` (författare `u`, ev. kopplad check-in `lc`) är synlig för tittaren. */
export function reviewVisible(viewerId, { r = 'r', u = 'u', lc = 'lc', now = nowIso() } = {}) {
  const v = viewerId ?? -1;
  return {
    sql: `(${r}.user_id = ? OR (${notBlocked(`${r}.user_id`)} AND (
      (${r}.checkin_id IS NULL AND (${u}.is_private = 0 OR ${isFollower(`${r}.user_id`)}))
      OR (${lc}.id IS NOT NULL AND IFNULL(${lc}.publish_at, ${lc}.created_at) <= ? AND ${lc}.visibility <> 'private'
          AND ((${lc}.visibility = 'public' AND ${u}.is_private = 0) OR ${isFollower(`${r}.user_id`)})))))`,
    params: [v, v, v, v, now, v],
  };
}

/** Kommentarsförfattaren `m.user_id` är inte blockerad i förhållande till tittaren. */
export function commentVisible(viewerId, { m = 'm' } = {}) {
  const v = viewerId ?? -1;
  return { sql: notBlocked(`${m}.user_id`), params: [v, v] };
}

export function isBlocked(db, a, b) {
  if (!a || !b) return false;
  return !!db.prepare(`SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`)
    .get(a, b, b, a);
}

/** Tillgång till en profil (users-rad). */
export function profileAccess(db, viewerId, owner) {
  if (viewerId && viewerId === owner.id) return { canView: true, following: false, followRequested: false, blocked: false };
  const f = viewerId
    ? db.prepare('SELECT status FROM follows WHERE follower_id = ? AND followee_id = ?').get(viewerId, owner.id)
    : null;
  const blocked = isBlocked(db, viewerId, owner.id);
  const following = f?.status === 'accepted';
  return {
    canView: !blocked && (!owner.is_private || following),
    following,
    followRequested: f?.status === 'pending',
    blocked,
  };
}

/** Kastar 403 private_profile om tittaren inte får se profilens listor. */
export function requireProfileAccess(db, viewerId, owner) {
  const a = profileAccess(db, viewerId, owner);
  if (!a.canView) {
    const err = new HttpError(403, 'Profilen är privat');
    err.code = 'private_profile';
    throw err;
  }
  return a;
}

/** Hämtar en check-in som tittaren får se, annars null. */
export function visibleCheckin(db, viewerId, checkinId) {
  const vis = checkinVisible(viewerId);
  return db.prepare(`SELECT c.* FROM checkins c JOIN users u ON u.id = c.user_id WHERE c.id = ? AND ${vis.sql}`)
    .get(checkinId, ...vis.params) ?? null;
}
