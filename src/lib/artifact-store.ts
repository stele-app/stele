/**
 * Artifact metadata store.
 *
 * In-memory for now. When running inside Tauri, this swaps to SQLite
 * via @tauri-apps/plugin-sql. The interface stays the same.
 */

export interface Artifact {
  id: string;
  title: string;
  kind: 'jsx' | 'tsx' | 'html' | 'svg' | 'md' | 'mermaid';
  source: string;          // Raw source code (kept in memory for now)
  originalName: string;
  importedAt: number;
  lastOpenedAt: number | null;
  openCount: number;
  pinned: boolean;
  sizeBytes: number;
  tags: string[];
}

// In-memory store
let artifacts: Artifact[] = [];
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

export function getArtifacts(): Artifact[] {
  return [...artifacts].sort((a, b) => {
    // Pinned first, then by last opened / imported
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const aTime = a.lastOpenedAt ?? a.importedAt;
    const bTime = b.lastOpenedAt ?? b.importedAt;
    return bTime - aTime;
  });
}

export function getArtifact(id: string): Artifact | undefined {
  return artifacts.find(a => a.id === id);
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
  const id = await hashContent(source);

  // Check for duplicates
  const existing = artifacts.find(a => a.id === id);
  if (existing) {
    existing.lastOpenedAt = Date.now();
    existing.openCount++;
    notify();
    return existing;
  }

  const ext = filename.split('.').pop()?.toLowerCase() || 'jsx';
  const kind = (['jsx', 'tsx', 'html', 'svg', 'md', 'mermaid'].includes(ext) ? ext : 'jsx') as Artifact['kind'];

  // Derive a title from the filename
  const title = filename
    .replace(/\.[^.]+$/, '')                    // Remove extension
    .replace(/[-_]/g, ' ')                      // Replace separators
    .replace(/([a-z])([A-Z])/g, '$1 $2')        // Split camelCase
    .replace(/\b\w/g, c => c.toUpperCase());     // Title case

  const artifact: Artifact = {
    id,
    title,
    kind,
    source,
    originalName: filename,
    importedAt: Date.now(),
    lastOpenedAt: Date.now(),
    openCount: 1,
    pinned: false,
    sizeBytes: new TextEncoder().encode(source).length,
    tags: [],
  };

  artifacts.push(artifact);
  notify();
  return artifact;
}

export function markOpened(id: string) {
  const a = artifacts.find(a => a.id === id);
  if (a) {
    a.lastOpenedAt = Date.now();
    a.openCount++;
    notify();
  }
}

export function togglePin(id: string) {
  const a = artifacts.find(a => a.id === id);
  if (a) {
    a.pinned = !a.pinned;
    notify();
  }
}

export function deleteArtifact(id: string) {
  artifacts = artifacts.filter(a => a.id !== id);
  notify();
}
