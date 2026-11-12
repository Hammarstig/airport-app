// Web Push: publik VAPID-nyckel och prenumerationer.
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { h, bad } from '../util.js';

const MAX_SUBS = 10;

function validEndpoint(v) {
  if (typeof v !== 'string' || v.length > 1000) return false;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}

export default function pushRoutes({ db, push }) {
  const r = Router();

  r.get('/push/public-key', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ enabled: !!push?.enabled, publicKey: push?.publicKey ?? null });
  });

  r.post('/push/subscriptions', requireAuth, h((req, res) => {
    const b = req.body ?? {};
    if (!validEndpoint(b.endpoint)) throw bad('endpoint måste vara en https-adress');
    const k = b.keys ?? {};
    const b64 = /^[A-Za-z0-9_-]{8,200}={0,2}$/;
    if (!b64.test(k.p256dh ?? '') || !b64.test(k.auth ?? '')) throw bad('keys.p256dh och keys.auth krävs (base64url)');
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ? AND endpoint <> ?').get(req.user.id, b.endpoint);
    if (n >= MAX_SUBS) {
      db.prepare(`DELETE FROM push_subscriptions WHERE id IN (SELECT id FROM push_subscriptions WHERE user_id = ?
        ORDER BY id LIMIT ?)`).run(req.user.id, n - MAX_SUBS + 1);
    }
    // En endpoint hör till en enhet; byter den användare tas den över.
    db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, failures = 0`)
      .run(req.user.id, b.endpoint, k.p256dh, k.auth, new Date().toISOString());
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
