/**
 * Watched folders service.
 *
 * Monitors directories for new artifact files and auto-imports them.
 * Uses @tauri-apps/plugin-fs watch API with SQLite persistence.
 */

import { watch, readDir, readTextFile } from '@tauri-apps/plugin-fs';
import { getDb } from './db';
import { importArtifact } from './artifact-store';

export interface WatchedFolder {
  path: string;
  addedAt: number;
  enabled: boolean;
}

const SUPPORTED_EXTENSIONS = ['jsx', 'tsx', 'html', 'svg', 'md', 'mermaid'];

// Active watchers — keyed by folder path
const activeWatchers = new Map<string, () => void>();

let listeners: Array<() => void> = [];

function notify() {
  listeners.forEach(fn => fn());
}

export function subscribeWatcher(fn: () => void): () => void {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

// In-memory cache
let folders: WatchedFolder[] = [];

export function getWatchedFolders(): WatchedFolder[] {
  return [...folders];
}

function isArtifactFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_EXTENSIONS.includes(ext);
}

async function importFile(filePath: string, fileName: string) {
  try {
    const source = await readTextFile(filePath);
    await importArtifact(source, fileName);
    console.log(`[watcher] Auto-imported: ${fileName}`);
  } catch (err) {
    console.warn(`[watcher] Failed to import ${fileName}:`, err);
  }
}

async function startWatching(folderPath: string) {
  if (activeWatchers.has(folderPath)) return;

  try {
    const unwatch = await watch(folderPath, async (event) => {
      // Handle new files created in the folder
      const kind = event.type;
      if (typeof kind === 'object' && 'create' in kind) {
        for (const path of event.paths) {
          const fileName = path.split(/[\\/]/).pop() || '';
          if (isArtifactFile(fileName)) {
            // Small delay to let the file finish writing
            setTimeout(() => importFile(path, fileName), 500);
          }
        }
      }
    }, { recursive: false });

    activeWatchers.set(folderPath, unwatch);
    console.log(`[watcher] Watching: ${folderPath}`);
  } catch (err) {
    console.warn(`[watcher] Failed to watch ${folderPath}:`, err);
  }
}

function stopWatching(folderPath: string) {
  const unwatch = activeWatchers.get(folderPath);
  if (unwatch) {
    unwatch();
    activeWatchers.delete(folderPath);
    console.log(`[watcher] Stopped watching: ${folderPath}`);
  }
}

export async function addWatchedFolder(folderPath: string): Promise<WatchedFolder> {
  // Check for duplicate
  if (folders.some(f => f.path === folderPath)) {
    return folders.find(f => f.path === folderPath)!;
  }

  const folder: WatchedFolder = {
    path: folderPath,
    addedAt: Date.now(),
    enabled: true,
  };

  const db = await getDb();
  if (db) {
    await db.execute(
      'INSERT OR IGNORE INTO watched_folders (path, added_at, enabled) VALUES ($1, $2, $3)',
      [folder.path, folder.addedAt, 1]
    );
  }

  folders.push(folder);
  notify();

  // Scan existing files on add
  await scanFolder(folderPath);

  // Start watching
  await startWatching(folderPath);

  return folder;
}

export async function removeWatchedFolder(folderPath: string) {
  stopWatching(folderPath);
  folders = folders.filter(f => f.path !== folderPath);

  const db = await getDb();
  if (db) {
    await db.execute('DELETE FROM watched_folders WHERE path = $1', [folderPath]);
  }
  notify();
}

export async function toggleWatchedFolder(folderPath: string) {
  const folder = folders.find(f => f.path === folderPath);
  if (!folder) return;

  folder.enabled = !folder.enabled;

  if (folder.enabled) {
    await startWatching(folderPath);
  } else {
    stopWatching(folderPath);
  }

  const db = await getDb();
  if (db) {
    await db.execute(
      'UPDATE watched_folders SET enabled = $1 WHERE path = $2',
      [folder.enabled ? 1 : 0, folder.path]
    );
  }
  notify();
}

async function scanFolder(folderPath: string) {
  try {
    const entries = await readDir(folderPath);
    for (const entry of entries) {
      if (entry.isFile && entry.name && isArtifactFile(entry.name)) {
        const filePath = `${folderPath}/${entry.name}`.replace(/\\/g, '/');
        await importFile(filePath, entry.name);
      }
    }
  } catch (err) {
    console.warn(`[watcher] Failed to scan ${folderPath}:`, err);
  }
}

/**
 * Initialize: load watched folders from DB and start watchers.
 */
export async function initWatcher() {
  const db = await getDb();
  if (!db) return;

  try {
    const rows = await db.select<Array<{
      path: string;
      added_at: number;
      enabled: number;
    }>>('SELECT * FROM watched_folders');

    folders = rows.map(r => ({
      path: r.path,
      addedAt: r.added_at,
      enabled: r.enabled === 1,
    }));
    notify();

    // Start watchers for enabled folders
    for (const folder of folders) {
      if (folder.enabled) {
        await startWatching(folder.path);
      }
    }
  } catch (err) {
    console.warn('[watcher] Failed to load watched folders:', err);
  }
}
