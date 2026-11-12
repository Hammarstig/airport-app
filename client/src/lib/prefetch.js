import { api } from './api.js';
import { loaders } from '../routes.js';

/**
 * Förhämtning av sidkod och data när användaren pekar på eller börjar trycka på en länk,
 * så att navigeringen kan visa innehåll direkt (data hamnar i api-cachen som sidorna läser via peek).
 */
const RULES = [
  [
    /^\/airport\/([A-Za-z]{3})$/,
    'airport',
    ([iata]) => [api.airport(iata.toUpperCase()), api.airportCheckins(iata.toUpperCase(), 20, 0)]
  ],
  [
    /^\/u\/([^/]+)$/,
    'profile',
    ([u]) => [api.user(decodeURIComponent(u)), api.userAirports(decodeURIComponent(u), 'rating')]
  ],
  [/^\/u\/([^/]+)\/map(\/[A-Za-z]{2})?$/, 'map', () => []],
  [/^\/u\/([^/]+)\/(followers|following)$/, 'follow', () => []],
  [/^\/c\/(\d+)$/, 'checkinDetail', ([id]) => [api.checkin(id)]],
  [/^\/lounge\/(\d+)$/, 'lounge', ([id]) => [api.lounge(id)]],
  [/^\/country\/([A-Za-z]{2})$/, 'country', ([c]) => [api.country(c.toUpperCase())]],
  [/^\/top\//, 'top', () => []],
  [/^\/checkin/, 'checkin', () => []],
  [/^\/search/, 'search', () => []],
  [/^\/explore/, 'search', () => []],
  [/^\/leaderboard/, 'leaderboard', () => []],
  [/^\/notifications/, 'notifications', () => []],
  [/^\/settings/, 'settings', () => []]
];

const recent = new Map();
const TTL = 30 * 1000;

function allowed() {
  const c = navigator.connection;
  return navigator.onLine !== false && !(c && (c.saveData || /2g/.test(c.effectiveType || '')));
}

export function prefetchPath(href) {
  let path;
  try {
    path = new URL(href, window.location.origin).pathname;
  } catch {
    return;
  }
  const now = Date.now();
  if (recent.has(path) && now - recent.get(path) < TTL) return;
  recent.set(path, now);
  if (!allowed()) return;
  for (const [re, page, data] of RULES) {
    const m = path.match(re);
    if (!m) continue;
    loaders[page]().catch(() => recent.delete(path));
    // Data bara om den inte redan finns i cachen; fel ignoreras (sidan hämtar själv och visar felet).
    for (const p of data(m.slice(1))) p.catch(() => {});
    return;
  }
}

/** Lyssnar på pekare och fokus på interna länkar i hela appen. Returnerar avregistrering. */
export function installLinkPrefetch() {
  const handler = (e) => {
    const a = e.target.closest?.('a[href^="/"]');
    if (a && !a.hasAttribute('download')) prefetchPath(a.getAttribute('href'));
  };
  const opts = { capture: true, passive: true };
  document.addEventListener('pointerdown', handler, opts);
  document.addEventListener('mouseover', handler, opts);
  document.addEventListener('focusin', handler, opts);
  return () => {
    document.removeEventListener('pointerdown', handler, opts);
    document.removeEventListener('mouseover', handler, opts);
    document.removeEventListener('focusin', handler, opts);
  };
}

/**
 * Efter att sidan har laddat klart och webbläsaren är ledig: förhämta koden för menyns sidor.
 * Påverkar aldrig första laddningen (startar efter load + requestIdleCallback).
 */
export function afterLoadIdle(fn) {
  let cancelled = false;
  let idleId;
  const idle = () => {
    if (cancelled) return;
    if ('requestIdleCallback' in window) idleId = window.requestIdleCallback(fn, { timeout: 5000 });
    else idleId = setTimeout(fn, 2000);
  };
  if (document.readyState === 'complete') setTimeout(idle, 500);
  else window.addEventListener('load', () => setTimeout(idle, 500), { once: true });
  return () => {
    cancelled = true;
    if ('cancelIdleCallback' in window) window.cancelIdleCallback(idleId);
    else clearTimeout(idleId);
  };
}

export function preloadNavChunks() {
  if (!allowed()) return;
  for (const k of ['checkin', 'search', 'leaderboard', 'profile', 'airport']) loaders[k]().catch(() => {});
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
