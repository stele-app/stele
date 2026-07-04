/**
 * Cloud-library sync between the local IndexedDB `library` store and Arcade.
 *
 * Model: last-write-wins by `lastOpenedAt`, union of both sides. Cheap and
 * correct-enough for a personal library; a real merge/CRDT is overkill here.
 *
 * `local:` artifacts are skipped in both directions — their source lives only
 * in this browser, so a cloud reference would dangle on another device.
 *
 * All calls no-op silently when Arcade is unconfigured or signed out, so the
 * anonymous viewer path is never affected.
 */

import { getStoredToken, clearStoredAuth } from './auth';
import { ARCADE_API_URL, ArcadeError, getLibrary, putLibraryEntry, type Archetype } from './arcade';
import { libraryList, libraryPutRaw, LOCAL_SCHEME, type LibraryEntry } from './idb';

interface MirrorEntry {
  src: string;
  title: string;
  archetype: Archetype;
  serverHost?: string;
}

/** On a 401 the session is dead — drop it so the UI shows signed-out. */
function handleAuthError(e: unknown): void {
  if (e instanceof ArcadeError && e.status === 401) clearStoredAuth();
}

/**
 * Mirror one just-opened entry up to the cloud. Best-effort: never throws,
 * no-ops when unconfigured / signed out / a `local:` artifact.
 */
export async function mirrorUp(entry: MirrorEntry): Promise<void> {
  if (!ARCADE_API_URL || entry.src.startsWith(LOCAL_SCHEME)) return;
  const token = getStoredToken();
  if (!token) return;
  try {
    await putLibraryEntry(token, {
      artifactRef: entry.src,
      title: entry.title,
      archetype: entry.archetype,
      serverHost: entry.serverHost,
    });
  } catch (e) {
    handleAuthError(e);
    // Otherwise swallow — mirroring is best-effort.
  }
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}

/**
 * Two-way sync. Pushes local entries the cloud is missing or older on, and
 * writes down cloud entries the local store is missing or older on (preserving
 * the cloud timestamps via libraryPutRaw). Returns null when unconfigured /
 * signed out; throws on a real API failure (caller shows an error).
 */
export async function syncLibrary(): Promise<SyncResult | null> {
  if (!ARCADE_API_URL) return null;
  const token = getStoredToken();
  if (!token) return null;

  try {
    const local = (await libraryList()).filter((e) => !e.src.startsWith(LOCAL_SCHEME));
    const localBySrc = new Map<string, LibraryEntry>(local.map((e) => [e.src, e]));

    const cloud = (await getLibrary(token)).filter((c) => !c.artifactRef.startsWith(LOCAL_SCHEME));
    const cloudByRef = new Map(cloud.map((c) => [c.artifactRef, c]));

    // Pull: cloud entries we don't have, or that are newer than ours.
    let pulled = 0;
    for (const c of cloud) {
      const l = localBySrc.get(c.artifactRef);
      if (!l || c.lastOpenedAt > l.lastOpenedAt) {
        await libraryPutRaw({
          src: c.artifactRef,
          title: c.title,
          archetype: c.archetype,
          serverHost: c.serverHost,
          addedAt: c.addedAt,
          lastOpenedAt: c.lastOpenedAt,
          openCount: c.openCount,
        });
        pulled++;
      }
    }

    // Push: local entries the cloud is missing, or that are newer than the cloud's.
    let pushed = 0;
    for (const l of local) {
      const c = cloudByRef.get(l.src);
      if (!c || l.lastOpenedAt > c.lastOpenedAt) {
        await putLibraryEntry(token, {
          artifactRef: l.src,
          title: l.title,
          archetype: l.archetype,
          serverHost: l.serverHost,
        });
        pushed++;
      }
    }

    return { pushed, pulled };
  } catch (e) {
    handleAuthError(e);
    throw e;
  }
}
