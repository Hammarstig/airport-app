// Stammisar per flygplats ("Borgmästare"): flest synliga check-ins de senaste dagarna.
// Räknas bara på check-ins som alla får se, så att titeln inte avslöjar dolda resor.
import { notify } from './notify.js';
import { todayStockholm } from './badges.js';

export const MAYOR_DAYS = 60;
export const MAYOR_MIN_CHECKINS = 2;

const sinceDate = (days) => new Date(Date.parse(todayStockholm() + 'T00:00:00Z') - (days - 1) * 86400_000).toISOString().slice(0, 10);

/** Rader { user_id, checkins, last_visit } sorterade, för publika check-ins inom `days` dagar. */
export function regulars(db, iata, { days = MAYOR_DAYS, limit = 10 } = {}) {
  return db.prepare(`SELECT c.user_id, COUNT(*) AS checkins, MAX(c.visited_on) AS last_visit
    FROM checkins c JOIN users u ON u.id = c.user_id
    WHERE c.iata = ? AND c.visited_on >= ? AND c.visibility = 'public' AND u.is_private = 0
      AND IFNULL(c.publish_at, c.created_at) <= ?
    GROUP BY c.user_id ORDER BY checkins DESC, last_visit DESC, c.user_id LIMIT ?`)
    .all(iata, sinceDate(days), new Date().toISOString(), limit);
}

/**
 * Räknar om stammis nummer ett efter en check-in. Vid lika behåller nuvarande titeln.
 * Skapar notiserna mayor_gained och mayor_lost vid byte.
 */
export function updateMayor(db, iata) {
  const top = regulars(db, iata, { limit: 2 });
  const cur = db.prepare('SELECT * FROM airport_mayors WHERE iata = ?').get(iata);
  const leader = top[0];
  if (!leader || leader.checkins < MAYOR_MIN_CHECKINS) {
    if (cur) db.prepare('DELETE FROM airport_mayors WHERE iata = ?').run(iata);
    return;
  }
  if (cur && cur.user_id === leader.user_id) {
    db.prepare('UPDATE airport_mayors SET checkins = ? WHERE iata = ?').run(leader.checkins, iata);
    return;
  }
  if (cur) {
    const curCount = top.find((x) => x.user_id === cur.user_id)?.checkins
      ?? regulars(db, iata, { limit: 1000 }).find((x) => x.user_id === cur.user_id)?.checkins ?? 0;
    if (curCount >= leader.checkins) return; // lika: titeln stannar
  }
  db.prepare(`INSERT INTO airport_mayors (iata, user_id, checkins, since) VALUES (?, ?, ?, ?)
    ON CONFLICT(iata) DO UPDATE SET user_id = excluded.user_id, checkins = excluded.checkins, since = excluded.since`)
    .run(iata, leader.user_id, leader.checkins, new Date().toISOString());
  notify(db, { userId: leader.user_id, type: 'mayor_gained', iata, groupKey: `mayor:${iata}:${Date.now()}` });
  if (cur) notify(db, { userId: cur.user_id, type: 'mayor_lost', actorId: leader.user_id, iata, groupKey: `mayor:${iata}:${Date.now()}` });
}
