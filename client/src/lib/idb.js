// Minimal IndexedDB-wrapper för utkorgen (ingen extern beroende).
const DB_NAME = 'gatelog';
const STORE = 'outbox';
let dbPromise = null;

function open() {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('IndexedDB saknas'));
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const outbox = {
  all: () => tx('readonly', (s) => s.getAll()),
  add: (item) => tx('readwrite', (s) => s.add(item)),
  put: (item) => tx('readwrite', (s) => s.put(item)),
  remove: (id) => tx('readwrite', (s) => s.delete(id))
};
