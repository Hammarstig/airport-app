// Kortlivad minnescache för GET-svar (stale-while-revalidate).
// Sidor visar cachat svar direkt vid bakåtnavigering och hämtar om i bakgrunden.

const MAX_AGE = 5 * 60 * 1000;
const MAX_ENTRIES = 150;
const store = new Map();

export function cacheGet(key) {
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() - e.t > MAX_AGE) {
    store.delete(key);
    return undefined;
  }
  return e.data;
}

export function cacheSet(key, data) {
  store.delete(key);
  store.set(key, { data, t: Date.now() });
  if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value);
}

/** Töm cachen efter ändringar (check-in, gilla, profil osv.). */
export function cacheClear() {
  store.clear();
}
