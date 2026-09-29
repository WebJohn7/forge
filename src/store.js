// Browser-only. IndexedDB persistence + JSON export/import.

const DB_NAME = 'forge';
const DB_VERSION = 1;
export const STORES = { sessions: 'id', bodyweight: 'date', debts: 'id', moves: 'id', kv: 'key' };

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
  });
}

export const all = (store) => tx(store, 'readonly', (s) => s.getAll());
export const put = (store, value) => tx(store, 'readwrite', (s) => { s.put(value); });
export const putMany = (store, values) => tx(store, 'readwrite', (s) => { values.forEach((v) => s.put(v)); });
export const remove = (store, key) => tx(store, 'readwrite', (s) => { s.delete(key); });
export const clear = (store) => tx(store, 'readwrite', (s) => { s.clear(); });

export async function getKV(key, fallback = null) {
  const row = await tx('kv', 'readonly', (s) => s.get(key));
  return row ? row.value : fallback;
}
export const setKV = (key, value) => put('kv', { key, value });

// Ask the browser not to evict our data (iOS honours this for Home Screen apps).
export async function persist() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}

export async function exportAll() {
  const out = { app: 'forge', version: DB_VERSION, exportedAt: new Date().toISOString() };
  for (const name of Object.keys(STORES)) out[name] = await all(name);
  return out;
}

export async function importAll(data) {
  if (!data || data.app !== 'forge') throw new Error('Not a Forge backup file.');
  for (const name of Object.keys(STORES)) {
    if (!Array.isArray(data[name])) continue;
    await clear(name);
    await putMany(name, data[name]);
  }
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
