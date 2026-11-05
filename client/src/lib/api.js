import { cacheClear, cacheGet, cacheSet } from './cache.js';

const TOKEN_KEY = 'gatelog.token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* lagring blockerad - sessionen gäller bara denna sidvisning */
  }
  cacheClear();
}

function qs(params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export async function request(path, { method = 'GET', body, params, signal } = {}) {
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
    throw err;
  }
  if (method === 'GET') cacheSet(url, data);
  else cacheClear();
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
  search: (params) => ['/search', params]
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

Object.assign(api, {
  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  updateMe: (body) => request('/me', { method: 'PATCH', body }),
  addLounge: (iata, body) => request(`/airports/${enc(iata)}/lounges`, { method: 'POST', body }),
  reviewLounge: (id, body) => request(`/lounges/${enc(id)}/reviews`, { method: 'POST', body }),
  createCheckin: (body) => request('/checkins', { method: 'POST', body }),
  deleteCheckin: (id) => request(`/checkins/${enc(id)}`, { method: 'DELETE' }),
  like: (id) => request(`/checkins/${enc(id)}/like`, { method: 'POST' }),
  unlike: (id) => request(`/checkins/${enc(id)}/like`, { method: 'DELETE' }),
  addWish: (iata) => request('/wishlist', { method: 'POST', body: { iata } }),
  removeWish: (iata) => request(`/wishlist/${enc(iata)}`, { method: 'DELETE' }),
  uploadPhoto: (checkinId, blob) => {
    const fd = new FormData();
    fd.append('photo', blob, 'photo.jpg');
    return request(`/checkins/${enc(checkinId)}/photos`, { method: 'POST', body: fd });
  },
  deletePhoto: (id) => request(`/photos/${enc(id)}`, { method: 'DELETE' })
});
