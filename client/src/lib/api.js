import { cacheClear, cacheGet, cacheInvalidate, cacheSet } from './cache.js';
import { forgetRecent, rememberAirports, rememberRecent } from './localAirports.js';

const TOKEN_KEY = 'gatelog.token';

const JWT_SHAPE = /^[\w-]+\.[\w-]+\.[\w-]+$/;

/** Sparad token, eller null. En token som inte ens ser ut som en JWT rensas direkt. */
export function getToken() {
  let t = null;
  try {
    t = localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
  if (t && !JWT_SHAPE.test(t)) {
    setToken(null);
    return null;
  }
  return t;
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* lagring blockerad - sessionen gäller bara denna sidvisning */
  }
  cacheClear();
  if (!token) forgetRecent();
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
export async function request(path, { method = 'GET', body, params, signal, invalidate, logoutOn401 = true } = {}) {
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
    if (res.status === 401 && logoutOn401 && token && !path.startsWith('/auth/') && unauthorizedHandler)
      unauthorizedHandler();
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
  attributions: () => ['/attributions']
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
  // 401 betyder här fel lösenord, inte utgången session (BUG-09).
  deleteMe: (password) =>
    request('/me', { method: 'DELETE', body: { password }, invalidate: CONTENT, logoutOn401: false }),
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
  deletePhoto: (id) => write('DELETE', `/photos/${enc(id)}`, undefined, ['/feed', '/airports', '/users'])
});

/** Laddar ner egen data (GET /api/me/export) som fil. */
export async function downloadExport() {
  const res = await fetch('/api/me/export', { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error(`Exporten misslyckades (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: 'gatelog-export.json' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
