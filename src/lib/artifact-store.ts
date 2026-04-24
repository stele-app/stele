/**
 * Artifact metadata store.
 *
 * Uses SQLite via @tauri-apps/plugin-sql when running inside Tauri.
 * Falls back to in-memory storage for browser-only dev mode.
 * The external API (subscribe, getArtifacts, etc.) stays the same.
 */

import { getDb } from './db';

export interface Artifact {
  id: string;
  title: string;
  kind: 'jsx' | 'tsx' | 'html' | 'svg' | 'md' | 'mermaid';
  source: string;
  originalName: string;
  importedAt: number;
  lastOpenedAt: number | null;
  openCount: number;
  pinned: boolean;
  sizeBytes: number;
  tags: string[];
  thumbnailDataUrl: string | null;
}

// ── In-memory fallback ──────────────────────────────────────────────

let memArtifacts: Artifact[] = [];

// ── Reactive subscriptions ──────────────────────────────────────────

let listeners: Array<() => void> = [];

function notify() {
  listeners.forEach(fn => fn());
}

export function subscribe(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter(l => l !== fn);
  };
}

// ── SQLite row ↔ Artifact mapping ───────────────────────────────────

interface ArtifactRow {
  id: string;
  title: string;
  kind: string;
  source_path: string;   // We store actual source here (column name is legacy)
  original_name: string;
  imported_at: number;
  last_opened_at: number | null;
  open_count: number;
  pinned: number;         // SQLite boolean
  size_bytes: number;
  tags: string | null;    // JSON array or null
}

function rowToArtifact(row: ArtifactRow): Artifact {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind as Artifact['kind'],
    source: row.source_path,
    originalName: row.original_name,
    importedAt: row.imported_at,
    lastOpenedAt: row.last_opened_at,
    openCount: row.open_count,
    pinned: row.pinned === 1,
    sizeBytes: row.size_bytes,
    tags: row.tags ? JSON.parse(row.tags) : [],
    thumbnailDataUrl: (row as any).thumbnail_path || null,
  };
}

// ── Sort helper ─────────────────────────────────────────────────────

function sortArtifacts(list: Artifact[]): Artifact[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const aTime = a.lastOpenedAt ?? a.importedAt;
    const bTime = b.lastOpenedAt ?? b.importedAt;
    return bTime - aTime;
  });
}

// ── Initialization ──────────────────────────────────────────────────

let dbReady = false;
let initPromise: Promise<void> | null = null;

/**
 * Ensure the DB is loaded and in-memory cache is populated.
 * Safe to call multiple times — only runs once.
 */
async function ensureInit(): Promise<boolean> {
  if (dbReady) return true;
  if (initPromise) {
    await initPromise;
    return dbReady;
  }

  initPromise = (async () => {
    const db = await getDb();
    if (!db) return;

    const rows = await db.select<ArtifactRow[]>(
      'SELECT * FROM artifacts ORDER BY pinned DESC, last_opened_at DESC'
    );
    memArtifacts = rows.map(rowToArtifact);
    dbReady = true;
    notify();
  })();

  await initPromise;
  return dbReady;
}

// Kick off init immediately on module load
ensureInit();

// ── Public API ──────────────────────────────────────────────────────

export function getArtifacts(): Artifact[] {
  return sortArtifacts(memArtifacts);
}

export function getArtifact(id: string): Artifact | undefined {
  return memArtifacts.find(a => a.id === id);
}

export async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function importArtifact(
  source: string,
  filename: string
): Promise<Artifact> {
  await ensureInit();
  const id = await hashContent(source);

  // Check for duplicates
  const existing = memArtifacts.find(a => a.id === id);
  if (existing) {
    existing.lastOpenedAt = Date.now();
    existing.openCount++;
    // Persist update
    const db = await getDb();
    if (db) {
      await db.execute(
        'UPDATE artifacts SET last_opened_at = $1, open_count = $2 WHERE id = $3',
        [existing.lastOpenedAt, existing.openCount, existing.id]
      );
    }
    notify();
    return existing;
  }

  const ext = filename.split('.').pop()?.toLowerCase() || 'jsx';
  const kind = (['jsx', 'tsx', 'html', 'svg', 'md', 'mermaid'].includes(ext) ? ext : 'jsx') as Artifact['kind'];

  const title = filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());

  const now = Date.now();
  const artifact: Artifact = {
    id,
    title,
    kind,
    source,
    originalName: filename,
    importedAt: now,
    lastOpenedAt: now,
    openCount: 1,
    pinned: false,
    sizeBytes: new TextEncoder().encode(source).length,
    tags: [],
    thumbnailDataUrl: null,
  };

  // Persist
  const db = await getDb();
  if (db) {
    await db.execute(
      `INSERT INTO artifacts (id, title, kind, source_path, original_name, imported_at, last_opened_at, open_count, pinned, size_bytes, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        artifact.id, artifact.title, artifact.kind, artifact.source,
        artifact.originalName, artifact.importedAt, artifact.lastOpenedAt,
        artifact.openCount, 0, artifact.sizeBytes, JSON.stringify(artifact.tags),
      ]
    );
  }

  memArtifacts.push(artifact);
  notify();
  return artifact;
}

export function markOpened(id: string) {
  const a = memArtifacts.find(a => a.id === id);
  if (!a) return;

  a.lastOpenedAt = Date.now();
  a.openCount++;
  notify();

  // Persist in background
  getDb().then(db => {
    if (db) {
      db.execute(
        'UPDATE artifacts SET last_opened_at = $1, open_count = $2 WHERE id = $3',
        [a.lastOpenedAt, a.openCount, a.id]
      );
    }
  });
}

export function togglePin(id: string) {
  const a = memArtifacts.find(a => a.id === id);
  if (!a) return;

  a.pinned = !a.pinned;
  notify();

  getDb().then(db => {
    if (db) {
      db.execute(
        'UPDATE artifacts SET pinned = $1 WHERE id = $2',
        [a.pinned ? 1 : 0, a.id]
      );
    }
  });
}

/**
 * Replace the artifact's source text. The ID is a stable handle — it is NOT
 * recomputed from the new content, so storage scope and permission grants
 * keep pointing at the same artifact record.
 */
export function updateSource(id: string, source: string) {
  const a = memArtifacts.find(a => a.id === id);
  if (!a) return;

  a.source = source;
  a.sizeBytes = new TextEncoder().encode(source).length;
  notify();

  getDb().then(db => {
    if (db) {
      db.execute(
        'UPDATE artifacts SET source_path = $1, size_bytes = $2 WHERE id = $3',
        [a.source, a.sizeBytes, a.id]
      );
    }
  });
}

export function updateTitle(id: string, title: string) {
  const a = memArtifacts.find(a => a.id === id);
  if (!a || !title.trim()) return;

  a.title = title.trim();
  notify();

  getDb().then(db => {
    if (db) {
      db.execute('UPDATE artifacts SET title = $1 WHERE id = $2', [a.title, a.id]);
    }
  });
}

export function updateThumbnail(id: string, dataUrl: string) {
  const a = memArtifacts.find(a => a.id === id);
  if (!a) return;

  a.thumbnailDataUrl = dataUrl;
  notify();

  getDb().then(db => {
    if (db) {
      db.execute(
        'UPDATE artifacts SET thumbnail_path = $1 WHERE id = $2',
        [dataUrl, a.id]
      );
    }
  });
}

export function updateTags(id: string, tags: string[]) {
  const a = memArtifacts.find(a => a.id === id);
  if (!a) return;

  a.tags = tags;
  notify();

  getDb().then(db => {
    if (db) {
      db.execute(
        'UPDATE artifacts SET tags = $1 WHERE id = $2',
        [JSON.stringify(tags), a.id]
      );
    }
  });
}

export function deleteArtifact(id: string) {
  memArtifacts = memArtifacts.filter(a => a.id !== id);
  notify();

  getDb().then(db => {
    if (db) {
      db.execute('DELETE FROM artifacts WHERE id = $1', [id]);
    }
  });
}
