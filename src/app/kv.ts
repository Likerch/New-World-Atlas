// The browser's store for worlds: IndexedDB, which keeps far more than the page's small local storage and takes
// whole objects; where it is missing (a private window in some browsers) the local storage stands in.
const DB = "new-world-atlas";
const STORE = "kv";

let opening: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  if (opening) return opening;
  opening = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

const local = {
  get: <T>(key: string): T | null => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set: (key: string, value: unknown): boolean => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};

export async function kvGet<T>(key: string): Promise<T | null> {
  const db = await open();
  if (!db) return local.get<T>(key);
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE).objectStore(STORE).get(key);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      // A connection the browser closed: what is kept beside it, if anything.
      resolve(local.get<T>(key));
    }
  });
}

/** Writes a value; false when the browser refused (full or blocked). */
export async function kvSet(key: string, value: unknown): Promise<boolean> {
  const db = await open();
  if (!db) return local.set(key, value);
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(value, key);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function kvDelete(key: string): Promise<void> {
  const db = await open();
  if (!db) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to do when storage is blocked.
    }
    return;
  }
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

/** Values the page kept in its local storage before worlds moved to IndexedDB. */
export const legacy = local;
