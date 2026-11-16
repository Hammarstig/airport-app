// Notiser: skapas i samma transaktion som händelsen, renderas med en färdig svensk text och skickas
// som Web Push efter commit (om användaren har push på för typen).
import { USER_COLS, userFrom } from './util.js';
import { badgeDef, tierName } from './badges.js';

export const NOTIFICATION_TYPES = ['follow', 'follow_request', 'follow_accepted', 'comment', 'like', 'badge', 'home_visit', 'overtaken',
  'invite_accepted', 'mayor_gained', 'mayor_lost', 'challenge_completed'];
export const PUSH_TYPES = NOTIFICATION_TYPES;
const TIER_SV = { bronze: 'brons', silver: 'silver', gold: 'guld', platinum: 'platina' };

/** Användarens push-inställningar (alla typer på som standard). */
export function pushPrefs(json) {
  let stored = {};
  try { stored = JSON.parse(json || '{}') ?? {}; } catch { /* trasig rad -> standard */ }
  return Object.fromEntries(PUSH_TYPES.map((t) => [t, stored[t] !== false]));
}

// Push-tjänst per databas (sätts av createApp), så att notisfunktionerna inte behöver den som parameter.
const pushServices = new WeakMap();
export function setPushService(db, service) {
  pushServices.set(db, service);
}

const blocked = (db, a, b) => !!db.prepare(`SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?)
  OR (blocker_id = ? AND blocked_id = ?)`).get(a, b, b, a);

/**
 * Skapar en notis. Ingen notis till sig själv eller mellan blockerade. Gilla, följ, förfrågan och
 * overtaken dedupliceras via unikt index. Returnerar notisens id eller null.
 */
export function notify(db, { userId, type, actorId = null, checkinId = null, commentId = null, iata = null,
  badgeId = null, badgeTier = null, groupKey = null, data = null }) {
  if (!NOTIFICATION_TYPES.includes(type)) throw new Error(`Okänd notistyp ${type}`);
  if (!userId || userId === actorId) return null;
  if (actorId && blocked(db, userId, actorId)) return null;
  const info = db.prepare(`INSERT OR IGNORE INTO notifications
    (user_id, type, actor_id, checkin_id, comment_id, iata, badge_id, badge_tier, group_key, data, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(userId, type, actorId, checkinId, commentId, iata, badgeId, badgeTier,
    groupKey, data ? JSON.stringify(data) : null, new Date().toISOString());
  if (!info.changes) return null;
  const id = Number(info.lastInsertRowid);
  pushServices.get(db)?.queue(id);
  return id;
}

/**
 * "Någon checkade in på din hemmaflygplats": till dem med den hemmaflygplatsen som incheckaren följer,
 * som har notisen påslagen och som får se check-in:en (synlighet och fördröjning).
 */
export function notifyHomeVisit(db, { actorId, checkinId, iata }) {
  const c = db.prepare('SELECT visibility, publish_at, created_at FROM checkins WHERE id = ?').get(checkinId);
  if (!c || c.visibility === 'private' || (c.publish_at && c.publish_at > c.created_at)) return;
  const rows = db.prepare(`SELECT u.id FROM follows f JOIN users u ON u.id = f.followee_id
    WHERE f.follower_id = ? AND f.status = 'accepted' AND u.home_iata = ? AND u.notify_home_visits = 1
      AND (? = 'public' OR EXISTS (SELECT 1 FROM follows g WHERE g.follower_id = u.id AND g.followee_id = ? AND g.status = 'accepted'))
      AND (? = 'friends' OR (SELECT is_private FROM users WHERE id = ?) = 0
           OR EXISTS (SELECT 1 FROM follows g WHERE g.follower_id = u.id AND g.followee_id = ? AND g.status = 'accepted'))`)
    .all(actorId, iata, c.visibility, actorId, c.visibility, actorId, actorId);
  for (const r of rows) notify(db, { userId: r.id, type: 'home_visit', actorId, checkinId, iata });
}

export const NOTIFICATION_SELECT = `
  SELECT n.id, n.type, n.checkin_id, n.badge_id, n.badge_tier, n.group_key, n.data, n.read, n.created_at,
         IFNULL(n.iata, c.iata) AS iata, ap.name AS airport_name, me.username AS me_username,
         ${USER_COLS('u', 'u_')}, u.id AS u_id
  FROM notifications n
  JOIN users me ON me.id = n.user_id
  LEFT JOIN users u ON u.id = n.actor_id
  LEFT JOIN checkins c ON c.id = n.checkin_id
  LEFT JOIN airports ap ON ap.iata = IFNULL(n.iata, c.iata)`;

const badgeRef = (id, level) => ({ id, name: badgeDef(id)?.name ?? id, tier: tierName(level) });

export function notificationFrom(row) {
  const actor = row.u_id ? userFrom(row, 'u_') : null;
  const who = actor?.displayName || actor?.username || 'Någon';
  let badges = null;
  let text;
  let url = '/notifications';
  switch (row.type) {
    case 'follow': text = `${who} började följa dig`; url = `/u/${actor?.username}`; break;
    case 'follow_request': text = `${who} vill följa dig`; url = '/settings'; break;
    case 'follow_accepted': text = `${who} godkände din följförfrågan`; url = `/u/${actor?.username}`; break;
    case 'comment': text = `${who} kommenterade din check-in på ${row.iata}`; url = `/c/${row.checkin_id}`; break;
    case 'like': text = `${who} gillade din check-in på ${row.iata}`; url = `/c/${row.checkin_id}`; break;
    case 'home_visit': text = `${who} checkade in på din hemmaflygplats ${row.iata}`; url = `/c/${row.checkin_id}`; break;
    case 'overtaken': text = `${who} gick om dig på veckans topplista`; url = '/leaderboard'; break;
    case 'invite_accepted': text = `${who} gick med via din inbjudan`; url = `/u/${actor?.username}`; break;
    case 'mayor_gained': text = `Du är ny stammis nummer ett på ${row.iata}`; url = `/airport/${row.iata}`; break;
    case 'mayor_lost': text = `${who} tog över stammistiteln på ${row.iata}`; url = `/airport/${row.iata}`; break;
    case 'challenge_completed': {
      let d = {};
      try { d = JSON.parse(row.data || '{}') ?? {}; } catch { d = {}; }
      text = `Du klarade månadsutmaningen ${d.name ?? ''}`.trim();
      url = `/u/${row.me_username}`;
      break;
    }
    case 'badge': {
      let list = [];
      try { list = JSON.parse(row.data || 'null') ?? []; } catch { list = []; }
      badges = list.length ? list.map((b) => badgeRef(b.id, b.tierLevel)) : [badgeRef(row.badge_id, row.badge_tier)];
      text = badges.length === 1
        ? `Du nådde ${TIER_SV[badges[0].tier] ?? badges[0].tier} i ${badges[0].name}`
        : `Du nådde ${badges.length} nya märkesnivåer`;
      url = `/u/${row.me_username}`;
      break;
    }
    default: text = '';
  }
  return {
    id: row.id,
    type: row.type,
    actor,
    checkinId: row.checkin_id ?? null,
    airport: row.iata ? { iata: row.iata, name: row.airport_name } : null,
    badge: badges ? badges[0] : null,
    badges,
    groupKey: row.group_key ?? `${row.type}:${row.id}`,
    url,
    text,
    read: !!row.read,
    createdAt: row.created_at,
  };
}
