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

/** Förhämta bara på snabb uppkoppling utan datasparläge (okänd uppkoppling, t.ex. Safari, räknas som ok). */
function allowed() {
  const c = navigator.connection;
  if (navigator.onLine === false) return false;
  if (!c) return true;
  return !c.saveData && (!c.effectiveType || c.effectiveType === '4g');
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
  // Hovring räknas bara med mus (fin pekare); på touch räcker pointerdown/touchstart.
  const hover = (e) => e.pointerType === 'mouse' && handler(e);
  document.addEventListener('pointerdown', handler, opts);
  document.addEventListener('pointerover', hover, opts);
  document.addEventListener('focusin', handler, opts);
  return () => {
    document.removeEventListener('pointerdown', handler, opts);
    document.removeEventListener('pointerover', hover, opts);
    document.removeEventListener('focusin', handler, opts);
  };
}

/**
 * Kör fn när sidan har laddat klart, minst `delay` ms efter load och när webbläsaren är ledig.
 * Används för förhämtning som aldrig får konkurrera med första laddningen.
 */
export function afterLoadIdle(fn, delay = 3000) {
  let cancelled = false;
  let timer;
  let idleId;
  const idle = () => {
    if (cancelled) return;
    if ('requestIdleCallback' in window) idleId = window.requestIdleCallback(fn, { timeout: 5000 });
    else idleId = setTimeout(fn, 500);
  };
  const start = () => {
    timer = setTimeout(idle, delay);
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
  return () => {
    cancelled = true;
    clearTimeout(timer);
    if ('cancelIdleCallback' in window) window.cancelIdleCallback(idleId);
    else clearTimeout(idleId);
  };
}

// Troligaste nästa steg per sida (bara sidkod, ingen data). Totalt under ca 30 kB gzip per sida
// (kontrolleras av scripts/check-budget.mjs).
const LIKELY_NEXT = [
  [/^\/$/, ['checkin', 'airport']],
  [/^\/airport\//, ['checkin']],
  [/^\/u\//, ['airport']],
  [/^\/(search|explore)/, ['airport']],
  [/^\/checkin$/, ['done']]
];

/** Förhämtar koden för det troligaste nästa steget från den här sidan, om uppkopplingen tillåter. */
export function prefetchLikelyNext(pathname) {
  if (!allowed()) return;
  const hit = LIKELY_NEXT.find(([re]) => re.test(pathname));
  if (hit) for (const page of hit[1]) loaders[page]().catch(() => {});
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

/**
 * Startar sidans dataanrop direkt vid sidladdning, parallellt med att sidans kod laddas, i stället
 * för efter att den kört (sparar en rundresa på LCP). Sidan får samma anrop via api-klienten.
 */
export function primeRoute(pathname) {
  const ignore = () => {};
  let m;
  if ((m = /^\/airport\/([A-Za-z]{3})\/?$/.exec(pathname))) {
    const iata = m[1].toUpperCase();
    api.airport(iata).catch(ignore);
    api.airportCheckins(iata, 20, 0).catch(ignore);
  } else if ((m = /^\/u\/([^/]+)\/?$/.exec(pathname))) {
    api.user(decodeURIComponent(m[1])).catch(ignore);
  }
}
