/**
 * Host-side postMessage bridge.
 *
 * Listens for RPC calls from the sandbox iframe and dispatches them.
 * Storage is backed by SQLite via @tauri-apps/plugin-sql when available,
 * with an in-memory Map fallback for browser dev mode.
 */

import { getDb } from '../lib/db';

export type BridgeStatus = 'loading' | 'ready' | 'mounted' | 'error';

export interface BridgeCallbacks {
  onStatusChange: (status: BridgeStatus) => void;
  onError: (message: string) => void;
}

// In-memory fallback for when SQLite isn't available
const memoryStorage = new Map<string, string>();

function storageScope(artifactId: string, shared: boolean): string {
  return shared ? '__shared__' : artifactId;
}

async function storageGet(artifactId: string, key: string, shared: boolean) {
  const scope = storageScope(artifactId, shared);
  const db = await getDb();
  if (db) {
    const rows = await db.select<Array<{ value: string }>>(
      'SELECT value FROM storage WHERE artifact_id = $1 AND scope = $2 AND key = $3',
      [artifactId, scope, key]
    );
    if (rows.length > 0) {
      return { key, value: rows[0].value, shared };
    }
    return null;
  }
  // Fallback
  const k = `${scope}::${key}`;
  const value = memoryStorage.get(k);
  return value !== undefined ? { key, value, shared } : null;
}

async function storageSet(artifactId: string, key: string, value: string, shared: boolean) {
  const scope = storageScope(artifactId, shared);
  const db = await getDb();
  if (db) {
    await db.execute(
      `INSERT INTO storage (artifact_id, scope, key, value, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(artifact_id, scope, key) DO UPDATE SET value = $4, updated_at = $5`,
      [artifactId, scope, key, value, Date.now()]
    );
    return;
  }
  memoryStorage.set(`${scope}::${key}`, value);
}

async function storageDelete(artifactId: string, key: string, shared: boolean) {
  const scope = storageScope(artifactId, shared);
  const db = await getDb();
  if (db) {
    await db.execute(
      'DELETE FROM storage WHERE artifact_id = $1 AND scope = $2 AND key = $3',
      [artifactId, scope, key]
    );
    return;
  }
  memoryStorage.delete(`${scope}::${key}`);
}

async function storageList(artifactId: string, prefix: string, shared: boolean) {
  const scope = storageScope(artifactId, shared);
  const db = await getDb();
  if (db) {
    const rows = await db.select<Array<{ key: string; value: string }>>(
      'SELECT key, value FROM storage WHERE artifact_id = $1 AND scope = $2 AND key LIKE $3',
      [artifactId, scope, `${prefix}%`]
    );
    return rows;
  }
  // Fallback
  const entries: Array<{ key: string; value: string }> = [];
  const fullPrefix = `${scope}::${prefix}`;
  for (const [k, v] of memoryStorage) {
    if (k.startsWith(fullPrefix)) {
      entries.push({ key: k.slice(scope.length + 2), value: v });
    }
  }
  return entries;
}

export function attachBridge(
  iframe: HTMLIFrameElement,
  artifactId: string,
  callbacks: BridgeCallbacks
): () => void {
  const handler = async (ev: MessageEvent) => {
    if (ev.source !== iframe.contentWindow) return;
    const msg = ev.data;
    if (!msg || typeof msg.kind !== 'string') return;

    // Status messages from sandbox
    if (msg.kind === 'ready') {
      callbacks.onStatusChange('ready');
      return;
    }
    if (msg.kind === 'mounted') {
      callbacks.onStatusChange('mounted');
      return;
    }
    if (msg.kind === 'error') {
      callbacks.onStatusChange('error');
      callbacks.onError(msg.message || 'Unknown error');
      return;
    }

    // RPC calls from sandbox
    if (msg.kind !== 'rpc') return;

    const reply = (result: unknown, error?: string) => {
      iframe.contentWindow?.postMessage(
        { kind: 'rpc-result', id: msg.id, result, error },
        '*'
      );
    };

    try {
      switch (msg.method) {
        case 'storage.get': {
          const result = await storageGet(artifactId, msg.params.key, msg.params.shared);
          reply(result);
          break;
        }
        case 'storage.set': {
          await storageSet(artifactId, msg.params.key, msg.params.value, msg.params.shared);
          reply(null);
          break;
        }
        case 'storage.delete': {
          await storageDelete(artifactId, msg.params.key, msg.params.shared);
          reply(null);
          break;
        }
        case 'storage.list': {
          const entries = await storageList(artifactId, msg.params.prefix || '', msg.params.shared);
          reply(entries);
          break;
        }
        case 'shell.open': {
          // In Tauri, this uses @tauri-apps/plugin-shell.
          // In dev/browser, fall back to window.open.
          window.open(msg.params.url, '_blank', 'noopener');
          reply(null);
          break;
        }
        default:
          reply(null, `Unknown RPC method: ${msg.method}`);
      }
    } catch (err) {
      reply(null, String(err));
    }
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
