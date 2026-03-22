/**
 * IndexedDB-based store for passing File objects between pages.
 * Navigation state can't reliably hold File objects, so we stash
 * them here and retrieve on the destination page.
 */

const DB_NAME = "rotovide_pending";
const STORE_NAME = "files";
const DB_VERSION = 1;
const TTL_MS = 30 * 60 * 1000; // 30 minutes

interface PendingEntry {
  file: File;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function storePendingFile(key: string, file: File): Promise<void> {
  const db = await openDB();
  const entry: PendingEntry = { file, createdAt: Date.now() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(entry, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingFile(key: string): Promise<File | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => {
      const result = req.result;
      if (!result) return resolve(null);

      // Handle raw File (legacy) or PendingEntry with TTL
      if (result instanceof File) return resolve(result);

      const entry = result as PendingEntry;
      if (!entry.file || !(entry.file instanceof File)) return resolve(null);

      // Check TTL — expire after 30 minutes
      if (Date.now() - entry.createdAt > TTL_MS) {
        // Auto-clear expired entry
        clearPendingFile(key).catch(() => {});
        return resolve(null);
      }

      resolve(entry.file);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearPendingFile(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
