// Notiser: skapas i samma transaktion som händelsen, renderas med en färdig svensk text.
import { USER_COLS, userFrom } from './util.js';
import { badgeDef, tierName } from './badges.js';

const TIER_SV = { bronze: 'brons', silver: 'silver', gold: 'guld', platinum: 'platina' };

/** Skapar en notis (ingen notis till sig själv). Gilla/följ dedupliceras via unikt index. */
export function notify(db, { userId, type, actorId = null, checkinId = null, commentId = null, iata = null }) {
  if (!userId || userId === actorId) return;
  db.prepare(`INSERT OR IGNORE INTO notifications (user_id, type, actor_id, checkin_id, comment_id, iata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(userId, type, actorId, checkinId, commentId, iata, new Date().toISOString());
}

/** "Någon checkade in på din hemmaflygplats": till dem med den hemmaflygplatsen som incheckaren följer. */
export function notifyHomeVisit(db, { actorId, checkinId, iata }) {
  db.prepare(`INSERT INTO notifications (user_id, type, actor_id, checkin_id, iata, created_at)
    SELECT f.followee_id, 'home_visit', ?, ?, ?, ? FROM follows f JOIN users u ON u.id = f.followee_id
    WHERE f.follower_id = ? AND u.home_iata = ?`).run(actorId, checkinId, iata, new Date().toISOString(), actorId, iata);
}

export const NOTIFICATION_SELECT = `
  SELECT n.id, n.type, n.checkin_id, n.badge_id, n.badge_tier, n.read, n.created_at,
         IFNULL(n.iata, c.iata) AS iata, ap.name AS airport_name,
         ${USER_COLS('u', 'u_')}, u.id AS u_id
  FROM notifications n
  LEFT JOIN users u ON u.id = n.actor_id
  LEFT JOIN checkins c ON c.id = n.checkin_id
  LEFT JOIN airports ap ON ap.iata = IFNULL(n.iata, c.iata)`;

export function notificationFrom(row) {
  const actor = row.u_id ? userFrom(row, 'u_') : null;
  const who = actor?.displayName || actor?.username || 'Någon';
  let badge = null;
  let text;
  switch (row.type) {
    case 'follow': text = `${who} började följa dig`; break;
    case 'comment': text = `${who} kommenterade din check-in på ${row.iata}`; break;
    case 'like': text = `${who} gillade din check-in på ${row.iata}`; break;
    case 'home_visit': text = `${who} checkade in på din hemmaflygplats ${row.iata}`; break;
    case 'badge': {
      const d = badgeDef(row.badge_id);
      const tier = tierName(row.badge_tier);
      badge = { id: row.badge_id, name: d?.name ?? row.badge_id, tier };
      text = `Du nådde ${TIER_SV[tier] ?? tier} i märket ${badge.name}`;
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
    badge,
    text,
    read: !!row.read,
    createdAt: row.created_at,
  };
}
