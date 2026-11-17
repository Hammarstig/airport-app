import { api } from './api.js';
import { outbox } from './idb.js';

/**
 * Kö för check-ins som görs utan nät. Varje post: { id, owner, body, photos: Blob[], airport, createdAt,
 * attempts, error }. owner är användarnamnet som köade posten: bara den inloggade användarens poster
 * visas och skickas, så att en annan användares kö aldrig publiceras under fel konto (SEC-11).
 * Kön skickas när nätet kommer tillbaka, när appen startar och när fliken blir synlig.
 * Poster som servern avvisar (4xx) ligger kvar med felmeddelande tills användaren tar bort dem.
 */

const listeners = new Set();
let state = { items: [], sending: false };
let flushing = null;
let owner = null;

/** Sätts av inloggningen (null vid utloggning). Styr vilka poster som visas och skickas. */
export function setQueueOwner(username) {
  if (owner === (username || null)) return;
  owner = username || null;
  refresh().then(() => owner && navigator.onLine && flush());
}

const mine = (items) => (owner ? items.filter((i) => i.owner === owner) : []);

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
    emit({ items: mine(await outbox.all()) });
  } catch (e) {
    console.warn('Offlinekön kunde inte läsas:', e.message);
  }
}

/** Nätverksfel (inte ett svar från servern) betyder att posten ska köas/ligga kvar. */
export const isNetworkError = (e) => e && e.status === undefined && e.name !== 'AbortError';

export async function enqueue({ body, photos = [], airport }) {
  if (!owner) throw new Error('Logga in för att köa check-ins.');
  await outbox.add({ owner, body, photos, airport, createdAt: new Date().toISOString(), attempts: 0, error: null });
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

/** Tar bort alla köade poster (alla användare). Används vid utloggning på delad enhet. */
export async function clearQueue() {
  try {
    await outbox.clear();
  } catch (e) {
    console.warn('Offlinekön kunde inte tömmas:', e.message);
  }
  await refresh();
}

// Lås över flikar (Web Locks) så att två flikar inte skickar samma post samtidigt.
const withLock = (fn) =>
  navigator.locks?.request ? navigator.locks.request('gatelog-outbox', fn) : Promise.resolve().then(fn);

/** Skickar den inloggade användarens köade check-ins i tur och ordning. Returnerar antal skickade. */
export function flush() {
  if (flushing) return flushing;
  const who = owner;
  if (!who) return Promise.resolve(0);
  flushing = (async () => {
    let sent = 0;
    try {
      await withLock(async () => {
        const items = await outbox.all();
        const pending = items.filter((i) => i.owner === who && !i.error);
        if (!pending.length) return;
        emit({ sending: true });
        for (const item of pending) {
          // Utloggad eller annan användare mitt i: sluta direkt.
          if (owner !== who) break;
          // Posten kan ha skickats av en annan flik medan vi väntade på låset.
          const current = (await outbox.all()).find((i) => i.id === item.id);
          if (!current) continue;
          try {
            await sendOne(item);
            sent++;
          } catch (e) {
            if (isNetworkError(e) || e.status >= 500 || e.status === 429 || e.status === 401) break;
            await outbox.put({ ...item, attempts: item.attempts + 1, error: e.message });
          }
        }
      });
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
  refresh().then(() => owner && navigator.onLine && flush());
  window.addEventListener('online', () => flush());
  document.addEventListener(
    'visibilitychange',
    () => document.visibilityState === 'visible' && navigator.onLine && flush()
  );
}
