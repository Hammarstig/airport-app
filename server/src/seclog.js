// Säkerhetslogg (SEC-14): en JSON-rad per säkerhetshändelse på stdout, med `log: 'security'`.
// Innehåller typ, användar-id, request-id och pseudonymiserad IP (HMAC med månadsvis nyckel,
// plus nät /24 resp. /48). Aldrig lösenord, tokens, cookies eller användarnamn som inte finns.
// Lagringstid styrs av loggmottagaren, rekommenderat 90 dagar (docs/API.md).
import { createHmac } from 'node:crypto';

/** Händelsetyper. `alert: true` ska larma i övervakningen. */
export const SECURITY_EVENTS = {
  login_ok: {}, login_fail: {}, login_blocked: {}, login_delayed: {},
  register: {}, refresh_reuse: { alert: true }, logout: {}, logout_all: {}, session_revoke: {},
  password_change: {}, account_delete: {}, moderation: {}, moderator_role: {}, rate_limited: {},
};

export function ipNet(ip = '') {
  const v = String(ip).replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v)) return v.split('.').slice(0, 3).join('.') + '.0/24';
  if (v.includes(':')) return v.split(':').slice(0, 3).join(':') + '::/48';
  return null;
}

/**
 * Skapar loggaren. `sink` tar emot händelseobjekt (standard console.log som JSON).
 * @returns {(req: object|null, type: string, fields?: object) => void}
 */
export function createSecurityLog({ enabled = true, secret = '', sink } = {}) {
  const out = sink ?? ((e) => console.log(JSON.stringify(e)));
  const ipHash = (ip) => {
    const month = new Date().toISOString().slice(0, 7);
    return createHmac('sha256', `${secret}|seclog|${month}`).update(String(ip)).digest('base64url').slice(0, 16);
  };
  return (req, type, fields = {}) => {
    if (!enabled) return;
    if (!SECURITY_EVENTS[type]) throw new Error(`Okänd säkerhetshändelse ${type}`);
    const ip = req ? (req.ip || req.socket?.remoteAddress || '') : '';
    out({
      t: new Date().toISOString(), log: 'security', level: SECURITY_EVENTS[type].alert ? 'warn' : 'info', type,
      reqId: req?.id ?? null, userId: fields.userId ?? req?.user?.id ?? null,
      ip: ip ? ipHash(ip) : null, net: ip ? ipNet(ip) : null,
      ...(SECURITY_EVENTS[type].alert ? { alert: true } : {}),
      ...Object.fromEntries(Object.entries(fields).filter(([k]) => k !== 'userId')),
    });
  };
}

/** Loggar via appens loggare (req.app.locals.securityLog). */
export function secEvent(req, type, fields) {
  req?.app?.locals?.securityLog?.(req, type, fields);
}
