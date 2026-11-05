import { api } from './api.js';
import { outbox } from './idb.js';

/**
 * Kö för check-ins som görs utan nät. Varje post: { id, body, photos: Blob[], airport, createdAt,
 * attempts, error }. Kön skickas när nätet kommer tillbaka, när appen startar och när fliken blir synlig.
 * Poster som servern avvisar (4xx) ligger kvar med felmeddelande tills användaren tar bort dem.
 */

const listeners = new Set();
let state = { items: [], sending: false };
let flushing = null;

function emit(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

async function refresh() {
  try {
    emit({ items: await outbox.all() });
  } catch (e) {
    console.warn('Offlinekön kunde inte läsas:', e.message);
  }
}

/** Nätverksfel (inte ett svar från servern) betyder att posten ska köas/ligga kvar. */
export const isNetworkError = (e) => e && e.status === undefined && e.name !== 'AbortError';

export async function enqueue({ body, photos = [], airport }) {
  await outbox.add({ body, photos, airport, createdAt: new Date().toISOString(), attempts: 0, error: null });
  await refresh();
  if (navigator.onLine) flush();
}

export async function discard(id) {
  await outbox.remove(id);
  await refresh();
}

async function sendOne(item) {
  const checkin = await api.createCheckin(item.body);
  // Check-in:en finns nu på servern; ta bort ur kön innan foton laddas upp så att den inte skickas två gånger.
  await outbox.remove(item.id);
  for (const blob of item.photos || []) {
    try {
      await api.uploadPhoto(checkin.id, blob);
    } catch (e) {
      console.warn('Foto från offlinekön kunde inte laddas upp:', e.message);
    }
  }
  return checkin;
}

/** Skickar alla köade check-ins i tur och ordning. Returnerar antal skickade. */
export function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    try {
      const items = await outbox.all();
      const pending = items.filter((i) => !i.error);
      if (!pending.length) return 0;
      emit({ sending: true });
      for (const item of pending) {
        try {
          await sendOne(item);
          sent++;
        } catch (e) {
          if (isNetworkError(e) || e.status >= 500 || e.status === 429 || e.status === 401) break;
          await outbox.put({ ...item, attempts: item.attempts + 1, error: e.message });
        }
      }
    } catch (e) {
      console.warn('Offlinekön kunde inte skickas:', e.message);
    } finally {
      flushing = null;
      emit({ sending: false });
      await refresh();
      if (sent) emitSent(sent);
    }
    return sent;
  })();
  return flushing;
}

const sentListeners = new Set();
function emitSent(n) {
  sentListeners.forEach((fn) => fn(n));
}
/** Anropas med antal när köade check-ins har skickats. */
export function onSent(fn) {
  sentListeners.add(fn);
  return () => sentListeners.delete(fn);
}

let started = false;
export function startQueue() {
  if (started || typeof window === 'undefined') return;
  started = true;
  refresh().then(() => navigator.onLine && flush());
  window.addEventListener('online', () => flush());
  document.addEventListener(
    'visibilitychange',
    () => document.visibilityState === 'visible' && navigator.onLine && flush()
  );
}
