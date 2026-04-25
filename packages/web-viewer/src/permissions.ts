/**
 * Capability grant store for the web viewer.
 *
 * Backed by IndexedDB so grants persist across page reloads. Each artifact's
 * grants are also held in an in-memory cache for synchronous reads after the
 * first load. API surface matches the desktop adapter.
 */

import * as idb from './idb';

const cache = new Map<string, Set<string>>();

export async function getGranted(artifactId: string): Promise<Set<string>> {
  const cached = cache.get(artifactId);
  if (cached) return new Set(cached);
  try {
    const grants = await idb.permissionsGet(artifactId);
    cache.set(artifactId, grants);
    return new Set(grants);
  } catch {
    // IndexedDB unavailable (private mode, quota, etc.) — fall back to in-memory only.
    const fallback = new Set<string>();
    cache.set(artifactId, fallback);
    return fallback;
  }
}

export async function grantAll(artifactId: string, capabilityIds: string[]): Promise<void> {
  if (capabilityIds.length === 0) return;
  let s = cache.get(artifactId);
  if (!s) { s = new Set(); cache.set(artifactId, s); }
  for (const c of capabilityIds) s.add(c);
  try {
    await idb.permissionsAdd(artifactId, capabilityIds);
  } catch {
    // Persist failed; cache still has the grant for the session.
  }
}

/**
 * Drop the in-memory cache so the next getGranted re-reads from IDB. Called
 * by the Settings page after revokes / clears so the viewer doesn't serve
 * stale "granted" sets on the next mount.
 */
export function invalidateCache(): void {
  cache.clear();
}
