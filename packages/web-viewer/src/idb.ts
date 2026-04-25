/**
 * Tiny IndexedDB wrapper for the web viewer.
 *
 * Object stores:
 *
 * - 'storage'     — value: string. Keys: [artifactId, scope, key].
 *                   `scope` is '__shared__' for window.storage(_, true) entries
 *                   and the artifactId itself otherwise.
 * - 'permissions' — value: { grantedAt: number }. Keys: [artifactId, capability].
 * - 'library'     — value: LibraryEntry. Key: src (URL). Recently-opened
 *                   artifacts the user has visited via /view?src=…, so the
 *                   web viewer can list them like the desktop library.
 *
 * Schema migrations live in the open() onupgradeneeded handler. Bump
 * DB_VERSION + add an `if (event.oldVersion < N)` block when adding stores.
 * All errors surface as rejected promises — callers decide whether to fall
 * back gracefully (the bridge does for storage; consent flow does too).
 */

const DB_NAME = 'stele-web';
const DB_VERSION = 2;
const STORE_STORAGE = 'storage';
const STORE_PERMISSIONS = 'permissions';
const STORE_LIBRARY = 'library';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // v1 stores
      if (!db.objectStoreNames.contains(STORE_STORAGE)) {
        db.createObjectStore(STORE_STORAGE, { keyPath: ['artifactId', 'scope', 'key'] });
      }
      if (!db.objectStoreNames.contains(STORE_PERMISSIONS)) {
        db.createObjectStore(STORE_PERMISSIONS, { keyPath: ['artifactId', 'capability'] });
      }
      // v2 stores
      if (!db.objectStoreNames.contains(STORE_LIBRARY)) {
        const lib = db.createObjectStore(STORE_LIBRARY, { keyPath: 'src' });
        lib.createIndex('lastOpenedAt', 'lastOpenedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Wait for an IDB transaction to commit. */
function txComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ── Storage ───────────────────────────────────────────────────────────

export interface StorageRow {
  artifactId: string;
  scope: string;
  key: string;
  value: string;
}

export async function storageGet(artifactId: string, scope: string, key: string): Promise<string | undefined> {
  const db = await open();
  const tx = db.transaction(STORE_STORAGE, 'readonly');
  const row = await promisify<StorageRow | undefined>(tx.objectStore(STORE_STORAGE).get([artifactId, scope, key]));
  return row?.value;
}

export async function storagePut(artifactId: string, scope: string, key: string, value: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE_STORAGE, 'readwrite');
  tx.objectStore(STORE_STORAGE).put({ artifactId, scope, key, value });
  await txComplete(tx);
}

export async function storageDelete(artifactId: string, scope: string, key: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE_STORAGE, 'readwrite');
  tx.objectStore(STORE_STORAGE).delete([artifactId, scope, key]);
  await txComplete(tx);
}

export async function storageList(artifactId: string, scope: string, prefix: string): Promise<Array<{ key: string; value: string }>> {
  const db = await open();
  const tx = db.transaction(STORE_STORAGE, 'readonly');
  // Bound the cursor to keys that start with [artifactId, scope, prefix...].
  const lower = [artifactId, scope, prefix];
  const upper = [artifactId, scope, prefix + '\uffff'];
  const range = IDBKeyRange.bound(lower, upper);
  const out: Array<{ key: string; value: string }> = [];
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE_STORAGE).openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { resolve(out); return; }
      const row = cursor.value as StorageRow;
      out.push({ key: row.key, value: row.value });
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

// ── Permissions ───────────────────────────────────────────────────────

export interface PermissionRow {
  artifactId: string;
  capability: string;
  grantedAt: number;
}

export async function permissionsGet(artifactId: string): Promise<Set<string>> {
  const db = await open();
  const tx = db.transaction(STORE_PERMISSIONS, 'readonly');
  const range = IDBKeyRange.bound([artifactId], [artifactId, '\uffff']);
  const out = new Set<string>();
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE_PERMISSIONS).openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { resolve(out); return; }
      const row = cursor.value as PermissionRow;
      out.add(row.capability);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function permissionsAdd(artifactId: string, capabilities: string[]): Promise<void> {
  if (capabilities.length === 0) return;
  const db = await open();
  const tx = db.transaction(STORE_PERMISSIONS, 'readwrite');
  const store = tx.objectStore(STORE_PERMISSIONS);
  const now = Date.now();
  for (const c of capabilities) {
    store.put({ artifactId, capability: c, grantedAt: now });
  }
  await txComplete(tx);
}

/** Every (artifactId, capability) row across the whole DB — used by the Settings page. */
export async function permissionsListAll(): Promise<PermissionRow[]> {
  const db = await open();
  const tx = db.transaction(STORE_PERMISSIONS, 'readonly');
  const out: PermissionRow[] = [];
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE_PERMISSIONS).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { resolve(out); return; }
      out.push(cursor.value as PermissionRow);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function permissionsRevoke(artifactId: string, capability: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE_PERMISSIONS, 'readwrite');
  tx.objectStore(STORE_PERMISSIONS).delete([artifactId, capability]);
  await txComplete(tx);
}

/** Wipe a single object store. Used by "Clear library / storage / permissions" in Settings. */
async function clearStore(name: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(name, 'readwrite');
  tx.objectStore(name).clear();
  await txComplete(tx);
}

export const clearLibrary     = () => clearStore(STORE_LIBRARY);
export const clearStorage     = () => clearStore(STORE_STORAGE);
export const clearPermissions = () => clearStore(STORE_PERMISSIONS);

// ── Library ───────────────────────────────────────────────────────────

export interface LibraryEntry {
  /** The URL the artifact was loaded from. Acts as the primary key. */
  src: string;
  /** Display name from the manifest, or a filename fallback. */
  title: string;
  /** Archetype from the manifest, or 'self-contained' if no manifest. */
  archetype: 'self-contained' | 'client-view' | 'paired';
  /** Optional server host string, for client-view entries. */
  serverHost?: string;
  addedAt: number;
  lastOpenedAt: number;
  openCount: number;
}

/**
 * Insert or update a library entry. Bumps lastOpenedAt + openCount on each
 * call; `addedAt` is preserved on existing rows.
 */
export async function libraryUpsert(partial: Omit<LibraryEntry, 'addedAt' | 'lastOpenedAt' | 'openCount'>): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE_LIBRARY, 'readwrite');
  const store = tx.objectStore(STORE_LIBRARY);
  const existing = await promisify<LibraryEntry | undefined>(store.get(partial.src));
  const now = Date.now();
  store.put({
    ...partial,
    addedAt: existing?.addedAt ?? now,
    lastOpenedAt: now,
    openCount: (existing?.openCount ?? 0) + 1,
  } satisfies LibraryEntry);
  await txComplete(tx);
}

/** All library entries, most-recently-opened first. */
export async function libraryList(): Promise<LibraryEntry[]> {
  const db = await open();
  const tx = db.transaction(STORE_LIBRARY, 'readonly');
  const out: LibraryEntry[] = [];
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE_LIBRARY).index('lastOpenedAt').openCursor(null, 'prev');
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { resolve(out); return; }
      out.push(cursor.value as LibraryEntry);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function libraryDelete(src: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE_LIBRARY, 'readwrite');
  tx.objectStore(STORE_LIBRARY).delete(src);
  await txComplete(tx);
}
