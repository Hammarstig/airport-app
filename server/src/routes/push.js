// Web Push: publik VAPID-nyckel och prenumerationer.
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { h, bad, HttpError } from '../util.js';

const MAX_SUBS = 10;

/** Kända push-tjänster (SEC-06). Exakt värd eller suffix som börjar med punkt. */
export const PUSH_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', '.notify.windows.com',
  'web.push.apple.com', '.push.apple.com'];

/**
 * Endpoint måste vara https till en känd push-tjänst på port 443, utan IP-literal, inloggningsdata
 * eller fragment. Hindrar blind SSRF mot interna adresser (SEC-06).
 */
export function validEndpoint(v, hosts = PUSH_HOSTS) {
  if (typeof v !== 'string' || v.length > 1000) return false;
  let u;
  try { u = new URL(v); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || u.hash || (u.port && u.port !== '443')) return false;
  const host = u.hostname.toLowerCase();
  if (/^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return false;
  return hosts.some((h) => (h.startsWith('.') ? host.endsWith(h) && host.length > h.length : host === h));
}

export default function pushRoutes({ db, push, config }) {
  const hosts = [...PUSH_HOSTS, ...(config?.pushExtraHosts ?? [])];
  const r = Router();

  r.get('/push/public-key', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ enabled: !!push?.enabled, publicKey: push?.publicKey ?? null });
  });

  r.post('/push/subscriptions', requireAuth, h((req, res) => {
    const b = req.body ?? {};
    if (!validEndpoint(b.endpoint, hosts)) throw bad('endpoint måste vara en https-adress till en känd push-tjänst');
    const k = b.keys ?? {};
    const b64 = /^[A-Za-z0-9_-]{8,200}={0,2}$/;
    if (!b64.test(k.p256dh ?? '') || !b64.test(k.auth ?? '')) throw bad('keys.p256dh och keys.auth krävs (base64url)');
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ? AND endpoint <> ?').get(req.user.id, b.endpoint);
    if (n >= MAX_SUBS) {
      db.prepare(`DELETE FROM push_subscriptions WHERE id IN (SELECT id FROM push_subscriptions WHERE user_id = ?
        ORDER BY id LIMIT ?)`).run(req.user.id, n - MAX_SUBS + 1);
    }
    // En endpoint hör till en enhet och kopplas till sessionen (SEC-13). Den byter ägare bara när
    // den tidigare ägarens session är utloggad eller har gått ut, aldrig från en aktiv session (SEC-18).
    const cur = db.prepare(`SELECT p.user_id, p.session_id, s.id AS sid FROM push_subscriptions p
      LEFT JOIN sessions s ON s.id = p.session_id AND s.revoked_at IS NULL AND s.expires_at > ?
      WHERE p.endpoint = ?`).get(new Date().toISOString(), b.endpoint);
    if (cur && cur.user_id !== req.user.id && (cur.sid || !cur.session_id)) {
      throw new HttpError(409, 'Enheten tar redan emot notiser för ett annat konto', { code: 'push_endpoint_taken' });
    }
    db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at, session_id) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        failures = 0, session_id = excluded.session_id`)
      .run(req.user.id, b.endpoint, k.p256dh, k.auth, new Date().toISOString(), req.user.sid ?? null);
    res.status(201).json({ endpoint: b.endpoint });
  }));

  r.delete('/push/subscriptions', requireAuth, h((req, res) => {
    const endpoint = req.body?.endpoint;
    if (typeof endpoint !== 'string') throw bad('endpoint krävs');
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(req.user.id, endpoint);
    res.status(204).end();
  }));

  return r;
}
