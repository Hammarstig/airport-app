import { clearQueue } from './offlineQueue.js';
import { api } from './api.js';

// Inställningar för enheten (inte personliga) som får ligga kvar efter utloggning.
const KEEP = new Set(['gatelog.theme']);

const withTimeout = (p, ms) => Promise.race([p, new Promise((resolve) => setTimeout(resolve, ms))]);

/**
 * Avregistrerar push på enheten (och på servern om sessionen fortfarande gäller). Körs före
 * utloggningen så att servern hinner ta bort prenumerationen (SEC-13).
 */
export async function stopPush() {
  try {
    // Ingen väntan på en service worker som inte finns: bara en befintlig registrering räknas.
    const reg = await navigator.serviceWorker?.getRegistration?.();
    const sub = await reg?.pushManager?.getSubscription();
    if (!sub) return;
    if (navigator.onLine)
      await withTimeout(
        api.pushUnsubscribe(sub.endpoint).catch(() => {}),
        2000
      );
    await sub.unsubscribe();
  } catch (e) {
    console.warn('Push kunde inte avregistreras:', e.message);
  }
}

/**
 * Rensar personlig data på enheten vid utloggning (delad enhet, SEC-11): offlinekön, sparad
 * användare och "senaste", sedda flygplatser, dolda förslag och service workerns körtidscache.
 * keepQueue behåller köade poster (de är knutna till sitt konto och skickas bara för det).
 */
export async function wipeLocalData({ keepQueue = false } = {}) {
  if (!keepQueue) await clearQueue();
  for (const store of [globalThis.localStorage, globalThis.sessionStorage]) {
    try {
      for (const key of Object.keys(store)) if (key.startsWith('gatelog.') && !KEEP.has(key)) store.removeItem(key);
    } catch {
      /* lagring avstängd */
    }
  }
  try {
    if (globalThis.caches) {
      for (const key of await caches.keys()) if (!key.startsWith('gatelog-shell-')) await caches.delete(key);
    }
  } catch {
    /* Cache Storage saknas */
  }
}
