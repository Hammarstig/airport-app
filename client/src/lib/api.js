import { cacheClear, cacheGet, cacheInvalidate, cacheSet } from './cache.js';
import { forgetRecent, rememberAirports, rememberRecent } from './localAirports.js';

// Access-token (15 min) hålls bara i minnet. Sessionen bärs av refresh-cookien (HttpOnly), och en ny
// token hämtas med POST /api/auth/refresh vid sidladdning och när den gått ut.
const LEGACY_TOKEN_KEY = 'gatelog.token';
const JWT_SHAPE = /^[\w-]+\.[\w-]+\.[\w-]+$/;
let accessToken = null;

// Engångsmigrering: en token som äldre versioner sparade i localStorage flyttas till minnet och tas bort.
try {
  const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacy) {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    if (JWT_SHAPE.test(legacy)) accessToken = legacy;
  }
} catch {
  /* lagring blockerad */
}

export function getToken() {
  return accessToken;
}

function storeToken(token) {
  accessToken = token && JWT_SHAPE.test(token) ? token : null;
}

/** Om en inloggad session väntas (sätts av auth): anrop utan token förnyar först. */
let sessionExpected = false;
export function expectSession(on) {
  sessionExpected = on;
}

/** Byter inloggning (eller loggar ut med null): ny token och tom cache. */
export function setToken(token) {
  storeToken(token);
  sessionExpected = !!token;
  cacheClear();
  if (!token) forgetRecent();
}

const refreshListeners = new Set();
/** Anropas med användaren när sessionen förnyats i bakgrunden. */
export function onRefreshed(fn) {
  refreshListeners.add(fn);
  return () => refreshListeners.delete(fn);
}

let refreshing = null;
/**
 * Förnyar access-token med refresh-cookien (HttpOnly, sätts av servern). Ett anrop i taget;
 * samtidiga förfrågningar väntar på samma förnyelse. Kastar med status 401 om sessionen är slut.
 */
export function refreshSession() {
  refreshing ||= fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' }
  })
    .then(async (r) => {
      if (!r.ok) {
        const e = new Error('Sessionen har gått ut. Logga in igen.');
        e.status = r.status;
        throw e;
      }
      const d = await r.json();
      storeToken(d.token);
      sessionExpected = true;
      refreshListeners.forEach((fn) => fn(d.user));
      return d.token;
    })
    .catch((e) => {
      if (e.status === undefined) throw new Error('Kunde inte nå servern. Kontrollera anslutningen.');
      throw e;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

let unauthorizedHandler = null;
/** Registrerar vad som ska hända när servern svarar 401 (utloggning). Returnerar avregistrering. */
export function onUnauthorized(fn) {
  unauthorizedHandler = fn;
  return () => {
    if (unauthorizedHandler === fn) unauthorizedHandler = null;
  };
}

function qs(params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/**
 * Gör ett API-anrop. invalidate: lista med sökvägsprefix (utan /api) vars cachade GET-svar
 * ska slängas efter ett lyckat skrivande anrop. Utan lista töms inget.
 */
// Pågående GET utan AbortSignal delas, så att data som förhämtas vid sidladdning (primeRoute) och
// sidans eget anrop blir samma nätverksanrop.
const inflight = new Map();

export function request(path, opts = {}) {
  if (opts.method && opts.method !== 'GET') return doRequest(path, opts);
  const key = `${path}${qs(opts.params)}`;
  const shared = inflight.get(key);
  if (shared) return shared;
  const p = doRequest(path, opts);
  if (!opts.signal) {
    inflight.set(key, p);
    const done = () => inflight.delete(key);
    p.then(done, done);
  }
  return p;
}

async function doRequest(path, opts = {}) {
  // Sidladdning: sessionen finns men ingen token i minnet ännu. Hämta en innan anropet (delat löfte).
  if (!accessToken && sessionExpected && !path.startsWith('/auth/')) {
    try {
      await refreshSession();
    } catch (e) {
      if (e.status === undefined) throw e;
      sessionExpected = false;
      if (unauthorizedHandler) unauthorizedHandler();
    }
  }
  try {
    return await send(path, opts);
  } catch (err) {
    // Utgången access-token: förnya sessionen en gång och försök igen. Återkallad session eller
    // misslyckad förnyelse loggar ut.
    if (err.status !== 401 || !err.hadToken || path.startsWith('/auth/')) throw err;
    if (err.code !== 'session_revoked') {
      try {
        await refreshSession();
        return await send(path, opts);
      } catch (e) {
        // Nätverksfel under förnyelsen: behåll inloggningen (offline). Allt annat avslutar sessionen.
        if (e.status === undefined) throw e;
      }
    }
    sessionExpected = false;
    if (unauthorizedHandler) unauthorizedHandler();
    throw err;
  }
}

async function send(path, { method = 'GET', body, params, signal, invalidate } = {}) {
  const url = `/api${path}${qs(params)}`;
  const headers = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      credentials: 'include',
      signal
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error('Kunde inte nå servern. Kontrollera anslutningen.');
  }

  let data = null;
  if (res.status !== 204) {
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Något gick fel (${res.status})`);
    err.status = res.status;
    err.code = data && data.code;
    err.allowed = data && data.allowed;
    err.hadToken = !!token;
    throw err;
  }
  if (method === 'GET') {
    cacheSet(url, data);
    // Spara flygplatser lokalt så att check-in fungerar även efter omstart utan nät.
    if (path === '/me/recent-airports') rememberRecent(data);
    else if (/^\/airports\/[A-Z]{3}$/.test(path)) rememberAirports([data]);
    else if (path === '/airports/nearby') rememberAirports(data);
  } else if (invalidate) cacheInvalidate(invalidate.map((p) => `/api${p}`));
  return data;
}

const enc = encodeURIComponent;

// GET-endpoints som [path, params]. Varje får api.x(...) och api.peek.x(...) (cachat svar eller undefined).
const GETS = {
  me: () => ['/me'],
  searchAirports: (q, limit = 8) => ['/airports', { q, limit }],
  browseAirports: (params) => ['/airports', params],
  airport: (iata) => [`/airports/${enc(iata)}`],
  airportCheckins: (iata, limit = 20, offset = 0) => [`/airports/${enc(iata)}/checkins`, { limit, offset }],
  airlines: (q, limit = 8) => ['/airlines', { q, limit }],
  lounge: (id) => [`/lounges/${enc(id)}`],
  lounges: (params) => ['/lounges', params],
  loungeRankings: (params) => ['/rankings/lounges', params],
  feed: (limit = 20, offset = 0, scope = 'global') => ['/feed', { limit, offset, scope }],
  user: (u) => [`/users/${enc(u)}`],
  users: (q, limit = 20) => ['/users', { q, limit }],
  userAirports: (u, sort) => [`/users/${enc(u)}/airports`, { sort }],
  userCheckins: (u, limit = 20, offset = 0) => [`/users/${enc(u)}/checkins`, { limit, offset }],
  wishlist: (u) => [`/users/${enc(u)}/wishlist`],
  badges: (u) => [`/users/${enc(u)}/badges`],
  userMap: (u, scope) => [`/users/${enc(u)}/map`, { scope }],
  userCountryMap: (u, country, scope) => [`/users/${enc(u)}/map/${enc(country)}`, { scope }],
  leaderboard: (metric, limit = 50) => ['/leaderboard', { metric, limit }],
  airportRankings: (params) => ['/rankings/airports', params],
  countries: (continent) => ['/countries', { continent }],
  country: (code) => [`/countries/${enc(code)}`],
  search: (params) => ['/search', params],
  // v2
  nearbyAirports: (lat, lon, limit = 6) => ['/airports/nearby', { lat: lat.toFixed(4), lon: lon.toFixed(4), limit }],
  recentAirports: (limit = 6) => ['/me/recent-airports', { limit }],
  checkin: (id) => [`/checkins/${enc(id)}`],
  comments: (id) => [`/checkins/${enc(id)}/comments`, { limit: 100 }],
  followers: (u, limit = 50, offset = 0) => [`/users/${enc(u)}/followers`, { limit, offset }],
  following: (u, limit = 50, offset = 0) => [`/users/${enc(u)}/following`, { limit, offset }],
  notifications: (limit = 30, offset = 0) => ['/notifications', { limit, offset }],
  unreadCount: () => ['/notifications/unread-count'],
  userRankings: (params) => ['/rankings/users', params],
  statsCard: (u, year) => [`/users/${enc(u)}/card`, { year }],
  attributions: () => ['/attributions'],
  // v3
  settings: () => ['/me/settings'],
  sessions: () => ['/me/sessions'],
  followRequests: () => ['/me/follow-requests'],
  blocks: () => ['/me/blocks'],
  pushKey: () => ['/push/public-key'],
  moderationReports: (status = 'open') => ['/moderation/reports', { status }],
  // v4
  invites: () => ['/me/invites'],
  invite: (code) => [`/invites/${enc(code)}`],
  suggestions: (limit = 10) => ['/me/suggestions', { limit }],
  regulars: (iata, days = 60) => [`/airports/${enc(iata)}/regulars`, { days }],
  mayorships: (u) => [`/users/${enc(u)}/mayorships`],
  challenges: (u, month) => [`/users/${enc(u)}/challenges`, { month }],
  year: (u, year) => [`/users/${enc(u)}/year/${enc(year)}`],
  imports: () => ['/me/imports']
};

export const api = { peek: {} };
for (const [name, build] of Object.entries(GETS)) {
  api[name] = (...args) => {
    const last = args[args.length - 1];
    const signal = last instanceof AbortSignal ? args.pop() : undefined;
    const [path, params] = build(...args);
    return request(path, { params, signal });
  };
  api.peek[name] = (...args) => {
    const [path, params] = build(...args);
    return cacheGet(`/api${path}${qs(params)}`);
  };
}

// Vad ett skrivande anrop påverkar. Övriga cachade svar uppdateras ändå i bakgrunden (stale-while-revalidate).
const CONTENT = ['/feed', '/airports', '/users', '/leaderboard', '/rankings', '/countries', '/search', '/lounges'];
const ME = ['/me', '/users'];

const write = (method, path, body, invalidate = CONTENT) => request(path, { method, body, invalidate });

Object.assign(api, {
  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  updateMe: (body) => write('PATCH', '/me', body, [...ME, '/leaderboard', '/feed']),
  // Fel lösenord ger 403 (BUG-09).
  deleteMe: (password) => write('DELETE', '/me', { password }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  logoutAll: () => request('/auth/logout-all', { method: 'POST' }),
  revokeSession: (id) => write('DELETE', `/me/sessions/${enc(id)}`, undefined, ['/me/sessions']),
  changePassword: (currentPassword, newPassword) =>
    request('/me/password', { method: 'POST', body: { currentPassword, newPassword } }),
  updateSettings: (body) => write('PATCH', '/me/settings', body, ['/me/settings', ...CONTENT]),
  acceptFollow: (u) => write('POST', `/me/follow-requests/${enc(u)}`, undefined, ['/me/follow-requests', '/users']),
  declineFollow: (u) => write('DELETE', `/me/follow-requests/${enc(u)}`, undefined, ['/me/follow-requests']),
  block: (u) => write('POST', `/users/${enc(u)}/block`, undefined, ['/me/blocks', ...CONTENT]),
  unblock: (u) => write('DELETE', `/users/${enc(u)}/block`, undefined, ['/me/blocks', ...CONTENT]),
  report: (body) => request('/reports', { method: 'POST', body }),
  moderate: (id, action) => write('POST', `/moderation/reports/${enc(id)}`, { action }, ['/moderation', ...CONTENT]),
  pushSubscribe: (sub) => request('/push/subscriptions', { method: 'POST', body: sub }),
  pushUnsubscribe: (endpoint) => request('/push/subscriptions', { method: 'DELETE', body: { endpoint } }),
  follow: (u) => write('POST', `/users/${enc(u)}/follow`, undefined, ['/users', '/feed', '/rankings', '/leaderboard']),
  unfollow: (u) =>
    write('DELETE', `/users/${enc(u)}/follow`, undefined, ['/users', '/feed', '/rankings', '/leaderboard']),
  addComment: (id, body) => write('POST', `/checkins/${enc(id)}/comments`, { body }, [`/checkins/${enc(id)}`]),
  editComment: (cid, body) => write('PATCH', `/comments/${enc(cid)}`, { body }, ['/checkins']),
  deleteComment: (cid) => write('DELETE', `/comments/${enc(cid)}`, undefined, ['/checkins']),
  markRead: (ids) => write('POST', '/notifications/read', ids ? { ids } : {}, ['/notifications']),
  editLoungeReview: (id, body) => write('PATCH', `/lounge-reviews/${enc(id)}`, body, ['/lounges', '/rankings/lounges']),
  deleteLoungeReview: (id) =>
    write('DELETE', `/lounge-reviews/${enc(id)}`, undefined, ['/lounges', '/rankings/lounges']),
  addLounge: (iata, body) =>
    write('POST', `/airports/${enc(iata)}/lounges`, body, [`/airports/${enc(iata)}`, '/lounges']),
  reviewLounge: (id, body) =>
    write('POST', `/lounges/${enc(id)}/reviews`, body, [
      '/lounges',
      '/rankings/lounges',
      '/airports',
      '/search',
      '/users'
    ]),
  createCheckin: (body) => write('POST', '/checkins', body),
  updateCheckin: (id, body) => write('PATCH', `/checkins/${enc(id)}`, body),
  deleteCheckin: (id) => write('DELETE', `/checkins/${enc(id)}`),
  like: (id) => write('POST', `/checkins/${enc(id)}/like`, undefined, []),
  unlike: (id) => write('DELETE', `/checkins/${enc(id)}/like`, undefined, []),
  addWish: (iata) => write('POST', '/wishlist', { iata }, [`/airports/${enc(iata)}`, '/users']),
  removeWish: (iata) => write('DELETE', `/wishlist/${enc(iata)}`, undefined, [`/airports/${enc(iata)}`, '/users']),
  uploadPhoto: (checkinId, blob) => {
    const fd = new FormData();
    fd.append('photo', blob, 'photo.jpg');
    return write('POST', `/checkins/${enc(checkinId)}/photos`, fd, ['/feed', '/airports', '/users']);
  },
  deletePhoto: (id) => write('DELETE', `/photos/${enc(id)}`, undefined, ['/feed', '/airports', '/users']),
  // v4
  createInvite: (maxUses) => write('POST', '/me/invites', maxUses ? { maxUses } : {}, ['/me/invites']),
  deleteInvite: (code) => write('DELETE', `/me/invites/${enc(code)}`, undefined, ['/me/invites']),
  importCsv: (csv, dryRun) =>
    dryRun
      ? request('/me/imports', { method: 'POST', params: { dryRun: 1 }, body: { csv } })
      : write('POST', '/me/imports', { csv }, ['/me', ...CONTENT]),
  deleteImport: (id) => write('DELETE', `/me/imports/${enc(id)}`, undefined, ['/me', ...CONTENT])
});

/** Laddar ner egen data (GET /api/me/export) som fil. */
export async function downloadExport() {
  if (!accessToken) await refreshSession();
  const res = await fetch('/api/me/export', {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include'
  });
  if (!res.ok) throw new Error(`Exporten misslyckades (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: 'gatelog-export.json' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
