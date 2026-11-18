// Web Push (VAPID). Notiser köas efter commit och skickas till användarens prenumerationer.
import webpush from 'web-push';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { NOTIFICATION_SELECT, notificationFrom, pushPrefs } from './notify.js';

/** Läser VAPID-nycklar från config, eller genererar och sparar dem i utveckling. */
export function resolveVapid(cfg, log = console) {
  const v = cfg.vapid;
  if (v.publicKey && v.privateKey) return { publicKey: v.publicKey, privateKey: v.privateKey, subject: v.subject };
  if (cfg.production) {
    log.warn('[gatelog] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY saknas - Web Push är avstängt.');
    return null;
  }
  if (cfg.nodeEnv === 'test') return null;
  try {
    if (existsSync(v.file)) return { ...JSON.parse(readFileSync(v.file, 'utf8')), subject: v.subject };
    const keys = webpush.generateVAPIDKeys();
    mkdirSync(dirname(v.file), { recursive: true });
    writeFileSync(v.file, JSON.stringify(keys), { mode: 0o600 });
    log.warn(`[gatelog] Genererade VAPID-nycklar för utveckling i ${v.file}`);
    return { ...keys, subject: v.subject };
  } catch (e) {
    log.warn(`[gatelog] Kunde inte skapa VAPID-nycklar: ${e.message}`);
    return null;
  }
}

/**
 * @param {object} o
 * @param {import('node:sqlite').DatabaseSync} o.db
 * @param {{publicKey:string, privateKey:string, subject:string}|null} o.vapid
 * @param {(sub:object, payload:string)=>Promise<unknown>} [o.sender] ersätter web-push (tester)
 */
export function createPushService({ db, vapid, sender }) {
  const enabled = !!(vapid || sender);
  const send = sender ?? ((sub, payload) => webpush.sendNotification(sub, payload, {
    TTL: 24 * 3600,
    timeout: 5000,
    vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
  }));
  const pending = new Set();

  async function deliver(notificationId) {
    const row = db.prepare(`${NOTIFICATION_SELECT} WHERE n.id = ?`).get(notificationId);
    if (!row) return; // transaktionen rullades tillbaka eller notisen raderades
    const n = notificationFrom(row);
    const owner = db.prepare('SELECT n.user_id, u.push_prefs FROM notifications n JOIN users u ON u.id = n.user_id WHERE n.id = ?').get(notificationId);
    if (!pushPrefs(owner.push_prefs)[n.type]) return;
    // Bara prenumerationer vars session lever (SEC-13); äldre utan session skickas tills nästa utloggning.
    const subs = db.prepare(`SELECT p.* FROM push_subscriptions p LEFT JOIN sessions s ON s.id = p.session_id
      WHERE p.user_id = ? AND (p.session_id IS NULL OR (s.revoked_at IS NULL AND s.expires_at > ?))`)
      .all(owner.user_id, new Date().toISOString());
    const payload = JSON.stringify({ title: 'Gatelog', body: n.text, url: n.url, tag: n.groupKey, type: n.type, notificationId: n.id });
    await Promise.all(subs.map(async (s) => {
      try {
        await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        if (s.failures) db.prepare('UPDATE push_subscriptions SET failures = 0 WHERE id = ?').run(s.id);
      } catch (e) {
        if (e?.statusCode === 404 || e?.statusCode === 410 || s.failures >= 4) {
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id);
        } else {
          db.prepare('UPDATE push_subscriptions SET failures = failures + 1 WHERE id = ?').run(s.id);
        }
      }
    }));
  }

  return {
    enabled,
    publicKey: vapid?.publicKey ?? null,
    /** Köar en notis; körs efter att aktuell transaktion är klar. */
    queue(notificationId) {
      if (!enabled) return;
      const p = new Promise((resolve) => setImmediate(resolve))
        .then(() => deliver(notificationId))
        .catch((e) => console.error(JSON.stringify({ t: new Date().toISOString(), level: 'error', msg: 'push', error: e?.message })))
        .finally(() => pending.delete(p));
      pending.add(p);
    },
    /** Väntar in köade utskick (tester och nedstängning). */
    async flush() {
      while (pending.size) await Promise.all([...pending]);
    },
  };
}
